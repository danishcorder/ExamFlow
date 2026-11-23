import { useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Download, RotateCcw, ShieldAlert, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Brand } from './brand';
import { useAuth } from '@/lib/auth';
import { localRepository, type LocalRole } from '@/lib/local-repository';
import { ROLES } from '@/lib/roles';

const ROLE_OPTIONS: Array<{ role: LocalRole; label: string; description: string }> = [
  {
    role: 'institution',
    label: 'Institution Admin',
    description: 'Manage academics, courses, teacher assignments, students, exams, reports, and audit logs.',
  },
  {
    role: 'teacher',
    label: 'Teacher / Examiner',
    description: 'Author questions, build and publish exams, grade responses, and review analytics.',
  },
  {
    role: 'student',
    label: 'Student',
    description: 'Start and submit active exams with autosave and view published report cards.',
  },
  {
    role: 'invigilator',
    label: 'Invigilator',
    description: 'Monitor attempt timelines, inspect browser incidents, and record review notes.',
  },
];

function saveTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function NoLoginBanner() {
  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-950 sm:text-sm dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      Local mode: no login. Data stays in this browser only. Not for real examinations.
    </div>
  );
}

export function NoLoginLocalControls({ showSwitchRole = true }: { showSwitchRole?: boolean }) {
  const navigate = useNavigate();
  const { localRole, setLocalRole, refreshWorkspace } = useAuth();
  const importRef = useRef<HTMLInputElement>(null);

  function handleSwitchRole() {
    setLocalRole(null);
    void navigate({ to: '/app' });
  }

  async function handleReset() {
    if (!window.confirm('Reset all local data to the labelled sample dataset?')) return;
    localRepository.resetSampleData();
    await refreshWorkspace();
    toast.success('Sample data restored in this browser.');
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    try {
      localRepository.importJson(await file.text());
      await refreshWorkspace();
      toast.success('JSON backup imported into this browser.');
    } catch {
      toast.error('That file is not a valid ExamFlow JSON backup.');
    }
    if (importRef.current) importRef.current.value = '';
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {showSwitchRole && localRole ? (
        <Button variant="outline" size="sm" onClick={handleSwitchRole}>
          <Users className="h-3.5 w-3.5" />
          Switch role
        </Button>
      ) : null}
      <Button variant="outline" size="sm" onClick={() => void handleReset()}>
        <RotateCcw className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Reset sample data</span>
        <span className="sm:hidden">Reset</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => saveTextFile('examflow-local-backup.json', localRepository.exportJson())}
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Export JSON</span>
        <span className="sm:hidden">Export</span>
      </Button>
      <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>
        <Upload className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Import JSON</span>
        <span className="sm:hidden">Import</span>
      </Button>
      <input
        ref={importRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        aria-label="Choose an ExamFlow JSON backup"
        onChange={(event) => {
          void handleImport(event.currentTarget.files?.[0]);
        }}
      />
    </div>
  );
}

export function NoLoginRolePicker() {
  const navigate = useNavigate();
  const { setLocalRole } = useAuth();
  const snap = localRepository.read();
  const institutionName =
    typeof snap.data.institution[0]?.['name'] === 'string'
      ? snap.data.institution[0]['name']
      : 'Riverside College (sample)';

  function chooseRole(role: LocalRole) {
    setLocalRole(role);
    void navigate({ to: ROLES[role].path });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <NoLoginBanner />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Brand />
          <span className="hidden h-4 w-px bg-border sm:inline-block" />
          <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
            {institutionName}
          </span>
        </div>
        <NoLoginLocalControls showSwitchRole={false} />
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-4 py-8 sm:p-8">
        <section className="space-y-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Choose a role workspace
          </h1>
          <p className="text-sm text-muted-foreground">
            Explore ExamFlow locally in your browser with sample data for {institutionName}. No account or server connection is used.
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          {ROLE_OPTIONS.map((option) => (
            <Card key={option.role} className="flex flex-col justify-between shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">{option.label}</CardTitle>
                <CardDescription>{option.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => chooseRole(option.role)} className="w-full sm:w-auto">
                  Open {option.label}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border bg-muted/40 p-4 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            Local mode stores all edits in this browser&apos;s local storage only. Use{' '}
            <strong>Export JSON</strong> to save a backup or <strong>Reset sample data</strong> to restore the defaults at any time.
          </p>
        </div>
      </main>
    </div>
  );
}

export function NoLoginWorkspace() {
  return <NoLoginRolePicker />;
}
