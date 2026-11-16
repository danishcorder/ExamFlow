import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  ListChecks,
  Loader2,
  Lock,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { createExamDraftFn, updateExamDraftFn } from '@/lib/exams.functions';
import type { ExamBuilderCatalog, ExamDetail, SaveExamConfigInput } from '@/lib/exams.server';
import { cn } from '@/lib/utils';

const NONE = '__none__';

export type ExamBuilderFormStep = 0 | 1 | 2;

export type ExamBuilderFormSubmitPayload = SaveExamConfigInput & {
  examId?: string | undefined;
};

export interface ExamBuilderFormProps {
  institutionId: string;
  catalog: ExamBuilderCatalog;
  authHeaders: () => Record<string, string>;
  initialExam?: ExamDetail['exam'] | undefined;
  readOnly?: boolean | undefined;
  submitLabel?: string | undefined;
  onSaved?: ((detail: ExamDetail) => void) | undefined;
  onCancel?: (() => void) | undefined;
  onSubmitOverride?:
    | ((payload: ExamBuilderFormSubmitPayload) => Promise<ExamDetail | void>)
    | undefined;
}

type FormFieldErrors = Record<string, string>;

const STEPS = [
  {
    index: 0 as const,
    id: 'basics',
    title: 'Title & Context',
    subtitle: 'Title, description, subject & term',
    icon: FileText,
  },
  {
    index: 1 as const,
    id: 'timing',
    title: 'Timing & Schedule',
    subtitle: 'Duration & availability window',
    icon: CalendarClock,
  },
  {
    index: 2 as const,
    id: 'instructions',
    title: 'Instructions & Rules',
    subtitle: 'Candidate guidelines & marking',
    icon: ListChecks,
  },
];

const DURATION_PRESETS = [30, 45, 60, 90, 120, 180] as const;

export function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalDateTimeInput(localVal: string): string | null {
  const trimmed = localVal.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatWindowSummary(startsLocal: string, endsLocal: string): string | null {
  const startIso = fromLocalDateTimeInput(startsLocal);
  const endIso = fromLocalDateTimeInput(endsLocal);
  if (!startIso || !endIso) return null;
  const diffMin = Math.floor((Date.parse(endIso) - Date.parse(startIso)) / 60000);
  if (diffMin <= 0) return null;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hours === 0) return `${mins} min window`;
  if (mins === 0) return `${hours} hr window (${diffMin} min)`;
  return `${hours} hr ${mins} min window (${diffMin} min)`;
}

