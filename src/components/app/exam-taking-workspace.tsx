import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  Clock,
  CloudOff,
  FileCheck2,
  Loader2,
  Lock,
  RefreshCw,
  Send,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth';
import {
  getStudentExamLobbyFn,
  heartbeatExamAttemptFn,
  saveExamAttemptAnswerFn,
  startOrResumeExamAttemptFn,
  submitExamAttemptFn,
} from '@/lib/exam-engine.functions';
import {
  isAnswerPopulated,
  type ExamAttemptSessionData,
  type StudentAttemptAnswerRecord,
  type StudentAttemptRecord,
  type StudentExamLobbyData,
  type StudentSafeExamQuestion,
} from '@/lib/exam-engine.shared';
import { cn } from '@/lib/utils';
import { ErrorState, LoadingState } from './states';

type LocalDraftEntry = {
  questionId: string;
  selectedOptionKeys: string[];
  descriptiveText: string | null;
  isFlagged: boolean;
  clientUpdatedAt: string;
  dirty: boolean;
};

type SaveSyncState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

function storageKeyForAttempt(attemptId: string): string {
  return `examflow:attempt-draft:${attemptId}`;
}

function readLocalDrafts(attemptId: string): Record<string, LocalDraftEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKeyForAttempt(attemptId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocalDraftEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalDrafts(attemptId: string, drafts: Record<string, LocalDraftEntry>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKeyForAttempt(attemptId), JSON.stringify(drafts));
  } catch {
    // Ignore quota failures cleanly
  }
}

