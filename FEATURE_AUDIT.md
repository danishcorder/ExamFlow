# ExamFlow feature and readiness audit

Audit date: 2026-11-18. Sources: repository review, automated tests/build/typecheck, and read-only checks against the configured Supabase project. This is a code and staging-readiness review; it is not a production security certification.

## Feature checklist

| Area | Status | Evidence / remaining work |
|---|---|---|
| Multi-institution membership | Implemented in code | Institution memberships, workspace switching, invitations, and tenant-scoped query paths exist. Live cross-tenant RLS verification remains incomplete. |
| Super Admin | Partial | Institution overview and status controls exist. Subscription administration, system health, and audit-log screens are absent. |
| Institution Admin | Partial | Membership, academic catalog, imports, question bank, and exam builder exist. Reports and usable subscription administration are absent. |
| Teacher / Examiner | Implemented in code | Assignment, question-bank, exam-builder, dashboard, and grading flows exist. Database readiness is required for live verification. |
| Student | Implemented in code | Assigned exams, timed attempts, answer saving, resume, submission receipts, and published-result APIs/components exist. Published report is now reachable from completed exams and downloadable as spreadsheet-safe CSV. |
| Invigilator | Partial | Review dashboard code existed but route showed a placeholder. Route now mounts it; its tables are absent in the configured database and event capture is not wired into the exam UI. |
| Registration / sign-in / recovery | Implemented in code | Supabase Auth routes exist. Email delivery, redirect URLs, and password reset must be configured and tested in Supabase. |
| Server authorization | Implemented in code, not live-certified | Server functions use verified Supabase claims and role checks; migrations define membership helper functions and RLS. Live RLS test requiring service credentials was not run. |
| Academic structure | Implemented in code | Sessions, terms, departments, programs, classes, sections, courses, teacher assignment, enrollments, student and CSV flows are represented. |
| Question bank | Implemented in code | MCQ, true/false, short/long response, options, answer keys, attachments, CSV import, and grading rubrics are represented. Mathematical notation depends on entered content; equation authoring/rendering was not verified. |
| Exam scheduling and assembly | Implemented in code | Draft editing, assignments, immutable versions, instructions, marks, timing, shuffling, and preview exist. |
| Grading / marking | Implemented in code | Objective grading, descriptive grading, negative marking, partial marks, result publication, and report API exist. Live grading path was not tested against deployed data. |
| Timer / autosave / resume / submission | Implemented in code | Server-authoritative deadlines, answer persistence, heartbeat, resume, auto-submit, and idempotency have unit coverage. Real network-loss behavior needs browser/live backend testing. |
| Proctoring | Partial | Event types and review APIs exist. Exam UI does not call the event API; no camera/microphone permission flow or signal capture exists. No automated face detection is implemented. |
| Results and analytics | Partial | Student result reports and teacher-filtered result CSV exports are available; institution audit CSV export includes the latest 30 rows only. Full date-filtered reporting and large-export pagination are absent. |
| Notifications / email alerts | Missing / external | No application notification system. Invitation/auth email relies on Supabase Auth configuration. Header notification control is informational only. |
| Audit logs | Partial | Institution audit table and a recent-activity widget exist. No full searchable audit log or platform-wide event monitor. |
| Backups / monitoring | External configuration | No in-app backup scheduler or error monitoring service is configured in this repository. Supabase/provider-level backup and monitoring settings need review. |
| SaaS plans and limits | Incomplete | Subscription schema/API/UI code exists but migrations are missing; quotas are not enforced by exam/student/teacher creation; no payment provider. Unverified client-side plan upgrades have been disabled server-side. |
| Responsive / accessible UI | Partial | Responsive layouts and semantic controls exist across major screens. Full keyboard/screen-reader and small-screen audit was not completed. |

## Database and security findings

1. Supabase Auth, PostgREST, and Storage are reachable from the audit environment. The read-only readiness script sees 34 of 37 expected tables, all 3 checked RPC names, and the `question-attachments` bucket.
2. Missing tables are `exam_proctoring_events`, `exam_attempt_reviews`, and `institution_subscriptions`. Proctoring review and subscription features therefore cannot run against this project yet.
3. The Phase 8 migration references `institution_members`; the schema created in Phase 2 is `institution_memberships`. The Phase 8 policies must be corrected and reviewed by the managed database workflow before that migration is applied.
4. The live row-level-security cross-tenant test was not executed: there are no service-role credentials in the local environment. Do not put service-role keys in client code or commit them.
5. No service-role key is embedded in the frontend bundle. Server-side privileged client code requires server-only environment values.
6. Subscription tier changes previously trusted an authenticated institution-admin request and directly granted the requested tier without payment verification. The server now rejects tier changes until billing is configured.
7. Proctoring event submission previously accepted caller-provided student and attempt identifiers without verifying ownership. The server now requires a matching student identity and an active attempt belonging to that student.
8. Registration, password reset, invitation email delivery, attachment policies, and production redirect URLs still need configuration checks in the Supabase console.

## Automated validation

- `pnpm lint`: passed.
- `pnpm exec vitest run --pool=threads` with a writable temporary directory: 14 files and 37 tests passed. The default Vitest worker setup failed in this restricted Windows environment while renaming OS temp files; rerunning with a workspace temp directory and thread pool passed.
- `pnpm build`: passed. Vite emits existing deprecation warnings for `createServerFn().inputValidator()` and a notice that `vite-tsconfig-paths` is redundant on this Vite version.
- `pnpm db:check`: Auth, RPC, and bucket checks passed; database readiness failed because 3 tables are missing.
- Live role-by-role workflows, browser-based exam sessions, concurrency/load, email delivery, and cross-tenant adversarial RLS tests were not completed.

## Required managed follow-up

Use the connected Lovable-managed project/database workflow to correct the Phase 8 membership-table reference, apply the reviewed migrations in order, and rerun `pnpm db:check`. The Lovable connector returned an internal error during this audit, so no database schema was changed. Then run the live RLS isolation test with temporary credentials and perform signed-in browser scenarios for each role. Configure payment billing before enabling paid plans, and wire explicit consent plus policy-compliant camera/microphone behavior before advertising proctoring as active.