export function ExamBuilderForm({
  institutionId,
  catalog,
  authHeaders,
  initialExam,
  readOnly,
  submitLabel,
  onSaved,
  onCancel,
  onSubmitOverride,
}: ExamBuilderFormProps) {
  const isEditMode = Boolean(initialExam);
  const isReadOnly =
    readOnly ?? Boolean(initialExam && (initialExam.status !== 'draft' || initialExam.isLockedByAttempts));

  const [step, setStep] = useState<ExamBuilderFormStep>(0);

  // Step 1: Title & Academic Context
  const [title, setTitle] = useState(initialExam?.title ?? '');
  const [description, setDescription] = useState(initialExam?.description ?? '');
  const [courseId, setCourseId] = useState(initialExam?.course_id ?? NONE);
  const [sessionId, setSessionId] = useState(initialExam?.academic_session_id ?? NONE);
  const [termId, setTermId] = useState(initialExam?.academic_term_id ?? NONE);

  // Step 2: Timing & Schedule
  const [durationMinutes, setDurationMinutes] = useState(
    String(initialExam?.duration_minutes ?? 60),
  );
  const [startsAtLocal, setStartsAtLocal] = useState(
    toLocalDateTimeInput(initialExam?.starts_at),
  );
  const [endsAtLocal, setEndsAtLocal] = useState(toLocalDateTimeInput(initialExam?.ends_at));

  // Step 3: Instructions, Marking & Randomization
  const [instructions, setInstructions] = useState(initialExam?.instructions ?? '');
  const [passingMarks, setPassingMarks] = useState(
    initialExam?.passing_marks != null ? String(initialExam.passing_marks) : '',
  );
  const [passingPercentage, setPassingPercentage] = useState(
    initialExam?.passing_percentage != null ? String(initialExam.passing_percentage) : '',
  );
  const [negativeMarkingEnabled, setNegativeMarkingEnabled] = useState(
    initialExam?.negative_marking_enabled ?? false,
  );
  const [defaultNegativeMarks, setDefaultNegativeMarks] = useState(
    String(initialExam?.default_negative_marks ?? 0),
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(
    initialExam?.shuffle_questions ?? false,
  );
  const [shuffleOptions, setShuffleOptions] = useState(initialExam?.shuffle_options ?? false);

  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sync form fields when switching to another exam record
  useEffect(() => {
    setStep(0);
    setTitle(initialExam?.title ?? '');
    setDescription(initialExam?.description ?? '');
    setCourseId(initialExam?.course_id ?? NONE);
    setSessionId(initialExam?.academic_session_id ?? NONE);
    setTermId(initialExam?.academic_term_id ?? NONE);
    setDurationMinutes(String(initialExam?.duration_minutes ?? 60));
    setStartsAtLocal(toLocalDateTimeInput(initialExam?.starts_at));
    setEndsAtLocal(toLocalDateTimeInput(initialExam?.ends_at));
    setInstructions(initialExam?.instructions ?? '');
    setPassingMarks(initialExam?.passing_marks != null ? String(initialExam.passing_marks) : '');
    setPassingPercentage(
      initialExam?.passing_percentage != null ? String(initialExam.passing_percentage) : '',
    );
    setNegativeMarkingEnabled(initialExam?.negative_marking_enabled ?? false);
    setDefaultNegativeMarks(String(initialExam?.default_negative_marks ?? 0));
    setShuffleQuestions(initialExam?.shuffle_questions ?? false);
    setShuffleOptions(initialExam?.shuffle_options ?? false);
    setFieldErrors({});
    setSubmitError(null);
  }, [initialExam?.id, initialExam?.updated_at]);

  const filteredTerms = useMemo(() => {
    if (sessionId === NONE) return catalog.terms;
    return catalog.terms.filter((t) => t.session_id === sessionId);
  }, [catalog.terms, sessionId]);

  const selectedCourse = useMemo(
    () => catalog.courses.find((c) => c.id === courseId) ?? null,
    [catalog.courses, courseId],
  );
  const selectedSession = useMemo(
    () => catalog.sessions.find((s) => s.id === sessionId) ?? null,
    [catalog.sessions, sessionId],
  );
  const selectedTerm = useMemo(
    () => catalog.terms.find((t) => t.id === termId) ?? null,
    [catalog.terms, termId],
  );

  const scheduleSummary = useMemo(
    () => formatWindowSummary(startsAtLocal, endsAtLocal),
    [startsAtLocal, endsAtLocal],
  );

  function clearFieldError(key: string) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleSessionChange(nextSessionId: string) {
    setSessionId(nextSessionId);
    if (nextSessionId !== NONE && termId !== NONE) {
      const currentTerm = catalog.terms.find((t) => t.id === termId);
      if (currentTerm && currentTerm.session_id !== nextSessionId) {
        setTermId(NONE);
      }
    }
  }

  function validateStep(targetStep: ExamBuilderFormStep): FormFieldErrors {
    const errors: FormFieldErrors = {};

    if (targetStep === 0) {
      const trimmedTitle = title.trim();
      if (trimmedTitle.length < 2) {
        errors['title'] = 'Exam title must be at least 2 characters.';
      } else if (trimmedTitle.length > 180) {
        errors['title'] = 'Exam title cannot exceed 180 characters.';
      }
      if (description.trim().length > 4000) {
        errors['description'] = 'Description cannot exceed 4,000 characters.';
      }
      if (sessionId !== NONE && termId !== NONE) {
        const term = catalog.terms.find((t) => t.id === termId);
        if (term && term.session_id !== sessionId) {
          errors['academicTermId'] = 'Selected term does not belong to the selected session.';
        }
      }
    }

    if (targetStep === 1) {
      const parsedDuration = Number(durationMinutes);
      if (
        !durationMinutes.trim() ||
        !Number.isInteger(parsedDuration) ||
        parsedDuration < 1 ||
        parsedDuration > 1440
      ) {
        errors['durationMinutes'] = 'Duration must be a whole number between 1 and 1,440 minutes.';
      }

      const hasStart = startsAtLocal.trim().length > 0;
      const hasEnd = endsAtLocal.trim().length > 0;

      if (hasStart && !hasEnd) {
        errors['endsAt'] = 'Provide an end date & time, or clear start time to leave unscheduled.';
      } else if (!hasStart && hasEnd) {
        errors['startsAt'] = 'Provide a start date & time, or clear end time to leave unscheduled.';
      } else if (hasStart && hasEnd) {
        const startIso = fromLocalDateTimeInput(startsAtLocal);
        const endIso = fromLocalDateTimeInput(endsAtLocal);
        if (!startIso) {
          errors['startsAt'] = 'Enter a valid start date & time.';
        }
        if (!endIso) {
          errors['endsAt'] = 'Enter a valid end date & time.';
        }
        if (startIso && endIso) {
          const startMs = Date.parse(startIso);
          const endMs = Date.parse(endIso);
          if (endMs <= startMs) {
            errors['endsAt'] = 'End date & time must be strictly after start date & time.';
          } else if (Number.isInteger(parsedDuration) && parsedDuration >= 1) {
            const windowMinutes = Math.floor((endMs - startMs) / 60000);
            if (windowMinutes < parsedDuration) {
              errors['endsAt'] =
                `Availability window (${windowMinutes} min) must be at least the exam duration (${parsedDuration} min).`;
            }
          }
        }
      }
    }

    if (targetStep === 2) {
      if (instructions.trim().length > 15000) {
        errors['instructions'] = 'Candidate instructions cannot exceed 15,000 characters.';
      }
      if (passingMarks.trim()) {
        const pm = Number(passingMarks);
        if (!Number.isFinite(pm) || pm < 0 || pm > 100000) {
          errors['passingMarks'] = 'Passing marks must be 0 or greater.';
        } else if (initialExam && initialExam.total_marks > 0 && pm > initialExam.total_marks) {
          errors['passingMarks'] =
            `Passing marks (${pm}) cannot exceed total exam marks (${initialExam.total_marks}).`;
        }
      }
      if (passingPercentage.trim()) {
        const pct = Number(passingPercentage);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          errors['passingPercentage'] = 'Passing percentage must be between 0% and 100%.';
        }
      }
      if (negativeMarkingEnabled) {
        const neg = Number(defaultNegativeMarks);
        if (!defaultNegativeMarks.trim() || !Number.isFinite(neg) || neg < 0 || neg > 1000) {
          errors['defaultNegativeMarks'] = 'Default negative marks must be between 0 and 1,000.';
        }
      }
    }

    return errors;
  }

  function handleStepSelect(targetStep: ExamBuilderFormStep) {
    if (targetStep === step) return;
    if (isReadOnly || targetStep < step) {
      setFieldErrors({});
      setStep(targetStep);
      return;
    }
    for (let s = step; s < targetStep; s++) {
      const errs = validateStep(s as ExamBuilderFormStep);
      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs);
        setStep(s as ExamBuilderFormStep);
        return;
      }
    }
    setFieldErrors({});
    setStep(targetStep);
  }

  function handleNext() {
    if (isReadOnly) {
      setStep((prev) => (prev < 2 ? ((prev + 1) as ExamBuilderFormStep) : prev));
      return;
    }
    const errs = validateStep(step);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setSubmitError(null);
    setStep((prev) => (prev < 2 ? ((prev + 1) as ExamBuilderFormStep) : prev));
  }

  function handleBack() {
    setFieldErrors({});
    setSubmitError(null);
    setStep((prev) => (prev > 0 ? ((prev - 1) as ExamBuilderFormStep) : prev));
  }

  function buildPayload(): ExamBuilderFormSubmitPayload {
    return {
      ...(initialExam ? { examId: initialExam.id } : {}),
      institutionId,
      title: title.trim(),
      description: description.trim() || null,
      courseId: courseId === NONE ? null : courseId,
      academicSessionId: sessionId === NONE ? null : sessionId,
      academicTermId: termId === NONE ? null : termId,
      instructions: instructions.trim() || null,
      startsAt: fromLocalDateTimeInput(startsAtLocal),
      endsAt: fromLocalDateTimeInput(endsAtLocal),
      durationMinutes: Number(durationMinutes),
      passingMarks: passingMarks.trim() ? Number(passingMarks) : null,
      passingPercentage: passingPercentage.trim() ? Number(passingPercentage) : null,
      negativeMarkingEnabled,
      defaultNegativeMarks: negativeMarkingEnabled ? Number(defaultNegativeMarks) || 0 : 0,
      shuffleQuestions,
      shuffleOptions,
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isReadOnly) return;

    // Validate all steps sequentially before saving
    for (const s of [0, 1, 2] as const) {
      const errs = validateStep(s);
      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs);
        setStep(s);
        return;
      }
    }

    setFieldErrors({});
    setSubmitError(null);
    setSubmitting(true);

    try {
      const payload = buildPayload();
      let saved: ExamDetail | void;

      if (onSubmitOverride) {
        saved = await onSubmitOverride(payload);
      } else if (initialExam) {
        saved = await updateExamDraftFn({
          data: {
            ...payload,
            examId: initialExam.id,
          },
          headers: authHeaders(),
        });
      } else {
        saved = await createExamDraftFn({
          data: payload,
          headers: authHeaders(),
        });
      }

      toast.success(isEditMode ? 'Exam draft updated' : 'Exam draft created');
      if (saved) {
        onSaved?.(saved);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save exam configuration';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const effectiveSubmitLabel =
    submitLabel ?? (isEditMode ? 'Update Exam Configuration' : 'Create Draft & Open Studio');

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      noValidate
      className="space-y-5"
    >
      {isReadOnly && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-3.5 py-2.5 text-xs text-foreground"
        >
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>
            This exam is currently {initialExam?.status ?? 'locked'} and cannot be edited directly.
            Review the configuration steps below or prepare a draft revision in Exam Studio.
          </span>
        </div>
      )}

      {/* Multi-step Progress Navigation */}
      <nav aria-label="Exam configuration steps">
        <ol className="grid gap-2 sm:grid-cols-3">
          {STEPS.map((item) => {
            const Icon = item.icon;
            const isActive = step === item.index;
            const isCompleted = step > item.index;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleStepSelect(item.index)}
                  aria-current={isActive ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors',
                    isActive
                      ? 'border-primary bg-primary/5 text-foreground'
                      : isCompleted
                        ? 'border-border bg-muted/30 text-foreground hover:bg-muted/50'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/20',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isCompleted ? <Check className="h-3 w-3" /> : item.index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {item.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {item.subtitle}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* STEP 1: TITLE & ACADEMIC CONTEXT */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="exam-form-title">
              Exam title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="exam-form-title"
              value={title}
              disabled={isReadOnly || submitting}
              maxLength={180}
              aria-invalid={Boolean(fieldErrors['title'])}
              onChange={(e) => {
                setTitle(e.target.value);
                clearFieldError('title');
              }}
              placeholder="e.g. CS101 Midterm Assessment"
            />
            {fieldErrors['title'] && (
              <p role="alert" className="text-xs text-destructive">
                {fieldErrors['title']}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exam-form-description">Description (optional)</Label>
            <Textarea
              id="exam-form-description"
              rows={3}
              value={description}
              disabled={isReadOnly || submitting}
              maxLength={4000}
              aria-invalid={Boolean(fieldErrors['description'])}
              onChange={(e) => {
                setDescription(e.target.value);
                clearFieldError('description');
              }}
              placeholder="Scope, syllabus coverage, and examination overview for faculty and students"
            />
            {fieldErrors['description'] && (
              <p role="alert" className="text-xs text-destructive">
                {fieldErrors['description']}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="exam-form-course">Subject / Course</Label>
              <Select
                value={courseId}
                disabled={isReadOnly || submitting}
                onValueChange={setCourseId}
              >
                <SelectTrigger id="exam-form-course">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No specific subject</SelectItem>
                  {catalog.courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exam-form-session">Academic Session</Label>
              <Select
                value={sessionId}
                disabled={isReadOnly || submitting}
                onValueChange={handleSessionChange}
              >
                <SelectTrigger id="exam-form-session">
                  <SelectValue placeholder="Select session" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No session</SelectItem>
                  {catalog.sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exam-form-term">Academic Term</Label>
              <Select
                value={termId}
                disabled={isReadOnly || submitting}
                onValueChange={(v) => {
                  setTermId(v);
                  clearFieldError('academicTermId');
                }}
              >
                <SelectTrigger id="exam-form-term">
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No term</SelectItem>
                  {filteredTerms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors['academicTermId'] && (
                <p role="alert" className="text-xs text-destructive">
                  {fieldErrors['academicTermId']}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: TIMING & SCHEDULE */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="exam-form-duration">
                Attempt duration (minutes) <span className="text-destructive">*</span>
              </Label>
              {!isReadOnly && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        setDurationMinutes(String(preset));
                        clearFieldError('durationMinutes');
                      }}
                      className={cn(
                        'rounded border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors',
                        Number(durationMinutes) === preset
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted/40',
                      )}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Input
              id="exam-form-duration"
              type="number"
              min="1"
              max="1440"
              step="1"
              value={durationMinutes}
              disabled={isReadOnly || submitting}
              aria-invalid={Boolean(fieldErrors['durationMinutes'])}
              onChange={(e) => {
                setDurationMinutes(e.target.value);
                clearFieldError('durationMinutes');
              }}
              className="w-44 font-mono tabular-nums"
            />
            {fieldErrors['durationMinutes'] ? (
              <p role="alert" className="text-xs text-destructive">
                {fieldErrors['durationMinutes']}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Allowed time once a student begins their attempt (1 to 1,440 minutes).
              </p>
            )}
          </div>

          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exam-form-starts-at">Availability start (optional)</Label>
              <Input
                id="exam-form-starts-at"
                type="datetime-local"
                value={startsAtLocal}
                disabled={isReadOnly || submitting}
                aria-invalid={Boolean(fieldErrors['startsAt'])}
                onChange={(e) => {
                  setStartsAtLocal(e.target.value);
                  clearFieldError('startsAt');
                  clearFieldError('endsAt');
                }}
                className="font-mono text-xs tabular-nums"
              />
              {fieldErrors['startsAt'] && (
                <p role="alert" className="text-xs text-destructive">
                  {fieldErrors['startsAt']}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exam-form-ends-at">Availability end (optional)</Label>
              <Input
                id="exam-form-ends-at"
                type="datetime-local"
                value={endsAtLocal}
                disabled={isReadOnly || submitting}
                aria-invalid={Boolean(fieldErrors['endsAt'])}
                onChange={(e) => {
                  setEndsAtLocal(e.target.value);
                  clearFieldError('endsAt');
                  clearFieldError('startsAt');
                }}
                className="font-mono text-xs tabular-nums"
              />
              {fieldErrors['endsAt'] && (
                <p role="alert" className="text-xs text-destructive">
                  {fieldErrors['endsAt']}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/25 px-3.5 py-2.5 text-xs text-muted-foreground">
            <span>
              {startsAtLocal.trim() || endsAtLocal.trim()
                ? scheduleSummary
                  ? `Scheduled availability: ${scheduleSummary}.`
                  : 'Provide both start and end timestamps with end strictly after start.'
                : 'Unscheduled draft — you can set the publish window before publishing.'}
            </span>
            {!isReadOnly && (startsAtLocal.trim() || endsAtLocal.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setStartsAtLocal('');
                  setEndsAtLocal('');
                  clearFieldError('startsAt');
                  clearFieldError('endsAt');
                }}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Clear schedule
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: INSTRUCTIONS, MARKING & REVIEW */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="exam-form-instructions">Candidate instructions</Label>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {instructions.length} / 15,000
              </span>
            </div>
            <Textarea
              id="exam-form-instructions"
              rows={4}
              value={instructions}
              disabled={isReadOnly || submitting}
              maxLength={15000}
              aria-invalid={Boolean(fieldErrors['instructions'])}
              onChange={(e) => {
                setInstructions(e.target.value);
                clearFieldError('instructions');
              }}
              placeholder="Read every question carefully. No external materials permitted unless explicitly allowed…"
            />
            {fieldErrors['instructions'] && (
              <p role="alert" className="text-xs text-destructive">
                {fieldErrors['instructions']}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exam-form-passing-marks">
                Passing marks{initialExam ? ` (of ${initialExam.total_marks})` : ' (optional)'}
              </Label>
              <Input
                id="exam-form-passing-marks"
                type="number"
                min="0"
                step="0.5"
                value={passingMarks}
                disabled={isReadOnly || submitting}
                aria-invalid={Boolean(fieldErrors['passingMarks'])}
                onChange={(e) => {
                  setPassingMarks(e.target.value);
                  clearFieldError('passingMarks');
                }}
                placeholder="e.g. 40"
                className="font-mono tabular-nums"
              />
              {fieldErrors['passingMarks'] && (
                <p role="alert" className="text-xs text-destructive">
                  {fieldErrors['passingMarks']}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exam-form-passing-pct">Passing percentage (optional)</Label>
              <Input
                id="exam-form-passing-pct"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={passingPercentage}
                disabled={isReadOnly || submitting}
                aria-invalid={Boolean(fieldErrors['passingPercentage'])}
                onChange={(e) => {
                  setPassingPercentage(e.target.value);
                  clearFieldError('passingPercentage');
                }}
                placeholder="e.g. 50"
                className="font-mono tabular-nums"
              />
              {fieldErrors['passingPercentage'] && (
                <p role="alert" className="text-xs text-destructive">
                  {fieldErrors['passingPercentage']}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="exam-form-neg-toggle" className="font-medium">
                  Negative marking
                </Label>
                <p className="text-xs text-muted-foreground">
                  Apply penalties on incorrect MCQ responses.
                </p>
              </div>
              <Switch
                id="exam-form-neg-toggle"
                checked={negativeMarkingEnabled}
                disabled={isReadOnly || submitting}
                onCheckedChange={(checked) => {
                  setNegativeMarkingEnabled(checked);
                  clearFieldError('defaultNegativeMarks');
                }}
              />
            </div>

            {negativeMarkingEnabled && (
              <div className="space-y-1.5 border-t pt-3">
                <Label htmlFor="exam-form-default-neg">Default negative marks</Label>
                <Input
                  id="exam-form-default-neg"
                  type="number"
                  min="0"
                  max="1000"
                  step="0.25"
                  value={defaultNegativeMarks}
                  disabled={isReadOnly || submitting}
                  aria-invalid={Boolean(fieldErrors['defaultNegativeMarks'])}
                  onChange={(e) => {
                    setDefaultNegativeMarks(e.target.value);
                    clearFieldError('defaultNegativeMarks');
                  }}
                  className="w-40 font-mono tabular-nums"
                />
                {fieldErrors['defaultNegativeMarks'] && (
                  <p role="alert" className="text-xs text-destructive">
                    {fieldErrors['defaultNegativeMarks']}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <div>
                <Label htmlFor="exam-form-shuffle-q" className="font-medium">
                  Randomize question order
                </Label>
                <p className="text-xs text-muted-foreground">
                  Shuffle question ordering within sections per candidate.
                </p>
              </div>
              <Switch
                id="exam-form-shuffle-q"
                checked={shuffleQuestions}
                disabled={isReadOnly || submitting}
                onCheckedChange={setShuffleQuestions}
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <div>
                <Label htmlFor="exam-form-shuffle-o" className="font-medium">
                  Randomize MCQ options
                </Label>
                <p className="text-xs text-muted-foreground">
                  Permute answer choices per candidate attempt.
                </p>
              </div>
              <Switch
                id="exam-form-shuffle-o"
                checked={shuffleOptions}
                disabled={isReadOnly || submitting}
                onCheckedChange={setShuffleOptions}
              />
            </div>
          </div>

          {/* Concise Configuration Summary */}
          <div className="rounded-md border bg-muted/20 p-3.5 text-xs">
            <p className="font-semibold text-foreground">Configuration Summary</p>
            <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Exam Title</dt>
                <dd className="font-medium text-foreground">{title.trim() || 'Untitled'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Subject & Term</dt>
                <dd className="font-medium text-foreground">
                  {selectedCourse ? `${selectedCourse.code} — ${selectedCourse.title}` : 'General'}
                  {selectedSession ? ` · ${selectedSession.name}` : ''}
                  {selectedTerm ? ` (${selectedTerm.name})` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Timing</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {durationMinutes || '60'} min
                  {startsAtLocal && endsAtLocal ? ` · ${scheduleSummary ?? 'Scheduled'}` : ' · Unscheduled'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Marking & Randomization</dt>
                <dd className="text-foreground">
                  {negativeMarkingEnabled
                    ? `Negative (${defaultNegativeMarks || 0})`
                    : 'No negative marks'}
                  {shuffleQuestions ? ' · Shuffle Q' : ''}
                  {shuffleOptions ? ' · Shuffle Options' : ''}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* Footer Navigation & Submit Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <div>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
              {isReadOnly ? 'Close' : 'Cancel'}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={handleBack} disabled={submitting}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}

          {step < 2 ? (
            <Button type="button" onClick={handleNext} disabled={submitting}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            !isReadOnly && (
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {effectiveSubmitLabel}
              </Button>
            )
          )}
        </div>
      </div>
    </form>
  );
}
