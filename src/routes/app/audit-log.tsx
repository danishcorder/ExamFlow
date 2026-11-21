import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/app/page-header';
import { RoleGuard } from '@/components/app/role-guard';
import { EmptyState, ErrorState, LoadingState } from '@/components/app/states';
import { useAuth } from '@/lib/auth';
import { searchAuditLogsFn } from '@/lib/audit.functions';
import { AUDIT_CSV_HEADERS, auditEntriesToCsvRows } from '@/lib/audit.shared';
import { downloadCsv } from '@/lib/csv';

export const Route = createFileRoute('/app/audit-log')({
  head: () => ({
    meta: [
      { title: 'Audit log — ExamFlow' },
      { name: 'description', content: 'Searchable record of important actions in your institution.' },
    ],
  }),
  component: AuditLogPage,
});

const PAGE_SIZE = 25;

function dayStartIso(d: string) {
  return d ? new Date(`${d}T00:00:00.000Z`).toISOString() : undefined;
}
function dayEndIso(d: string) {
  return d ? new Date(`${d}T23:59:59.999Z`).toISOString() : undefined;
}

function AuditLogPage() {
  const { user, activeInstitutionId, authHeaders } = useAuth();
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const rangeInvalid = Boolean(from && to && from > to);

  const q = useQuery({
    queryKey: ['audit-log', activeInstitutionId, user?.id, search, from, to, page],
    enabled: Boolean(user && activeInstitutionId) && !rangeInvalid,
    queryFn: async () => {
      if (!activeInstitutionId) throw new Error('No active institution');
      const f = dayStartIso(from);
      const t = dayEndIso(to);
      return searchAuditLogsFn({
        data: {
          institutionId: activeInstitutionId,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(f ? { from: f } : {}),
          ...(t ? { to: t } : {}),
          page,
          pageSize: PAGE_SIZE,
        },
        headers: authHeaders(),
      });
    },
  });

  const res = q.data;
  const totalPages = res ? Math.max(1, Math.ceil(res.total / res.pageSize)) : 1;

  return (
    <RoleGuard allowedRoles={['institution']}>
      <PageHeader
        title="Audit log"
        description="Who did what, and when. Entries are read-only and scoped to this institution."
        actions={
          <Button
            variant="outline"
            disabled={!res || res.items.length === 0}
            onClick={() => {
              if (res) downloadCsv('audit-log-page.csv', AUDIT_CSV_HEADERS, auditEntriesToCsvRows(res.items));
            }}
          >
            <Download className="h-4 w-4" />
            Export this page (CSV)
          </Button>
        }
      />
      <Card className="shadow-none">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <CardTitle className="text-base">Events ({res?.total ?? 0})</CardTitle>
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative">
              <Label htmlFor="audit-search" className="sr-only">Search actions or resources</Label>
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                id="audit-search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search action or resource…"
                className="h-9 w-64 pl-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="audit-from" className="text-xs">From</Label>
              <Input id="audit-from" type="date" value={from} max={to || undefined}
                onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-9 w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="audit-to" className="text-xs">To</Label>
              <Input id="audit-to" type="date" value={to} min={from || undefined}
                onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-9 w-40" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {rangeInvalid ? (
            <ErrorState title="Invalid date range" description="The start date must be on or before the end date." />
          ) : q.isLoading ? (
            <LoadingState label="Loading audit events…" />
          ) : q.error ? (
            <ErrorState
              title="Could not load audit events"
              description={q.error instanceof Error ? q.error.message : 'Unknown error'}
              onRetry={() => { void q.refetch(); }}
            />
          ) : !res || res.items.length === 0 ? (
            <EmptyState title="No matching events" description="Try a different search or date range." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Institution audit events, newest first</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Time</TableHead>
                      <TableHead scope="col">Actor</TableHead>
                      <TableHead scope="col">Action</TableHead>
                      <TableHead scope="col">Resource</TableHead>
                      <TableHead scope="col">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {res.items.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-xs">{new Date(e.createdAt).toLocaleString()}</TableCell>
                        <TableCell className="text-sm">{e.actorName ?? (e.actorUserId ? 'Unknown user' : 'System')}</TableCell>
                        <TableCell className="font-mono text-xs">{e.action}</TableCell>
                        <TableCell className="text-xs">{e.targetType}</TableCell>
                        <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground" title={JSON.stringify(e.metadata)}>
                          {JSON.stringify(e.metadata)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground" aria-live="polite">Page {res.page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </RoleGuard>
  );
}
