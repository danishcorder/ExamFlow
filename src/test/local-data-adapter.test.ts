import { describe, expect, it } from 'vitest';
import { createLocalRepository, type StorageAdapter } from '../lib/local-repository';
import { createLocalDataAdapter } from '../lib/local-data-adapter';

class MemoryStorage implements StorageAdapter {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('localDataAdapter end-to-end workflows', () => {
  it('supports academics, question bank, exam builder, student attempt, proctoring, grading, and reports locally', async () => {
    const repo = createLocalRepository(new MemoryStorage());
    const adapter = createLocalDataAdapter(repo);
    const workspace = await adapter.getInstitutionWorkspace({ institutionId: 'inst-sample' });
    const instId = workspace.institution.id;

    // 1. Academics CRUD
    const dept = await adapter.createDepartment({
      institutionId: instId,
      name: 'Physics',
      code: 'PHY',
      description: 'Physical Sciences',
      headMembershipId: null,
    });
    expect(dept.name).toBe('Physics');

    const course = await adapter.createCourse({
      institutionId: instId,
      code: 'PHY-101',
      title: 'Mechanics',
      credits: 4,
      departmentId: dept.id,
      programId: null,
      classId: null,
    });
    expect(course.code).toBe('PHY-101');

    // 2. Question Bank create + list
    const mcq = await adapter.createQuestion({
      institutionId: instId,
      courseId: course.id,
      questionType: 'mcq_single',
      title: 'SI Unit of Force',
      prompt: 'Which unit measures force in SI?',
      topic: 'Units',
      category: 'Mechanics',
      difficulty: 'easy',
      marks: 2,
      negativeMarks: 0.5,
      status: 'active',
      options: [
        { optionKey: 'A', optionText: 'Joule', sortOrder: 1 },
        { optionKey: 'B', optionText: 'Newton', sortOrder: 2 },
      ],
      correctOptionKeys: ['B'],
    });
    const desc = await adapter.createQuestion({
      institutionId: instId,
      courseId: course.id,
      questionType: 'descriptive',
      title: 'Inertia definition',
      prompt: 'Explain Newton first law of motion.',
      topic: 'Laws',
      category: 'Theory',
      difficulty: 'medium',
      marks: 4,
      negativeMarks: 0,
      status: 'active',
      expectedWordCount: 50,
    });

    // 3. Exam Builder: draft -> section -> add questions -> assign student -> preview -> publish
    const now = Date.now();
    const draft = await adapter.createExamDraft({
      institutionId: instId,
      title: 'Physics Midterm Local',
      courseId: course.id,
      durationMinutes: 45,
      startsAt: new Date(now - 5 * 60_000).toISOString(),
      endsAt: new Date(now + 60 * 60_000).toISOString(),
      passingPercentage: 50,
      negativeMarkingEnabled: true,
      defaultNegativeMarks: 0.5,
      shuffleQuestions: false,
      shuffleOptions: false,
    });
    const withSection = await adapter.addExamSection({
      institutionId: instId,
      examId: draft.exam.id,
      title: 'Section A',
      sectionType: 'mixed',
      shuffleQuestions: false,
    });
    const sectionId = withSection.sections[0]!.id;

    await adapter.addQuestionsToExamSection({
      institutionId: instId,
      examId: draft.exam.id,
      sectionId,
      questionIds: [mcq.id, desc.id],
    });

    const studentsRes = await adapter.listStudents({ institutionId: instId, page: 1, pageSize: 20 });
    const targetStudentId = studentsRes.items[0]!.id;
    await adapter.setExamAssignments({
      institutionId: instId,
      examId: draft.exam.id,
      classIds: [],
      sectionIds: [],
      studentIds: [targetStudentId],
    });

    const studentPreview = await adapter.previewExam({
      institutionId: instId,
      examId: draft.exam.id,
      mode: 'student',
    });
    expect(studentPreview.sections[0]?.questions[0]?.educatorAnswerKey).toBeUndefined();

    const educatorPreview = await adapter.previewExam({
      institutionId: instId,
      examId: draft.exam.id,
      mode: 'educator',
    });
    expect(educatorPreview.sections[0]?.questions[0]?.educatorAnswerKey?.correct_option_keys).toEqual(['B']);

    const published = await adapter.publishExam({
      institutionId: instId,
      examId: draft.exam.id,
    });
    expect(published.exam.status).toBe('published');

    // 4. Student Exam Engine: lobby -> start -> save -> proctoring event -> submit
    const studentDash = await adapter.getStudentExamDashboard({ institutionId: instId });
    expect(studentDash.exams.some((e) => e.examId === draft.exam.id && e.bucket === 'active')).toBe(true);

    const session = await adapter.startOrResumeExamAttempt({
      institutionId: instId,
      examId: draft.exam.id,
    });
    expect(session.attempt.status).toBe('in_progress');
    expect(session.sections[0]?.questions).toHaveLength(2);

    await adapter.saveExamAttemptAnswer({
      institutionId: instId,
      attemptId: session.attempt.id,
      questionId: mcq.id,
      selectedOptionKeys: ['B'],
    });
    await adapter.saveExamAttemptAnswer({
      institutionId: instId,
      attemptId: session.attempt.id,
      questionId: desc.id,
      descriptiveText: 'An object keeps its state unless acted upon by a net force.',
    });

    await adapter.recordProctoringEvent({
      institutionId: instId,
      attemptId: session.attempt.id,
      studentId: session.attempt.studentId,
      eventType: 'tab_visibility_hidden',
      severity: 'warning',
      details: { source: 'test' },
    });

    const submitted = await adapter.submitExamAttempt({
      institutionId: instId,
      attemptId: session.attempt.id,
      reason: 'manual',
    });
    expect(submitted.attempt.status).toBe('submitted');

    // 5. Unpublished grades stay hidden from students
    const unreleasedReport = await adapter.getStudentResultReport({
      institutionId: instId,
      examId: draft.exam.id,
    });
    expect(unreleasedReport).toBeNull();

    // 6. Invigilator reviews proctoring incident
    const invig = await adapter.getInvigilatorDashboard({
      institutionId: instId,
      examId: draft.exam.id,
    });
    expect(invig.attempts).toHaveLength(1);
    expect(invig.attempts[0]!.eventCount).toBe(1);
    await adapter.saveAttemptReview({
      institutionId: instId,
      attemptId: session.attempt.id,
      reviewStatus: 'cleared',
      reviewNotes: 'Brief tab switch verified.',
    });

    // 7. Teacher grades descriptive question, publishes, and student sees report card
    const gradingDash = await adapter.getTeacherExamGradingDashboard({
      institutionId: instId,
      examId: draft.exam.id,
    });
    expect(gradingDash.summary.submittedCount).toBe(1);

    await adapter.saveManualQuestionGrade({
      institutionId: instId,
      attemptId: session.attempt.id,
      questionId: desc.id,
      awardedMarks: 3,
      teacherFeedback: 'Clear explanation of inertia.',
    });

    const pubCount = await adapter.publishExamResults({
      institutionId: instId,
      examId: draft.exam.id,
    });
    expect(pubCount).toBe(1);

    const releasedReport = await adapter.getStudentResultReport({
      institutionId: instId,
      examId: draft.exam.id,
    });
    expect(releasedReport).not.toBeNull();
    expect(releasedReport?.totalAwardedMarks).toBe(5);
    expect(releasedReport?.isPassing).toBe(true);

    const analytics = await adapter.getExamAnalytics({
      institutionId: instId,
      examId: draft.exam.id,
    });
    expect(analytics.questionStats).toHaveLength(2);

    const audit = await adapter.searchAuditLogs({
      institutionId: instId,
      search: 'exam.',
      page: 1,
      pageSize: 20,
    });
    expect(audit.items.length).toBeGreaterThan(0);
  });
});
