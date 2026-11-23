import { z } from 'zod';

export const LOCAL_STORAGE_KEY = 'examflow:local-data';
export const LOCAL_SCHEMA_VERSION = 2;

export const LOCAL_COLLECTIONS = [
  'institution',
  'members',
  'departments',
  'programs',
  'courses',
  'students',
  'teachers',
  'questionBank',
  'exams',
  'attempts',
  'grades',
  'reports',
  'auditLog',
] as const;

export type LocalCollection = (typeof LOCAL_COLLECTIONS)[number];
export type LocalJsonValue =
  | null
  | boolean
  | number
  | string
  | LocalJsonValue[]
  | { [key: string]: LocalJsonValue };
export type LocalEntity = { id: string; [key: string]: LocalJsonValue };
export type LocalRole = 'institution' | 'teacher' | 'student' | 'invigilator';

export type LocalSnapshot = {
  schemaVersion: number;
  updatedAt: string;
  seeded: boolean;
  data: Record<LocalCollection, LocalEntity[]>;
};

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ExamRepository {
  read(): LocalSnapshot;
  list(collection: LocalCollection): LocalEntity[];
  get(collection: LocalCollection, id: string): LocalEntity | null;
  create(collection: LocalCollection, input: Omit<LocalEntity, 'id'> & { id?: string }): LocalEntity;
  update(collection: LocalCollection, id: string, patch: Partial<Omit<LocalEntity, 'id'>>): LocalEntity | null;
  delete(collection: LocalCollection, id: string): boolean;
  resetSampleData(): LocalSnapshot;
  exportJson(): string;
  importJson(json: string): LocalSnapshot;
}

const entitySchema = z.object({ id: z.string().min(1) }).passthrough();
const envelopeSchema = z.object({
  schemaVersion: z.number().int().min(1).max(LOCAL_SCHEMA_VERSION),
  updatedAt: z.string().optional(),
  seeded: z.boolean().optional(),
  data: z.record(z.string(), z.array(entitySchema)),
});

const EMPTY_DATA = (): Record<LocalCollection, LocalEntity[]> => ({
  institution: [],
  members: [],
  departments: [],
  programs: [],
  courses: [],
  students: [],
  teachers: [],
  questionBank: [],
  exams: [],
  attempts: [],
  grades: [],
  reports: [],
  auditLog: [],
});

