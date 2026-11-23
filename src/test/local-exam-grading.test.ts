import { describe, expect, it } from 'vitest';
import {
  applyLocalManualGrade,
  gradeLocalExam,
  saveLocalQuestionGrade,
} from '../lib/local-exam-grading';

const exam = { id: 'exam-1', questionIds: ['q1', 'q2'], passingPercentage: 50 };
const questions = [
  { id: 'q1', questionType: 'mcq_single' as const, marks: 2, negativeMarks: 0.5, correctOptionKeys: ['B'] },
  { id: 'q2', questionType: 'descriptive' as const, marks: 4, negativeMarks: 0, correctOptionKeys: [] },
];

describe('local exam grading', () => {
  it('grades MCQs automatically and leaves written answers for manual grading', () => {
    const grade = gradeLocalExam(exam, questions, {
      q1: { selectedOptionKeys: ['B'], descriptiveText: null },
      q2: { selectedOptionKeys: [], descriptiveText: 'A written response' },
    }, 'attempt-1', 'student-1');
    expect(grade.questionGrades['q1']?.awardedMarks).toBe(2);
    expect(grade.questionGrades['q1']?.isCorrect).toBe(true);
    expect(grade.questionGrades['q2']?.pendingManual).toBe(true);
    expect(grade.status).toBe('draft');
  });

  it('tracks negative marking deductions on incorrect MCQs and evaluates passingMarks', () => {
    const wrongGrade = gradeLocalExam(
      { ...exam, passingMarks: 4 },
      questions,
      {
        q1: { selectedOptionKeys: ['A'], descriptiveText: null },
        q2: { selectedOptionKeys: [], descriptiveText: 'Partial work' },
      },
      'attempt-neg',
      'student-1',
    );
    expect(wrongGrade.questionGrades['q1']?.isCorrect).toBe(false);
    expect(wrongGrade.questionGrades['q1']?.negativeDeduction).toBe(0.5);

    const moderated = saveLocalQuestionGrade(wrongGrade, 'q2', 3, 'Good structure');
    expect(moderated.status).toBe('moderated');
    expect(moderated.totalAwardedMarks).toBe(3);
    expect(moderated.isPassing).toBe(false);
  });

  it('accepts a bounded manual mark and completes the result', () => {
    const draft = gradeLocalExam(exam, questions, {
      q1: { selectedOptionKeys: ['A'], descriptiveText: null },
      q2: { selectedOptionKeys: [], descriptiveText: 'A written response' },
    }, 'attempt-2', 'student-1');
    const result = applyLocalManualGrade(draft, 'q2', 3, 'Clear explanation.');
    expect(result.totalAwardedMarks).toBe(3);
    expect(result.percentage).toBe(50);
    expect(result.status).toBe('published');
    expect(result.questionGrades['q2']?.feedback).toBe('Clear explanation.');
    expect(() => applyLocalManualGrade(draft, 'q2', 5, null)).toThrow(RangeError);
  });
});
