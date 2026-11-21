import { createFileRoute } from '@tanstack/react-router';
import { BookOpen, FileText, GraduationCap, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/app/page-header';
import { StatCard } from '@/components/app/stat-card';
import { ReportsPanel } from '@/components/app/exam-reports-view';
import { DEMO_AUDIT, DEMO_KPIS, DEMO_REPORTS } from '@/lib/demo-workspace-data';

export const Route = createFileRoute('/demo/admin')({ component: DemoAdmin });

function DemoAdmin() {
  return (
    <div className="space-y-8">
      <PageHeader title="Institution overview" description="What an institution administrator sees: people, exam results and an audit trail." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Students" value={String(DEMO_KPIS.students)} icon={GraduationCap} />
        <StatCard label="Teachers" value={String(DEMO_KPIS.teachers)} icon={Users} />
        <StatCard label="Departments" value={String(DEMO_KPIS.departments)} icon={BookOpen} />
        <StatCard label="Active exams" value={String(DEMO_KPIS.activeExams)} icon={FileText} />
      </div>
      <section aria-labelledby="demo-reports" className="space-y-4">
        <h2 id="demo-reports" className="text-lg font-semibold">Exam results</h2>
        <ReportsPanel data={DEMO_REPORTS} />
      </section>
      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-base">Recent activity (audit log)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <caption className="sr-only">Recent institution activity</caption>
            <TableHeader><TableRow>
              <TableHead scope="col">Time</TableHead><TableHead scope="col">Who</TableHead>
              <TableHead scope="col">Action</TableHead><TableHead scope="col">Resource</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {DEMO_AUDIT.map((a) => (
                <TableRow key={a.time}>
                  <TableCell className="whitespace-nowrap text-xs">{a.time}</TableCell>
                  <TableCell className="text-sm">{a.actor}</TableCell>
                  <TableCell className="font-mono text-xs">{a.action}</TableCell>
                  <TableCell className="text-sm">{a.resource}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