export function createSampleData(now = new Date().toISOString()): LocalSnapshot {
  const data = EMPTY_DATA();
  data.institution = [{ id: 'sample-institution', name: 'Riverside College (sample)', slug: 'riverside-sample', sample: true }];
  data.members = [
    { id: 'member-admin', name: 'Amina Khan', email: 'amina@example.test', role: 'institution_admin', status: 'active', sample: true },
    { id: 'member-teacher-1', name: 'Samira Ali', email: 'samira@example.test', role: 'teacher', status: 'active', sample: true },
    { id: 'member-teacher-2', name: 'Daniel Reed', email: 'daniel@example.test', role: 'teacher', status: 'active', sample: true },
    { id: 'member-student-1', name: 'Student 014', email: 'student014@example.test', role: 'student', status: 'active', sample: true },
    { id: 'member-invigilator', name: 'Taylor Morgan', email: 'taylor@example.test', role: 'invigilator', status: 'active', sample: true },
  ];
  data.departments = [
    { id: 'dept-science', name: 'Science', code: 'SCI', description: 'Sample department', sample: true },
    { id: 'dept-computing', name: 'Computing', code: 'ICT', description: 'Sample department', sample: true },
  ];
  data.programs = [{ id: 'program-it', name: 'Information Technology', code: 'IT', departmentId: 'dept-computing', durationYears: 3, sample: true }];
  data.courses = [
    { id: 'course-ict101', code: 'ICT101', title: 'ICT Fundamentals', departmentId: 'dept-computing', credits: 3, sample: true },
    { id: 'course-math201', code: 'MATH201', title: 'Calculus', departmentId: 'dept-science', credits: 4, sample: true },
  ];
  data.teachers = [
    { id: 'teacher-samira', fullName: 'Samira Ali', email: 'samira@example.test', departmentId: 'dept-computing', status: 'active', sample: true },
    { id: 'teacher-daniel', fullName: 'Daniel Reed', email: 'daniel@example.test', departmentId: 'dept-science', status: 'active', sample: true },
  ];
  data.students = [
    { id: 'student-014', studentCode: 'ICT-014', fullName: 'Student 014', email: 'student014@example.test', status: 'active', sample: true },
    { id: 'student-015', studentCode: 'ICT-015', fullName: 'Student 015', email: 'student015@example.test', status: 'active', sample: true },
    { id: 'student-016', studentCode: 'MATH-016', fullName: 'Student 016', email: 'student016@example.test', status: 'active', sample: true },
  ];
  data.questionBank = [
    { id: 'q-ram', title: 'Volatile memory', prompt: 'Which component is the computer’s main volatile memory?', questionType: 'mcq_single', courseId: 'course-ict101', topic: 'Computer systems', difficulty: 'easy', marks: 2, negativeMarks: 0, options: [{ key: 'A', text: 'Hard disk' }, { key: 'B', text: 'RAM' }, { key: 'C', text: 'ROM' }], correctOptionKeys: ['B'], sample: true },
    { id: 'q-byte', title: 'Bytes', prompt: 'How many bits are in one byte?', questionType: 'mcq_single', courseId: 'course-ict101', topic: 'Data representation', difficulty: 'easy', marks: 2, negativeMarks: 0, options: [{ key: 'A', text: '4' }, { key: 'B', text: '8' }, { key: 'C', text: '16' }], correctOptionKeys: ['B'], sample: true },
    { id: 'q-https', title: 'Secure web traffic', prompt: 'Which protocol is used to carry web pages securely?', questionType: 'mcq_single', courseId: 'course-ict101', topic: 'Networking', difficulty: 'medium', marks: 2, negativeMarks: 0, options: [{ key: 'A', text: 'HTTP' }, { key: 'B', text: 'FTP' }, { key: 'C', text: 'HTTPS' }], correctOptionKeys: ['C'], sample: true },
    { id: 'q-ram-rom', title: 'RAM and ROM', prompt: 'Explain one difference between RAM and ROM.', questionType: 'descriptive', courseId: 'course-ict101', topic: 'Computer systems', difficulty: 'medium', marks: 5, negativeMarks: 0, options: [], correctOptionKeys: [], sampleAnswer: 'RAM is volatile; ROM is non-volatile.', gradingRubric: 'Award marks for accurate definitions and examples.', sample: true },
  ];
  data.exams = [
    { id: 'exam-ict', title: 'ICT Fundamentals — Sample Exam', description: 'Clearly labelled sample exam.', courseId: 'course-ict101', durationMinutes: 10, questionIds: ['q-ram', 'q-byte', 'q-https'], status: 'published', passingPercentage: 50, sample: true },
    { id: 'exam-mixed', title: 'ICT Short Answer — Sample Exam', description: 'Includes one manually graded response.', courseId: 'course-ict101', durationMinutes: 15, questionIds: ['q-ram-rom'], status: 'published', passingPercentage: 50, sample: true },
  ];
  data.attempts = [
    { id: 'attempt-sample-complete', examId: 'exam-ict', studentId: 'student-014', status: 'submitted', startedAt: now, expiresAt: now, submittedAt: now, answers: { 'q-ram': { selectedOptionKeys: ['B'], descriptiveText: null }, 'q-byte': { selectedOptionKeys: ['B'], descriptiveText: null }, 'q-https': { selectedOptionKeys: ['A'], descriptiveText: null } }, sample: true },
  ];
  data.grades = [
    { id: 'grade-sample-complete', examId: 'exam-ict', attemptId: 'attempt-sample-complete', studentId: 'student-014', status: 'published', totalAwardedMarks: 4, maxPossibleMarks: 6, percentage: 66.7, isPassing: true, teacherNotes: 'Good work. Review secure protocols.', sample: true },
  ];
  data.reports = [{ id: 'report-sample', examId: 'exam-ict', examTitle: 'ICT Fundamentals — Sample Exam', submissions: 1, averagePercentage: 66.7, sample: true }];
  data.auditLog = [{ id: 'audit-sample', time: now, actor: 'Amina Khan (sample admin)', action: 'sample.data.seeded', resource: 'Riverside College (sample)', sample: true }];
  return { schemaVersion: LOCAL_SCHEMA_VERSION, updatedAt: now, seeded: true, data };
}