function clearLocalDrafts(attemptId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKeyForAttempt(attemptId));
  } catch {
    // Ignore
  }
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function ExamTakingWorkspace({ examId }: { examId: string }) {
  const { user, activeInstitutionId, authHeaders } = useAuth();
  const userId = user?.id ?? null;
  const authHeadersRef = useRef(authHeaders);
  authHeadersRef.current = authHeaders;

  const [lobby, setLobby] = useState<StudentExamLobbyData | null>(null);
  const [session, setSession] = useState<ExamAttemptSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [acknowledged, setAcknowledged] = useState(false);
  const [starting, setStarting] = useState(false);

  // Active attempt response map & local unsynced queue
  const [draftAnswers, setDraftAnswers] = useState<Record<string, LocalDraftEntry>>({});
  const draftAnswersRef = useRef<Record<string, LocalDraftEntry>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  // Sync & network state
  const [syncState, setSyncState] = useState<SaveSyncState>('idle');
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  // Server-authoritative timer tracking via offset
  const serverOffsetMsRef = useRef<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  // Submission controls & duplicate protection
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const autoSubmitTriggeredRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  // Per-question debounce timers & latest clientUpdatedAt guard
  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inFlightSavesRef = useRef<Set<string>>(new Set());

  const flatQuestions = useMemo(() => {
    if (!session) return [] as Array<{ sectionId: string; sectionTitle: string; question: StudentSafeExamQuestion; index: number }>;
    const list: Array<{ sectionId: string; sectionTitle: string; question: StudentSafeExamQuestion; index: number }> = [];
    for (const sec of session.sections) {
      for (const q of sec.questions) {
        list.push({
          sectionId: sec.id,
          sectionTitle: sec.title,
          question: q,
          index: list.length,
        });
      }
    }
    return list;
  }, [session]);

  const applyServerSession = useCallback((nextSession: ExamAttemptSessionData) => {
    const offset = Date.parse(nextSession.serverNow) - Date.now();
    if (Number.isFinite(offset)) {
      serverOffsetMsRef.current = offset;
    }

    const storedLocal = readLocalDrafts(nextSession.attempt.id);
    const merged: Record<string, LocalDraftEntry> = {};

    for (const sec of nextSession.sections) {
      for (const q of sec.questions) {
        const srv: StudentAttemptAnswerRecord | undefined = nextSession.answers[q.id];
        const loc: LocalDraftEntry | undefined = storedLocal[q.id];

        const srvTime = srv?.clientUpdatedAt ? Date.parse(srv.clientUpdatedAt) : 0;
        const locTime = loc?.clientUpdatedAt ? Date.parse(loc.clientUpdatedAt) : 0;

        if (loc && loc.dirty && locTime > srvTime) {
          merged[q.id] = loc;
        } else if (srv) {
          merged[q.id] = {
            questionId: q.id,
            selectedOptionKeys: srv.selectedOptionKeys,
            descriptiveText: srv.descriptiveText,
            isFlagged: srv.isFlagged,
            clientUpdatedAt: srv.clientUpdatedAt ?? srv.savedAt,
            dirty: false,
          };
        } else if (loc) {
          merged[q.id] = loc;
        }
      }
    }

    if (nextSession.attempt.status === 'in_progress') {
      writeLocalDrafts(nextSession.attempt.id, merged);
    } else {
      clearLocalDrafts(nextSession.attempt.id);
    }

    draftAnswersRef.current = merged;
    setDraftAnswers(merged);
    setSession(nextSession);
    setLastSavedAt(nextSession.attempt.lastSavedAt);
    setRemainingSeconds(nextSession.remainingSeconds);

    const hasPendingDirty = Object.values(merged).some((d) => d.dirty);
    setSyncState(hasPendingDirty ? 'idle' : nextSession.attempt.lastSavedAt ? 'saved' : 'idle');
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!userId || !activeInstitutionId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const headers = authHeadersRef.current();
      const lobbyData = await getStudentExamLobbyFn({
        data: { institutionId: activeInstitutionId, examId },
        headers,
      });
      setLobby(lobbyData);

      // Automatically resume an in-progress or completed attempt on page refresh!
      if (lobbyData.canResume || lobbyData.isCompleted) {
        const activeSession = await startOrResumeExamAttemptFn({
          data: { institutionId: activeInstitutionId, examId },
          headers,
        });
        applyServerSession(activeSession);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load examination');
    } finally {
      setLoading(false);
    }
  }, [activeInstitutionId, applyServerSession, examId, userId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleDeadlineTransition = useCallback((finalAttempt: StudentAttemptRecord) => {
    clearLocalDrafts(finalAttempt.id);
    setSession((prev) =>
      prev
        ? {
            ...prev,
            attempt: finalAttempt,
            remainingSeconds: 0,
          }
        : prev,
    );
    setRemainingSeconds(0);
    setConfirmSubmitOpen(false);
    toast.info('Examination deadline reached — attempt submitted automatically.');
  }, []);

  const persistQuestionToServer = useCallback(
    async (questionId: string, overrideEntry?: LocalDraftEntry): Promise<boolean> => {
      if (!activeInstitutionId || !session) return false;
      if (session.attempt.status !== 'in_progress') return false;

      const entry = overrideEntry ?? draftAnswersRef.current[questionId];
      if (!entry) return true;

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setSyncState('offline');
        setSyncErrorMsg('You are offline. Answers are saved locally and will sync automatically.');
        return false;
      }

      inFlightSavesRef.current.add(questionId);
      setSyncState('saving');
      setSyncErrorMsg(null);

      try {
        const res = await saveExamAttemptAnswerFn({
          data: {
            institutionId: activeInstitutionId,
            attemptId: session.attempt.id,
            questionId,
            selectedOptionKeys: entry.selectedOptionKeys,
            descriptiveText: entry.descriptiveText,
            isFlagged: entry.isFlagged,
            clientUpdatedAt: entry.clientUpdatedAt,
          },
          headers: authHeadersRef.current(),
        });

        if (res.status === 'expired_auto_submitted') {
          handleDeadlineTransition(res.attempt);
          return false;
        }

        const offset = Date.parse(res.serverNow) - Date.now();
        if (Number.isFinite(offset)) {
          serverOffsetMsRef.current = offset;
        }

        // Only clear dirty flag if user hasn't made a newer edit while request was in flight
        const latestLocal = draftAnswersRef.current[questionId];
        if (!latestLocal || latestLocal.clientUpdatedAt === entry.clientUpdatedAt) {
          const synced: LocalDraftEntry = {
            questionId,
            selectedOptionKeys: res.answer.selectedOptionKeys,
            descriptiveText: res.answer.descriptiveText,
            isFlagged: res.answer.isFlagged,
            clientUpdatedAt: res.answer.clientUpdatedAt ?? res.answer.savedAt,
            dirty: false,
          };
          const nextMap = { ...draftAnswersRef.current, [questionId]: synced };
          draftAnswersRef.current = nextMap;
          writeLocalDrafts(session.attempt.id, nextMap);
          setDraftAnswers(nextMap);
        }

        setLastSavedAt(res.answer.savedAt);
        setSession((prev) =>
          prev
            ? {
                ...prev,
                attempt: {
                  ...prev.attempt,
                  answeredCount: res.answeredCount,
                  lastSavedAt: res.answer.savedAt,
                },
              }
            : prev,
        );

        const stillDirty = Object.values(draftAnswersRef.current).some((d) => d.dirty);
        setSyncState(stillDirty ? 'saving' : 'saved');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Autosave failed';
        const isOfflineErr =
          (typeof navigator !== 'undefined' && !navigator.onLine) ||
          /network|fetch|offline|failed to fetch/i.test(msg);
        setSyncState(isOfflineErr ? 'offline' : 'error');
        setSyncErrorMsg(
          isOfflineErr
            ? 'Connection interrupted — answers cached locally and queued for sync.'
            : msg,
        );
        return false;
      } finally {
        inFlightSavesRef.current.delete(questionId);
      }
    },
    [activeInstitutionId, handleDeadlineTransition, session],
  );

  const flushAllDirtyAnswers = useCallback(async () => {
    for (const key of Object.keys(debounceTimersRef.current)) {
      const t = debounceTimersRef.current[key];
      if (t) clearTimeout(t);
      delete debounceTimersRef.current[key];
    }

    const dirtyEntries = Object.values(draftAnswersRef.current).filter((d) => d.dirty);
    if (dirtyEntries.length === 0) return true;

    let allOk = true;
    for (const entry of dirtyEntries) {
      const ok = await persistQuestionToServer(entry.questionId, entry);
      if (!ok) allOk = false;
    }
    return allOk;
  }, [persistQuestionToServer]);

  // Flush unsynced local recovery edits automatically once session opens
  useEffect(() => {
    if (!session || session.attempt.status !== 'in_progress') return;
    const hasDirty = Object.values(draftAnswersRef.current).some((d) => d.dirty);
    if (hasDirty) {
      void flushAllDirtyAnswers();
    }
  }, [session?.attempt.id, session?.attempt.status, flushAllDirtyAnswers]);

  // Online / offline & visibility listeners for reconnection recovery and server sync
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      if (session?.attempt.status === 'in_progress') {
        void flushAllDirtyAnswers();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncState('offline');
      setSyncErrorMsg('Connection interrupted — answers are safely cached locally.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushAllDirtyAnswers, session?.attempt.status]);

  const executeSubmit = useCallback(
    async (reason: 'manual' | 'deadline_auto_submit') => {
      if (!activeInstitutionId || !session) return;
      if (submitInFlightRef.current) return;
      if (session.attempt.status !== 'in_progress') return;

      submitInFlightRef.current = true;
      setSubmitting(true);

      try {
        // Attempt to flush pending edits before final submit (if deadline hasn't passed)
        await flushAllDirtyAnswers();

        if (!idempotencyKeyRef.current) {
          idempotencyKeyRef.current = `sub-${session.attempt.id}-${Date.now()}`;
        }

        const result = await submitExamAttemptFn({
          data: {
            institutionId: activeInstitutionId,
            attemptId: session.attempt.id,
            reason,
            idempotencyKey: idempotencyKeyRef.current,
          },
          headers: authHeadersRef.current(),
        });

        clearLocalDrafts(session.attempt.id);
        setSession((prev) =>
          prev
            ? {
                ...prev,
                attempt: result.attempt,
                remainingSeconds: 0,
              }
            : prev,
        );
        setRemainingSeconds(0);
        setConfirmSubmitOpen(false);
        toast.success(
          result.attempt.status === 'auto_submitted'
            ? 'Exam auto-submitted at deadline'
            : 'Exam submitted successfully',
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Submission failed';
        toast.error(msg);
      } finally {
        submitInFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [activeInstitutionId, flushAllDirtyAnswers, session],
  );

  // Server-authoritative countdown ticker + periodic server heartbeat
  useEffect(() => {
    if (!session || session.attempt.status !== 'in_progress') return;
    if (!activeInstitutionId) return;

    const expiresMs = Date.parse(session.attempt.expiresAt);
    if (!Number.isFinite(expiresMs)) return;

    const tick = () => {
      const estimatedServerNow = Date.now() + serverOffsetMsRef.current;
      const secs = Math.max(0, Math.floor((expiresMs - estimatedServerNow) / 1000));
      setRemainingSeconds(secs);

      if (secs <= 0 && !autoSubmitTriggeredRef.current) {
        autoSubmitTriggeredRef.current = true;
        void executeSubmit('deadline_auto_submit');
      }
    };

    tick();
    const secInterval = setInterval(tick, 1000);

    const runHeartbeat = async () => {
      try {
        const hb = await heartbeatExamAttemptFn({
          data: { institutionId: activeInstitutionId, attemptId: session.attempt.id },
          headers: authHeadersRef.current(),
        });
        const offset = Date.parse(hb.serverNow) - Date.now();
        if (Number.isFinite(offset)) {
          serverOffsetMsRef.current = offset;
        }
        setRemainingSeconds(hb.remainingSeconds);
        if (hb.attempt.status !== 'in_progress') {
          handleDeadlineTransition(hb.attempt);
        }
      } catch {
        // Keep silent during brief network drops; offline handler covers connectivity UI
      }
    };

    const hbInterval = setInterval(() => {
      void runHeartbeat();
    }, 15_000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void runHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(secInterval);
      clearInterval(hbInterval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [
    activeInstitutionId,
    executeSubmit,
    handleDeadlineTransition,
    session?.attempt.expiresAt,
    session?.attempt.id,
    session?.attempt.status,
  ]);

  // Clear pending debounce timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of Object.values(debounceTimersRef.current)) {
        if (timer) clearTimeout(timer);
      }
    };
  }, []);

  async function handleStartExam() {
    if (!activeInstitutionId) return;
    setStarting(true);
    try {
      const started = await startOrResumeExamAttemptFn({
        data: { institutionId: activeInstitutionId, examId },
        headers: authHeadersRef.current(),
      });
      autoSubmitTriggeredRef.current = false;
      applyServerSession(started);
      toast.success('Examination started — server timer is active');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to start examination');
    } finally {
      setStarting(false);
    }
  }

  function updateAnswer(
    q: StudentSafeExamQuestion,
    updater: (prev: LocalDraftEntry | undefined) => Omit<LocalDraftEntry, 'questionId' | 'clientUpdatedAt' | 'dirty'>,
    immediate: boolean,
  ) {
    if (!session || session.attempt.status !== 'in_progress') return;

    const prev = draftAnswersRef.current[q.id];
    const nextFields = updater(prev);
    const entry: LocalDraftEntry = {
      questionId: q.id,
      selectedOptionKeys: nextFields.selectedOptionKeys,
      descriptiveText: nextFields.descriptiveText,
      isFlagged: nextFields.isFlagged,
      clientUpdatedAt: new Date().toISOString(),
      dirty: true,
    };

    const nextMap = { ...draftAnswersRef.current, [q.id]: entry };
    draftAnswersRef.current = nextMap;
    writeLocalDrafts(session.attempt.id, nextMap);
    setDraftAnswers(nextMap);

    const existingTimer = debounceTimersRef.current[q.id];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete debounceTimersRef.current[q.id];
    }

    if (immediate) {
      void persistQuestionToServer(q.id, entry);
    } else {
      setSyncState('saving');
      debounceTimersRef.current[q.id] = setTimeout(() => {
        delete debounceTimersRef.current[q.id];
        void persistQuestionToServer(q.id);
      }, 600);
    }
  }

  const questionStats = useMemo(() => {
    let answered = 0;
    let flagged = 0;
    for (const item of flatQuestions) {
      const ans = draftAnswers[item.question.id];
      if (!ans) continue;
      if (ans.isFlagged) flagged++;
      if (
        isAnswerPopulated(
          item.question.question_type,
          ans.selectedOptionKeys,
          ans.descriptiveText,
        )
      ) {
        answered++;
      }
    }
    const total = flatQuestions.length;
    return {
      total,
      answered,
      flagged,
      unanswered: Math.max(0, total - answered),
    };
  }, [draftAnswers, flatQuestions]);

  if (!activeInstitutionId) {
    return (
      <ErrorState
        title="No active institution selected"
        description="Select your institution workspace to access this examination."
      />
    );
  }

  if (loading) {
    return <LoadingState label="Validating exam eligibility and loading secure session…" />;
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="Examination access denied or unavailable"
          description={loadError}
          onRetry={() => {
            void loadWorkspace();
          }}
        />
        <div>
          <Button asChild variant="outline" size="sm">
            <Link to="/app/student">
              <ArrowLeft className="h-4 w-4" />
              Back to Student Dashboard
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // STAGE 3: COMPLETED SUBMISSION RECEIPT
  if (session && session.attempt.status !== 'in_progress') {
    const att = session.attempt;
    const isAuto = att.status === 'auto_submitted';
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/app/student">
            <ArrowLeft className="h-4 w-4" />
            Back to Student Dashboard
          </Link>
        </Button>

        <Card className="shadow-none">
          <CardHeader className="border-b pb-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="font-display text-xl">
                  {isAuto ? 'Exam Auto-Submitted at Deadline' : 'Examination Submitted'}
                </CardTitle>
                <CardDescription className="mt-1">
                  {session.exam.title}
                  {session.exam.courseCode ? ` · ${session.exam.courseCode}` : ''}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 pt-5">
            <div className="rounded-md border bg-muted/25 p-4 text-sm text-muted-foreground">
              {isAuto
                ? 'Your server-enforced deadline expired and your saved responses were automatically sealed and preserved.'
                : 'Your responses have been recorded and locked. Correct answers and grades remain hidden until official results are released.'}
            </div>

            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Attempt ID</dt>
                <dd className="mt-0.5 font-mono text-xs text-foreground">{att.id}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Attempt status</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {isAuto ? 'Auto-submitted (Deadline enforced)' : 'Submitted manually'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Started at</dt>
                <dd className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
                  {formatDateTime(att.startedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Submitted at</dt>
                <dd className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
                  {formatDateTime(att.submittedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Questions answered</dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {att.answeredCount} / {att.totalQuestions || session.exam.totalQuestions}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total marks</dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {session.exam.totalMarks} pts
                </dd>
              </div>
            </dl>

            <div className="flex justify-end border-t pt-4">
              <Button asChild>
                <Link to="/app/student">Return to Student Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // STAGE 1: SECURE INSTRUCTIONS & EXAM-START CONFIRMATION LOBBY
  if (!session && lobby) {
    const ex = lobby.exam;
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/app/student">
            <ArrowLeft className="h-4 w-4" />
            Back to Student Dashboard
          </Link>
        </Button>

        <Card className="shadow-none">
          <CardHeader className="border-b pb-5">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {ex.courseCode ? `${ex.courseCode} — ${ex.courseTitle}` : 'Examination Brief'} · v
                {ex.versionNumber}
              </p>
              <CardTitle className="font-display text-2xl">{ex.title}</CardTitle>
              {ex.description && <CardDescription>{ex.description}</CardDescription>}
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-5">
            <dl className="grid gap-4 rounded-md border bg-muted/20 p-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Duration</dt>
                <dd className="mt-0.5 font-mono font-semibold tabular-nums">
                  {ex.durationMinutes} min
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Questions</dt>
                <dd className="mt-0.5 font-mono font-semibold tabular-nums">
                  {ex.totalQuestions} ({ex.sectionCount} sec)
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total marks</dt>
                <dd className="mt-0.5 font-mono font-semibold tabular-nums">
                  {ex.totalMarks} pts
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Negative marking</dt>
                <dd className="mt-0.5 font-medium">
                  {ex.negativeMarkingEnabled
                    ? `Enabled (-${ex.defaultNegativeMarks})`
                    : 'None'}
                </dd>
              </div>
            </dl>

            <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <span className="font-medium text-foreground">Opens:</span>{' '}
                <span className="font-mono tabular-nums">{formatDateTime(ex.startsAt)}</span>
              </div>
              <div>
                <span className="font-medium text-foreground">Closes:</span>{' '}
                <span className="font-mono tabular-nums">{formatDateTime(ex.endsAt)}</span>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-semibold text-foreground">Candidate Instructions</h3>
              <div className="whitespace-pre-wrap rounded-md border bg-background p-4 text-sm leading-relaxed text-foreground">
                {ex.instructions?.trim() ||
                  'Answer all questions carefully. Your responses are saved automatically as you work, and the exam will submit automatically when your server-enforced deadline expires.'}
              </div>
            </div>

            {lobby.blockReason ? (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-3.5 text-sm text-foreground"
              >
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>{lobby.blockReason}</span>
              </div>
            ) : (
              <div className="space-y-4 border-t pt-4">
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3.5 text-sm hover:bg-muted/30">
                  <Checkbox
                    id="confirm-start-ack"
                    checked={acknowledged}
                    onCheckedChange={(v) => setAcknowledged(Boolean(v))}
                    className="mt-0.5"
                  />
                  <span>
                    I confirm I have read the examination instructions and understand that the
                    server-authoritative timer begins immediately upon starting.
                  </span>
                </label>

                <div className="flex justify-end gap-2">
                  <Button asChild variant="outline">
                    <Link to="/app/student">Cancel</Link>
                  </Button>
                  <Button
                    disabled={!acknowledged || starting}
                    onClick={() => {
                      void handleStartExam();
                    }}
                  >
                    {starting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirm & Start Exam
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // STAGE 2: ACTIVE TIMED EXAMINATION WORKSPACE
  if (!session) return null;

  const activeEntry = flatQuestions[currentIndex] ?? flatQuestions[0] ?? null;
  const activeQuestion = activeEntry?.question ?? null;
  const currentDraft = activeQuestion ? draftAnswers[activeQuestion.id] : undefined;

  const isWarningTime = remainingSeconds > 0 && remainingSeconds <= 300;
  const isCriticalTime = remainingSeconds > 0 && remainingSeconds <= 60;

  return (
    <div className="space-y-5">
      {/* Compact Sticky Exam Header: Title + Timer + Save Status + Submit */}
      <header className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-base font-semibold text-foreground sm:text-lg">
            {session.exam.title}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {session.exam.courseCode ? `${session.exam.courseCode} · ` : ''}
            <span className="font-mono tabular-nums">
              {questionStats.answered}/{questionStats.total}
            </span>{' '}
            answered
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Autosave & Offline Indicator */}
          <div
            aria-live="polite"
            aria-atomic="true"
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              syncState === 'offline' || !isOnline
                ? 'text-amber-700 dark:text-amber-400'
                : syncState === 'error'
                  ? 'text-destructive'
                  : syncState === 'saving'
                    ? 'text-muted-foreground'
                    : 'text-emerald-700 dark:text-emerald-400',
            )}
          >
            {syncState === 'saving' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Saving…</span>
              </>
            ) : syncState === 'offline' || !isOnline ? (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                <span>Offline · Cached locally</span>
                <button
                  type="button"
                  onClick={() => {
                    void flushAllDirtyAnswers();
                  }}
                  className="underline underline-offset-2"
                >
                  Retry
                </button>
              </>
            ) : syncState === 'error' ? (
              <>
                <CloudOff className="h-3.5 w-3.5" />
                <span>Save failed</span>
                <button
                  type="button"
                  onClick={() => {
                    void flushAllDirtyAnswers();
                  }}
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              </>
            ) : lastSavedAt ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>
                  Saved{' '}
                  <span className="font-mono tabular-nums">
                    {new Date(lastSavedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </span>
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Autosave ready</span>
              </>
            )}
          </div>

          {/* Server-Authoritative Countdown */}
          <div
            role="timer"
            aria-label="Time remaining"
            aria-live="off"
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-sm font-semibold tabular-nums',
              isCriticalTime
                ? 'border-destructive bg-destructive/10 text-destructive'
                : isWarningTime
                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  : 'border-border bg-muted/30 text-foreground',
            )}
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span>{formatCountdown(remainingSeconds)}</span>
            <span className="font-sans text-[11px] font-medium">
              {isCriticalTime ? 'Closing' : isWarningTime ? 'Low time' : 'Remaining'}
            </span>
          </div>

          <Button
            type="button"
            size="sm"
            disabled={submitting}
            onClick={() => {
              void flushAllDirtyAnswers().finally(() => setConfirmSubmitOpen(true));
            }}
            className="whitespace-nowrap shrink-0"
          >
            <Send className="h-4 w-4" />
            Review & Submit
          </Button>
        </div>
      </header>

      {syncErrorMsg && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-2.5 text-xs text-foreground"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            {syncErrorMsg}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void flushAllDirtyAnswers();
            }}
          >
            Sync Now
          </Button>
        </div>
      )}

      {/* Two-Column Exam Stage: Question Workspace + Question Navigator */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left/Main Question Card */}
        <div className="space-y-4 lg:col-span-8">
          {!activeQuestion || !activeEntry ? (
            <Card className="shadow-none">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No questions found in this examination snapshot.
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-none">
              <CardHeader className="border-b pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      Question {currentIndex + 1} of {flatQuestions.length} ·{' '}
                      {activeEntry.sectionTitle} ·{' '}
                      <span className="font-mono tabular-nums">
                        {activeQuestion.effective_marks} pts
                      </span>
                      {session.exam.negativeMarkingEnabled &&
                      activeQuestion.effective_negative_marks > 0
                        ? ` · Penalty -${activeQuestion.effective_negative_marks}`
                        : ''}
                    </p>
                    <CardTitle className="font-display text-lg text-foreground">
                      {activeQuestion.title}
                    </CardTitle>
                  </div>

                  <Button
                    type="button"
                    variant={currentDraft?.isFlagged ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => {
                      updateAnswer(
                        activeQuestion,
                        (prev) => ({
                          selectedOptionKeys: prev?.selectedOptionKeys ?? [],
                          descriptiveText: prev?.descriptiveText ?? null,
                          isFlagged: !(prev?.isFlagged ?? false),
                        }),
                        true,
                      );
                    }}
                  >
                    <Bookmark
                      className={cn(
                        'h-4 w-4',
                        currentDraft?.isFlagged ? 'fill-amber-500 text-amber-600' : '',
                      )}
                    />
                    {currentDraft?.isFlagged ? 'Flagged for Review' : 'Flag for Review'}
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-5 pt-5">
                <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                  {activeQuestion.prompt}
                </div>

                {activeQuestion.attachments.length > 0 && (
                  <div className="space-y-3">
                    {activeQuestion.attachments.map((att) =>
                      att.attachment_kind === 'image' && att.signedUrl ? (
                        <figure key={att.id} className="overflow-hidden rounded-md border">
                          <img
                            src={att.signedUrl}
                            alt={att.file_name}
                            referrerPolicy="no-referrer"
                            className="max-h-80 w-full object-contain bg-muted/20"
                          />
                          <figcaption className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                            {att.file_name}
                          </figcaption>
                        </figure>
                      ) : (
                        <div
                          key={att.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
                        >
                          <span className="truncate font-medium">{att.file_name}</span>
                          {att.signedUrl && (
                            <a
                              href={att.signedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline underline-offset-2"
                            >
                              Open reference
                            </a>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}

                {/* MCQ Single Choice Interface */}
                {activeQuestion.question_type === 'mcq_single' && (
                  <div role="radiogroup" aria-label={activeQuestion.title} className="space-y-2.5">
                    {activeQuestion.options.map((opt) => {
                      const selected =
                        currentDraft?.selectedOptionKeys.includes(opt.option_key) ?? false;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => {
                            updateAnswer(
                              activeQuestion,
                              (prev) => ({
                                selectedOptionKeys: [opt.option_key],
                                descriptiveText: null,
                                isFlagged: prev?.isFlagged ?? false,
                              }),
                              true,
                            );
                          }}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            selected
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-border bg-background text-foreground hover:bg-muted/30',
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold',
                              selected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-muted/40 text-muted-foreground',
                            )}
                          >
                            {opt.option_key}
                          </span>
                          <span className="flex-1 leading-relaxed">{opt.option_text}</span>
                        </button>
                      );
                    })}

                    {(currentDraft?.selectedOptionKeys.length ?? 0) > 0 && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            updateAnswer(
                              activeQuestion,
                              (prev) => ({
                                selectedOptionKeys: [],
                                descriptiveText: null,
                                isFlagged: prev?.isFlagged ?? false,
                              }),
                              true,
                            );
                          }}
                          className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          Clear selection
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* MCQ Multiple Choice Interface */}
                {activeQuestion.question_type === 'mcq_multi' && (
                  <div role="group" aria-label={activeQuestion.title} className="space-y-2.5">
                    <p className="text-xs text-muted-foreground">Select all options that apply.</p>
                    {activeQuestion.options.map((opt) => {
                      const selected =
                        currentDraft?.selectedOptionKeys.includes(opt.option_key) ?? false;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="checkbox"
                          aria-checked={selected}
                          onClick={() => {
                            updateAnswer(
                              activeQuestion,
                              (prev) => {
                                const currentKeys = prev?.selectedOptionKeys ?? [];
                                const nextKeys = currentKeys.includes(opt.option_key)
                                  ? currentKeys.filter((k) => k !== opt.option_key)
                                  : [...currentKeys, opt.option_key];
                                return {
                                  selectedOptionKeys: nextKeys,
                                  descriptiveText: null,
                                  isFlagged: prev?.isFlagged ?? false,
                                };
                              },
                              true,
                            );
                          }}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            selected
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-border bg-background text-foreground hover:bg-muted/30',
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-xs font-semibold',
                              selected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-muted/40 text-muted-foreground',
                            )}
                          >
                            {selected ? <Check className="h-3.5 w-3.5" /> : opt.option_key}
                          </span>
                          <span className="flex-1 leading-relaxed">{opt.option_text}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Descriptive & Long Answer Interface */}
                {(activeQuestion.question_type === 'descriptive' ||
                  activeQuestion.question_type === 'long_answer') && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor={`resp-${activeQuestion.id}`}>Your written response</Label>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {countWords(currentDraft?.descriptiveText)} words
                        {activeQuestion.expected_word_count
                          ? ` · Target ~${activeQuestion.expected_word_count} words`
                          : ''}
                      </span>
                    </div>
                    <Textarea
                      id={`resp-${activeQuestion.id}`}
                      rows={activeQuestion.question_type === 'long_answer' ? 10 : 6}
                      value={currentDraft?.descriptiveText ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateAnswer(
                          activeQuestion,
                          (prev) => ({
                            selectedOptionKeys: [],
                            descriptiveText: val,
                            isFlagged: prev?.isFlagged ?? false,
                          }),
                          false,
                        );
                      }}
                      onBlur={() => {
                        const cur = draftAnswersRef.current[activeQuestion.id];
                        if (cur?.dirty) {
                          void flushAllDirtyAnswers();
                        }
                      }}
                      placeholder="Write your response clearly here. Changes save automatically…"
                      className="leading-relaxed"
                    />
                  </div>
                )}

                {/* Question Navigation Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={currentIndex <= 0}
                    onClick={() => {
                      void flushAllDirtyAnswers();
                      setCurrentIndex((i) => Math.max(0, i - 1));
                    }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Previous
                  </Button>

                  {currentIndex < flatQuestions.length - 1 ? (
                    <Button
                      type="button"
                      onClick={() => {
                        void flushAllDirtyAnswers();
                        setCurrentIndex((i) => Math.min(flatQuestions.length - 1, i + 1));
                      }}
                    >
                      Next Question
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => {
                        void flushAllDirtyAnswers().finally(() => setConfirmSubmitOpen(true));
                      }}
                    >
                      <Send className="h-4 w-4" />
                      Review & Submit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Question Navigator Panel */}
        <aside className="lg:col-span-4">
          <Card className="shadow-none">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm font-semibold">Question Navigator</CardTitle>
              <CardDescription className="text-xs">
                <span className="font-mono tabular-nums">{questionStats.answered}</span> answered ·{' '}
                <span className="font-mono tabular-nums">{questionStats.flagged}</span> flagged ·{' '}
                <span className="font-mono tabular-nums">{questionStats.unanswered}</span>{' '}
                unanswered
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              {session.sections.map((sec) => (
                <div key={sec.id} className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{sec.title}</p>
                  <div className="grid grid-cols-5 gap-2">
                    {sec.questions.map((q) => {
                      const entry = flatQuestions.find((item) => item.question.id === q.id);
                      const idx = entry?.index ?? 0;
                      const isCurrent = idx === currentIndex;
                      const ans = draftAnswers[q.id];
                      const answered = ans
                        ? isAnswerPopulated(
                            q.question_type,
                            ans.selectedOptionKeys,
                            ans.descriptiveText,
                          )
                        : false;
                      const flagged = Boolean(ans?.isFlagged);

                      return (
                        <button
                          key={q.id}
                          type="button"
                          aria-label={`Question ${idx + 1}${answered ? ', answered' : ', unanswered'}${flagged ? ', flagged' : ''}`}
                          aria-current={isCurrent ? 'true' : undefined}
                          onClick={() => {
                            void flushAllDirtyAnswers();
                            setCurrentIndex(idx);
                          }}
                          className={cn(
                            'relative flex h-10 items-center justify-center rounded-md border font-mono text-xs font-semibold tabular-nums transition-colors',
                            isCurrent
                              ? 'border-primary ring-2 ring-primary/30'
                              : 'border-border',
                            answered
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : 'bg-background text-foreground hover:bg-muted/40',
                          )}
                        >
                          {idx + 1}
                          {flagged && (
                            <Bookmark className="absolute right-0.5 top-0.5 h-2.5 w-2.5 fill-amber-400 text-amber-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-600 text-[10px] text-white">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  <span>Answered ({questionStats.answered})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded border bg-background">
                    <Bookmark className="h-2.5 w-2.5 fill-amber-400 text-amber-500" />
                  </span>
                  <span>Flagged for review ({questionStats.flagged})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded border bg-background" />
                  <span>Unanswered ({questionStats.unanswered})</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Manual Submission Confirmation Dialog */}
      <Dialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Final Submission</DialogTitle>
            <DialogDescription>
              Once submitted, your answers are permanently locked and cannot be edited.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <dl className="grid grid-cols-3 gap-3 rounded-md border bg-muted/20 p-3 text-center">
              <div>
                <dt className="text-xs text-muted-foreground">Answered</dt>
                <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {questionStats.answered}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Flagged</dt>
                <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {questionStats.flagged}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Unanswered</dt>
                <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums text-foreground">
                  {questionStats.unanswered}
                </dd>
              </div>
            </dl>

            {questionStats.unanswered > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-foreground">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  You still have {questionStats.unanswered} unanswered question(s). Return to the
                  exam if you want to complete them before submitting.
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setConfirmSubmitOpen(false)}
            >
              Return to Exam
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => {
                void executeSubmit('manual');
              }}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Confirm Final Submission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
