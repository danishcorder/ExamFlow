import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  localRepository,
  type LocalCollection,
  type LocalEntity,
  type LocalRole,
  type LocalSnapshot,
} from '@/lib/local-repository';

const ROLE_OPTIONS: Array<{ role: LocalRole; label: string; description: string }> = [
  { role: 'institution', label: 'Institution Admin', description: 'Manage sample academic records and review activity.' },
  { role: 'teacher', label: 'Teacher', description: 'Review sample courses, exams, and grading records.' },
  { role: 'student', label: 'Student', description: 'View sample exams and published results.' },
  { role: 'invigilator', label: 'Invigilator', description: 'Review sample examination attempts.' },
];

const ROLE_NAV: Record<LocalRole, string[]> = {
  institution: ['Overview', 'Departments', 'Teachers', 'Students', 'Courses', 'Question bank', 'Exams', 'Audit log'],
  teacher: ['Overview', 'Question bank', 'Exams', 'Grading', 'Reports'],
  student: ['My exams', 'Results'],
  invigilator: ['Overview', 'Attempts'],
};

const VIEW_COLLECTION: Record<string, LocalCollection> = {
  Departments: 'departments',
  Teachers: 'teachers',
  Students: 'students',
  Courses: 'courses',
  'Question bank': 'questionBank',
  Exams: 'exams',
  'My exams': 'exams',
  Grading: 'attempts',
  Reports: 'reports',
  'Audit log': 'auditLog',
  Attempts: 'attempts',
  Results: 'grades',
};

function displayName(record: LocalEntity): string {
  for (const key of ['name', 'fullName', 'title', 'studentCode', 'code', 'action']) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return record.id;
}

function displayDetail(record: LocalEntity): string {
  for (const key of ['email', 'code', 'courseId', 'status', 'resource', 'topic']) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return record.sample === true ? 'Sample record' : '';
}

function saveTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function NoLoginWorkspace() {
  const [snapshot, setSnapshot] = useState<LocalSnapshot | null>(null);
  const [role, setRole] = useState<LocalRole | null>(null);
  const [view, setView] = useState('Overview');
  const importRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setSnapshot(localRepository.read());
  }, []);

  const collection = VIEW_COLLECTION[view];
  const rows = useMemo(
    () => snapshot && collection ? snapshot.data[collection] : [],
    [collection, snapshot],
  );

  function switchRole(nextRole: LocalRole) {
    setRole(nextRole);
    setView(ROLE_NAV[nextRole][0] ?? 'Overview');
  }

  function resetSampleData() {
    if (!window.confirm('Reset all local data to the labelled sample dataset?')) return;
    setSnapshot(localRepository.resetSampleData());
    setNotice('Sample data restored in this browser.');
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      setSnapshot(localRepository.importJson(await file.text()));
      setNotice('JSON backup imported into this browser.');
    } catch {
      setNotice('That file is not a valid ExamFlow JSON backup.');
    }
    if (importRef.current) importRef.current.value = '';
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div role="status" className="border-b bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-100">
        Local mode: no login. Data stays in this browser only. Not for real examinations.
      </div>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">ExamFlow local workspace</h1>
          <p className="text-xs text-muted-foreground">Riverside College (sample)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {role ? <Button variant="outline" size="sm" onClick={() => setRole(null)}>Switch role</Button> : null}
          <Button variant="outline" size="sm" onClick={resetSampleData}>Reset sample data</Button>
          <Button variant="outline" size="sm" onClick={() => saveTextFile('examflow-local-backup.json', localRepository.exportJson())}>Export JSON</Button>
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>Import JSON</Button>
          <input
            ref={importRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            aria-label="Choose an ExamFlow JSON backup"
            onChange={(event) => { void importBackup(event.currentTarget.files?.[0]); }}
          />
        </div>
      </header>
      {notice ? <p role="status" className="border-b px-4 py-2 text-sm text-muted-foreground sm:px-6">{notice}</p> : null}

      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        {!snapshot ? (
          <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading local sample data…</p>
        ) : role === null ? (
          <section className="mx-auto max-w-3xl space-y-4">
            <h2 className="text-lg font-semibold">Choose a role</h2>
            <p className="text-sm text-muted-foreground">Each role opens a separate local sample workspace. No account is created.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLE_OPTIONS.map((option) => (
                <Card key={option.role} className="shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">{option.label}</CardTitle>
                    <CardDescription>{option.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => switchRole(option.role)}>Open {option.label} workspace</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : (
          <div className="space-y-6">
            <section className="space-y-1">
              <h2 className="text-lg font-semibold">{ROLE_OPTIONS.find((option) => option.role === role)?.label} workspace</h2>
              <p className="text-sm text-muted-foreground">Sample records are marked and can be reset at any time.</p>
            </section>
            <nav aria-label="Local workspace navigation" className="flex gap-2 overflow-x-auto border-b pb-2">
              {ROLE_NAV[role].map((item) => (
                <Button key={item} variant={view === item ? 'secondary' : 'ghost'} size="sm" onClick={() => setView(item)}>{item}</Button>
              ))}
            </nav>
            {view === 'Overview' ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(['students', 'teachers', 'courses', 'exams'] as const).map((key) => (
                  <Card key={key} className="shadow-none">
                    <CardHeader className="pb-2"><CardDescription>{key}</CardDescription></CardHeader>
                    <CardContent className="text-2xl font-semibold tabular-nums">{snapshot.data[key].length}</CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">{view}</CardTitle>
                  <CardDescription>{rows.length} local sample record{rows.length === 1 ? '' : 's'}</CardDescription>
                </CardHeader>
                <CardContent>
                  {rows.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No local records yet.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Details</TableHead><TableHead>Record type</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {rows.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="font-medium">{displayName(record)}</TableCell>
                            <TableCell className="text-muted-foreground">{displayDetail(record)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{record.sample === true ? 'Sample' : 'Local'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Local mode is for demos and practice only. It does not provide production security, server verification, or examination integrity.</p>
      </main>
    </div>
  );
}