function normalizeSnapshot(value: unknown): LocalSnapshot {
  const parsed = envelopeSchema.parse(value);
  const data = EMPTY_DATA();
  for (const collection of LOCAL_COLLECTIONS) {
    const records = parsed.data[collection] ?? [];
    data[collection] = records as LocalEntity[];
  }
  return {
    schemaVersion: LOCAL_SCHEMA_VERSION,
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    seeded: parsed.seeded ?? false,
    data,
  };
}

const browserStorage: StorageAdapter = {
  getItem(key) {
    try { return typeof window === 'undefined' ? null : window.localStorage.getItem(key); }
    catch { return null; }
  },
  setItem(key, value) {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); }
    catch { /* The in-memory copy remains usable if browser storage is unavailable. */ }
  },
  removeItem(key) {
    try { if (typeof window !== 'undefined') window.localStorage.removeItem(key); }
    catch { /* Ignore unavailable browser storage. */ }
  },
};

export function createLocalRepository(storage: StorageAdapter = browserStorage): ExamRepository {
  let memorySnapshot: LocalSnapshot | null = null;

  const persist = (snapshot: LocalSnapshot): LocalSnapshot => {
    const updated = { ...snapshot, updatedAt: new Date().toISOString() };
    memorySnapshot = updated;
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  };

  const read = (): LocalSnapshot => {
    if (memorySnapshot) return memorySnapshot;
    const raw = storage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return persist(createSampleData());
    try {
      const parsed = normalizeSnapshot(JSON.parse(raw) as unknown);
      memorySnapshot = parsed;
      if (parsed.schemaVersion !== LOCAL_SCHEMA_VERSION) return persist(parsed);
      return parsed;
    } catch {
      return persist(createSampleData());
    }
  };

  return {
    read,
    list(collection) { return [...read().data[collection]]; },
    get(collection, id) { return read().data[collection].find((record) => record.id === id) ?? null; },
    create(collection, input) {
      const snapshot = read();
      const record = { ...input, id: input.id ?? `local-${crypto.randomUUID()}` } as LocalEntity;
      snapshot.data[collection] = [...snapshot.data[collection], record];
      persist(snapshot);
      return record;
    },
    update(collection, id, patch) {
      const snapshot = read();
      const current = snapshot.data[collection].find((record) => record.id === id);
      if (!current) return null;
      const updated = { ...current, ...patch, id } as LocalEntity;
      snapshot.data[collection] = snapshot.data[collection].map((record) => record.id === id ? updated : record);
      persist(snapshot);
      return updated;
    },
    delete(collection, id) {
      const snapshot = read();
      const next = snapshot.data[collection].filter((record) => record.id !== id);
      if (next.length === snapshot.data[collection].length) return false;
      snapshot.data[collection] = next;
      persist(snapshot);
      return true;
    },
    resetSampleData() {
      memorySnapshot = null;
      storage.removeItem(LOCAL_STORAGE_KEY);
      return persist(createSampleData());
    },
    exportJson() { return JSON.stringify(read(), null, 2); },
    importJson(json) {
      const imported = normalizeSnapshot(JSON.parse(json) as unknown);
      return persist({ ...imported, seeded: false });
    },
  };
}

export const localRepository = createLocalRepository();
