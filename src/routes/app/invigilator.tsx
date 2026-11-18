import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { RoleGuard } from "@/components/app/role-guard";
import { InvigilatorReviewDashboard } from "@/components/app/invigilator-review-dashboard";
import { useAuth } from "@/lib/auth";
export const Route = createFileRoute("/app/invigilator")({
  head: () => ({ meta: [{ title: "invigilator dashboard — ExamFlow" }, { name: "description", content: "ExamFlow invigilator dashboard preview." }, { property: "og:title", content: "ExamFlow invigilator dashboard" }, { property: "og:description", content: "ExamFlow invigilator dashboard preview." }] }),
  component: InvigilatorWorkspacePage,
});

function InvigilatorWorkspacePage() {
  const { activeInstitutionId, activeMembership } = useAuth();

  return (
    <RoleGuard requiredRole="invigilator">
      <PageHeader
        title="Invigilator review"
        description={activeMembership
          ? `${activeMembership.institution.name} · Review exam attempts, incident timelines, and case notes.`
          : 'Review exam attempts, incident timelines, and case notes.'}
      />
      {activeInstitutionId
        ? <InvigilatorReviewDashboard institutionId={activeInstitutionId} />
        : <p className="text-sm text-muted-foreground">Select an institution to view assigned exam attempts.</p>}
    </RoleGuard>
  );
}
