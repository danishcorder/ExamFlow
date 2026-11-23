import { AUTH_MODE } from './auth-mode';
import * as academicFunctions from './academic.functions';
import * as auditFunctions from './audit.functions';
import * as examEngineFunctions from './exam-engine.functions';
import * as examsFunctions from './exams.functions';
import * as gradingFunctions from './grading.functions';
import * as proctoringFunctions from './proctoring.functions';
import * as questionBankFunctions from './question-bank.functions';
import * as reportsFunctions from './reports.functions';
import * as workspaceFunctions from './workspace.functions';
import { localDataAdapter } from './local-data-adapter';

type RepoArgs<TData> = {
  data: TData;
  headers?: Record<string, string> | undefined;
};

type ServerArgs<TData> = {
  data: TData;
  headers?: Record<string, string>;
};

function withLocalOrServer<TData, TResult>(
  serverFn: (args: ServerArgs<TData>) => Promise<TResult>,
  localFn: (data: TData) => Promise<TResult>,
) {
  return async (args: RepoArgs<TData>): Promise<TResult> => {
    if (AUTH_MODE === 'none') {
      return localFn(args.data);
    }
    return serverFn(args.headers ? { data: args.data, headers: args.headers } : { data: args.data });
  };
}

export const dataRepository = {
  // Workspace
  getInstitutionWorkspace: withLocalOrServer(
    (args) => workspaceFunctions.getInstitutionWorkspaceFn(args),
    localDataAdapter.getInstitutionWorkspace,
  ),

  // Reports & Audit
  getReportsOverview: withLocalOrServer(
    (args) => reportsFunctions.getReportsOverviewFn(args),
    localDataAdapter.getReportsOverview,
  ),

  searchAuditLogs: withLocalOrServer(
    (args) => auditFunctions.searchAuditLogsFn(args),
    localDataAdapter.searchAuditLogs,
  ),

  // Academics, Teachers & Students
  getAcademicCatalog: withLocalOrServer(
    (args) => academicFunctions.getAcademicCatalogFn(args),
    localDataAdapter.getAcademicCatalog,
  ),

  createAcademicSession: withLocalOrServer(
    (args) => academicFunctions.createAcademicSessionFn(args),
    localDataAdapter.createAcademicSession,
  ),

  setCurrentAcademicSession: withLocalOrServer(
    (args) => academicFunctions.setCurrentAcademicSessionFn(args),
    localDataAdapter.setCurrentAcademicSession,
  ),

  deleteAcademicSession: withLocalOrServer(
    (args) => academicFunctions.deleteAcademicSessionFn(args),
    localDataAdapter.deleteAcademicSession,
  ),

  createAcademicTerm: withLocalOrServer(
    (args) => academicFunctions.createAcademicTermFn(args),
    localDataAdapter.createAcademicTerm,
  ),

  deleteAcademicTerm: withLocalOrServer(
    (args) => academicFunctions.deleteAcademicTermFn(args),
    localDataAdapter.deleteAcademicTerm,
  ),

  createDepartment: withLocalOrServer(
    (args) => academicFunctions.createDepartmentFn(args),
    localDataAdapter.createDepartment,
  ),

  deleteDepartment: withLocalOrServer(
    (args) => academicFunctions.deleteDepartmentFn(args),
    localDataAdapter.deleteDepartment,
  ),

  createProgram: withLocalOrServer(
    (args) => academicFunctions.createProgramFn(args),
    localDataAdapter.createProgram,
  ),

  deleteProgram: withLocalOrServer(
    (args) => academicFunctions.deleteProgramFn(args),
    localDataAdapter.deleteProgram,
  ),

  createAcademicClass: withLocalOrServer(
    (args) => academicFunctions.createAcademicClassFn(args),
    localDataAdapter.createAcademicClass,
  ),

  deleteAcademicClass: withLocalOrServer(
    (args) => academicFunctions.deleteAcademicClassFn(args),
    localDataAdapter.deleteAcademicClass,
  ),

  createClassSection: withLocalOrServer(
    (args) => academicFunctions.createClassSectionFn(args),
    localDataAdapter.createClassSection,
  ),

  deleteClassSection: withLocalOrServer(
    (args) => academicFunctions.deleteClassSectionFn(args),
    localDataAdapter.deleteClassSection,
  ),

  createCourse: withLocalOrServer(
    (args) => academicFunctions.createCourseFn(args),
    localDataAdapter.createCourse,
  ),

  deleteCourse: withLocalOrServer(
    (args) => academicFunctions.deleteCourseFn(args),
    localDataAdapter.deleteCourse,
  ),

  listTeachers: withLocalOrServer(
    (args) => academicFunctions.listTeachersFn(args),
    localDataAdapter.listTeachers,
  ),

  createTeacherAssignment: withLocalOrServer(
    (args) => academicFunctions.createTeacherAssignmentFn(args),
    localDataAdapter.createTeacherAssignment,
  ),

  deleteTeacherAssignment: withLocalOrServer(
    (args) => academicFunctions.deleteTeacherAssignmentFn(args),
    localDataAdapter.deleteTeacherAssignment,
  ),

  listStudents: withLocalOrServer(
    (args) => academicFunctions.listStudentsFn(args),
    localDataAdapter.listStudents,
  ),

  createStudent: withLocalOrServer(
    (args) => academicFunctions.createStudentFn(args),
    localDataAdapter.createStudent,
  ),

  enrollStudent: withLocalOrServer(
    (args) => academicFunctions.enrollStudentFn(args),
    localDataAdapter.enrollStudent,
  ),

  updateEnrollmentStatus: withLocalOrServer(
    (args) => academicFunctions.updateEnrollmentStatusFn(args),
    localDataAdapter.updateEnrollmentStatus,
  ),

  deleteStudent: withLocalOrServer(
    (args) => academicFunctions.deleteStudentFn(args),
    localDataAdapter.deleteStudent,
  ),

  importStudentsCsv: withLocalOrServer(
    (args) => academicFunctions.importStudentsCsvFn(args),
    localDataAdapter.importStudentsCsv,
  ),

  listCsvImportJobs: withLocalOrServer(
    (args) => academicFunctions.listCsvImportJobsFn(args),
    localDataAdapter.listCsvImportJobs,
  ),

  // Question Bank
  getQuestionBankCatalog: withLocalOrServer(
    (args) => questionBankFunctions.getQuestionBankCatalogFn(args),
    localDataAdapter.getQuestionBankCatalog,
  ),

  listQuestions: withLocalOrServer(
    (args) => questionBankFunctions.listQuestionsFn(args),
    localDataAdapter.listQuestions,
  ),

  createQuestion: withLocalOrServer(
    (args) => questionBankFunctions.createQuestionFn(args),
    localDataAdapter.createQuestion,
  ),

  updateQuestion: withLocalOrServer(
    (args) => questionBankFunctions.updateQuestionFn(args),
    localDataAdapter.updateQuestion,
  ),

  duplicateQuestion: withLocalOrServer(
    (args) => questionBankFunctions.duplicateQuestionFn(args),
    localDataAdapter.duplicateQuestion,
  ),

  setQuestionStatus: withLocalOrServer(
    (args) => questionBankFunctions.setQuestionStatusFn(args),
    localDataAdapter.setQuestionStatus,
  ),

  deleteQuestion: withLocalOrServer(
    (args) => questionBankFunctions.deleteQuestionFn(args),
    localDataAdapter.deleteQuestion,
  ),

  async attachQuestionFile(args: RepoArgs<Parameters<typeof localDataAdapter.attachQuestionFile>[0]>) {
    if (AUTH_MODE === 'none') {
      return localDataAdapter.attachQuestionFile(args.data);
    }
    const { dataUrl: _ignored, ...serverPayload } = args.data;
    return questionBankFunctions.attachQuestionFileFn({
      data: serverPayload,
      ...(args.headers ? { headers: args.headers } : {}),
    });
  },

  deleteQuestionAttachment: withLocalOrServer(
    (args) => questionBankFunctions.deleteQuestionAttachmentFn(args),
    localDataAdapter.deleteQuestionAttachment,
  ),

  importQuestionsCsv: withLocalOrServer(
    (args) => questionBankFunctions.importQuestionsCsvFn(args),
    localDataAdapter.importQuestionsCsv,
  ),

  listQuestionImportJobs: withLocalOrServer(
    (args) => questionBankFunctions.listQuestionImportJobsFn(args),
    localDataAdapter.listQuestionImportJobs,
  ),

  listQuestionSets: withLocalOrServer(
    (args) => questionBankFunctions.listQuestionSetsFn(args),
    localDataAdapter.listQuestionSets,
  ),

  createQuestionSet: withLocalOrServer(
    (args) => questionBankFunctions.createQuestionSetFn(args),
    localDataAdapter.createQuestionSet,
  ),

  addQuestionsToSet: withLocalOrServer(
    (args) => questionBankFunctions.addQuestionsToSetFn(args),
    localDataAdapter.addQuestionsToSet,
  ),

  removeQuestionFromSet: withLocalOrServer(
    (args) => questionBankFunctions.removeQuestionFromSetFn(args),
    localDataAdapter.removeQuestionFromSet,
  ),

  deleteQuestionSet: withLocalOrServer(
    (args) => questionBankFunctions.deleteQuestionSetFn(args),
    localDataAdapter.deleteQuestionSet,
  ),

  // Exam Builder
  getTeacherExamDashboard: withLocalOrServer(
    (args) => examsFunctions.getTeacherExamDashboardFn(args),
    localDataAdapter.getTeacherExamDashboard,
  ),

  getExamBuilderCatalog: withLocalOrServer(
    (args) => examsFunctions.getExamBuilderCatalogFn(args),
    localDataAdapter.getExamBuilderCatalog,
  ),

  listExams: withLocalOrServer(
    (args) => examsFunctions.listExamsFn(args),
    localDataAdapter.listExams,
  ),

  getExamDetail: withLocalOrServer(
    (args) => examsFunctions.getExamDetailFn(args),
    localDataAdapter.getExamDetail,
  ),

  createExamDraft: withLocalOrServer(
    (args) => examsFunctions.createExamDraftFn(args),
    localDataAdapter.createExamDraft,
  ),

  updateExamDraft: withLocalOrServer(
    (args) => examsFunctions.updateExamDraftFn(args),
    localDataAdapter.updateExamDraft,
  ),

  addExamSection: withLocalOrServer(
    (args) => examsFunctions.addExamSectionFn(args),
    localDataAdapter.addExamSection,
  ),

  deleteExamSection: withLocalOrServer(
    (args) => examsFunctions.deleteExamSectionFn(args),
    localDataAdapter.deleteExamSection,
  ),

  addQuestionsToExamSection: withLocalOrServer(
    (args) => examsFunctions.addQuestionsToExamSectionFn(args),
    localDataAdapter.addQuestionsToExamSection,
  ),

  importQuestionSetToExamSection: withLocalOrServer(
    (args) => examsFunctions.importQuestionSetToExamSectionFn(args),
    localDataAdapter.importQuestionSetToExamSection,
  ),

  updateExamQuestionConfig: withLocalOrServer(
    (args) => examsFunctions.updateExamQuestionConfigFn(args),
    localDataAdapter.updateExamQuestionConfig,
  ),

  removeExamQuestion: withLocalOrServer(
    (args) => examsFunctions.removeExamQuestionFn(args),
    localDataAdapter.removeExamQuestion,
  ),

  setExamAssignments: withLocalOrServer(
    (args) => examsFunctions.setExamAssignmentsFn(args),
    localDataAdapter.setExamAssignments,
  ),

  previewExam: withLocalOrServer(
    (args) => examsFunctions.previewExamFn(args),
    localDataAdapter.previewExam,
  ),

  publishExam: withLocalOrServer(
    (args) => examsFunctions.publishExamFn(args),
    localDataAdapter.publishExam,
  ),

  createDraftRevision: withLocalOrServer(
    (args) => examsFunctions.createDraftRevisionFn(args),
    localDataAdapter.createDraftRevision,
  ),

  closeExam: withLocalOrServer(
    (args) => examsFunctions.closeExamFn(args),
    localDataAdapter.closeExam,
  ),

  cloneExam: withLocalOrServer(
    (args) => examsFunctions.cloneExamFn(args),
    localDataAdapter.cloneExam,
  ),

  deleteExamDraft: withLocalOrServer(
    (args) => examsFunctions.deleteExamDraftFn(args),
    localDataAdapter.deleteExamDraft,
  ),

  // Student Exam Engine
  getStudentExamDashboard: withLocalOrServer(
    (args) => examEngineFunctions.getStudentExamDashboardFn(args),
    localDataAdapter.getStudentExamDashboard,
  ),

  getStudentExamLobby: withLocalOrServer(
    (args) => examEngineFunctions.getStudentExamLobbyFn(args),
    localDataAdapter.getStudentExamLobby,
  ),

  startOrResumeExamAttempt: withLocalOrServer(
    (args) => examEngineFunctions.startOrResumeExamAttemptFn(args),
    localDataAdapter.startOrResumeExamAttempt,
  ),

  saveExamAttemptAnswer: withLocalOrServer(
    (args) => examEngineFunctions.saveExamAttemptAnswerFn(args),
    localDataAdapter.saveExamAttemptAnswer,
  ),

  submitExamAttempt: withLocalOrServer(
    (args) => examEngineFunctions.submitExamAttemptFn(args),
    localDataAdapter.submitExamAttempt,
  ),

  heartbeatExamAttempt: withLocalOrServer(
    (args) => examEngineFunctions.heartbeatExamAttemptFn(args),
    localDataAdapter.heartbeatExamAttempt,
  ),

  // Grading & Analytics
  getTeacherExamGradingDashboard: withLocalOrServer(
    (args) => gradingFunctions.getTeacherExamGradingDashboardFn(args),
    localDataAdapter.getTeacherExamGradingDashboard,
  ),

  getTeacherAttemptGradingDetail: withLocalOrServer(
    (args) => gradingFunctions.getTeacherAttemptGradingDetailFn(args),
    localDataAdapter.getTeacherAttemptGradingDetail,
  ),

  saveManualQuestionGrade: withLocalOrServer(
    (args) => gradingFunctions.saveManualQuestionGradeFn(args),
    async (data: Parameters<typeof localDataAdapter.saveManualQuestionGrade>[0]) => {
      await localDataAdapter.saveManualQuestionGrade(data);
    },
  ),

  publishExamResults: withLocalOrServer(
    (args) => gradingFunctions.publishExamResultsFn(args),
    localDataAdapter.publishExamResults,
  ),

  getStudentResultReport: withLocalOrServer(
    (args) => gradingFunctions.getStudentResultReportFn(args),
    localDataAdapter.getStudentResultReport,
  ),

  getExamAnalytics: withLocalOrServer(
    (args) => gradingFunctions.getExamAnalyticsFn(args),
    localDataAdapter.getExamAnalytics,
  ),

  calculateGrades: withLocalOrServer(
    (args) => gradingFunctions.calculateGradesFn(args),
    localDataAdapter.calculateGrades,
  ),

  // Proctoring
  recordProctoringEvent: withLocalOrServer(
    (args) => proctoringFunctions.recordProctoringEventFn(args),
    async (data: Parameters<typeof localDataAdapter.recordProctoringEvent>[0]) => {
      await localDataAdapter.recordProctoringEvent(data);
    },
  ),

  getInvigilatorDashboard: withLocalOrServer(
    (args) => proctoringFunctions.getInvigilatorDashboardFn(args),
    localDataAdapter.getInvigilatorDashboard,
  ),

  saveAttemptReview: withLocalOrServer(
    (args) => proctoringFunctions.saveAttemptReviewFn(args),
    async (data: Parameters<typeof localDataAdapter.saveAttemptReview>[0]) => {
      await localDataAdapter.saveAttemptReview(data);
    },
  ),
};
