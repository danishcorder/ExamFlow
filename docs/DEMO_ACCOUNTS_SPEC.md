# One-click demo accounts — specification (needs Lovable database work)

Status: **Not implemented.** Requires schema/seed changes that AGENTS.md reserves for the Lovable-managed workflow.
The no-account demo already shipped (`/demo`, `/demo-exam`) needs none of this and never touches the database.

## Goal
Let a visitor click "Try as admin / teacher / student" and land in the real application against a separate, disposable demo institution.

## Required (via Lovable)
1. **Demo institution** `demo-riverside` flagged `is_demo = true` (new boolean on `institutions`, default false), with academic structure, ~40 students, 3 teachers, 4 exams in mixed states, graded and ungraded attempts.
2. **Three fixed demo auth users** (admin, teacher, student) with memberships only in the demo institution. Never members of any other institution. Emails on a non-routable domain.
3. **Sign-in path:** a server function (rate-limited per IP) that signs in *only* those three users. The password or magic-link secret stays server-side; do not ship credentials to the browser.
4. **Safety rails**
   - RLS already scopes by institution; add a test proving demo users read/write nothing outside the demo institution.
   - Block in demo institution: inviting real emails, sending email, file uploads, changing subscription, deleting the institution, changing demo users' passwords.
   - Audit and rate-limit demo sessions; short session lifetime.
5. **Reset job** (scheduled, e.g. nightly): delete and re-seed the demo institution's rows from a seed script, idempotent, with no effect outside `is_demo` institutions.
6. **Labelling:** banner in the app shell whenever the active institution `is_demo`.

## Acceptance checks
- Cross-tenant isolation test passes for all three demo users.
- Reset restores the seed state and leaves other institutions untouched.
- Demo sign-in endpoint refuses any other email and is rate-limited.
