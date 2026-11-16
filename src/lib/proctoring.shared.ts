export type ProctoringEventType =
  | 'fullscreen_exit'
  | 'tab_visibility_hidden'
  | 'window_blur'
  | 'camera_disconnected'
  | 'mic_disconnected'
  | 'face_missing'
  | 'multiple_faces';

export type ProctoringSeverity = 'info' | 'warning' | 'critical';

export type ProctoringEventItem = {
  id: string;
  attemptId: string;
  studentId: string;
  eventType: ProctoringEventType;
  severity: ProctoringSeverity;
  details: Record<string, string>;
  createdAt: string;
};

export type AttemptReviewStatus = 'flagged' | 'cleared' | 'penalized' | 'under_review';

export type AttemptReviewRecord = {
  id: string;
  attemptId: string;
  reviewerId: string | null;
  reviewStatus: AttemptReviewStatus;
  reviewNotes: string | null;
  updatedAt: string;
};

export type InvigilatorDashboardAttemptRow = {
  attemptId: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentCode: string;
  studentFullName: string;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  eventCount: number;
  criticalEventCount: number;
  reviewStatus: AttemptReviewStatus;
  reviewNotes: string | null;
  events: ProctoringEventItem[];
};
