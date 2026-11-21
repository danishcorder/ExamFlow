import { createFileRoute, Link } from '@tanstack/react-router';
import { Brand } from '@/components/app/brand';
import { DemoExam } from '@/components/marketing/demo-exam';

export const Route = createFileRoute('/demo-exam')({
  head: () => ({
    meta: [
      { title: 'Try a sample ICT exam — ExamFlow' },
      { name: 'description', content: 'Take a 10-question ICT sample exam in your browser. No account needed.' },
    ],
  }),
  component: DemoExamPage,
});

function DemoExamPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" aria-label="ExamFlow home"><Brand /></Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Back to home</Link>
        </div>
      </header>
      <main className="px-4 py-8 sm:px-6 sm:py-12">
        <DemoExam />
      </main>
    </div>
  );
}
