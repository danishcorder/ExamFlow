# ExamFlow — Phase 1 Audit (baseline)

Branch: `feature/enterprise-hardening` (from `main` @ 33b0622). Audit date: 2026-11-21.
Status legend: **Verified** (run/read in this audit) · **Not verified** (needs live Supabase / browser).

## 1. Baseline results (verified, pnpm 12, Node 22)

| Check | Result |
|---|---|
| `pnpm lint` (tsc --noEmit) | Pass |
| `pnpm test` (vitest) | Pass — 14 files, 37 tests |
| `pnpm build` | Pass |
| `pnpm db:check` | Not verified — `fetch failed` (sandbox cannot reach Supabase) |
| `npm install` | **Fails** (npm 10.9.9 arborist crash, `edgesOut` of null); pnpm works |

## 2. Architecture map

- **Routes** (`src/routes`): `/auth/*`, `/reset-password`, `/oauth/consent`, `/app/*` (super-admin, institution, teacher, student, invigilator, members, invitations, students, teachers, academics, assignments, question-bank, exams, exam-session.$examId, settings, onboarding). `routeTree.gen.ts` is generated — do not edit.
- **Server functions** (`src/lib/*.functions.ts`, 100 `createServerFn`, all 100 use `requireSupabaseAuth`) → business logic in `*.server.ts` → Supabase. Domains: workspace, academic, question-bank, exams, exam-engine, grading, proctoring, saas. Pure helpers in `*.shared.ts`.
- **Auth**: Supabase Auth in browser; each call passes `Authorization: Bearer <token>` manually (`useAuth().authHeaders`, ~64 call sites). Server verifies with `auth.getClaims`, then queries with a user-scoped client (RLS applies). `supabaseAdmin` (service role) exists only in `client.server.ts` and is imported by no other file.
- **Request middleware** (`src/start.ts`): error page + CSRF middleware on server functions.
- **Database**: 8 migrations, 37 tables, 37 `ENABLE ROW LEVEL SECURITY`, 69 policies. Helpers: `is_platform_admin`, `is_institution_member`, `has_institution_role`. Answer keys live in `question_answer_keys`, with SELECT restricted to educators/platform admins (Phase 4).
- **Roles**: `institution_admin`, `teacher`, `student`, `invigilator` (per-institution membership) + `platform_admins` table.
- **Exam lifecycle**: draft → immutable published version → assignment → attempt with server `expires_at` → autosave/heartbeat → submit (idempotent, deadline-checked server-side) → auto/manual grading → publish → student report.

## 3. Findings

### Critical
**C1 — Phase 8 migration is both broken and unsafe (not yet applied).** `20261116000003_phase8_proctoring_saas.sql`
1. References `institution_members`; the real table is `institution_memberships`, so it will fail.
2. Even with the name fixed, every policy is `FOR ALL` for *any* member of the institution. A student could read or modify proctoring events and review verdicts, and **write `institution_subscriptions` (plan tier, quotas) directly through PostgREST**, bypassing the server.
3. No `REVOKE ... FROM anon` / explicit GRANTs, unlike earlier phases; FKs to `student_records` / `exam_attempts` are not validated against institution (cross-tenant row linking possible).
Required change is in §5. It must go through Lovable (AGENTS.md forbids editing migrations), so I have **not** modified it.

### High
- **H1 — Features depend on 3 missing tables** (`exam_proctoring_events`, `exam_attempt_reviews`, `institution_subscriptions`), per FEATURE_AUDIT. Invigilator and subscription screens cannot work live until C1 is resolved.
- **H2 — Cross-tenant RLS never tested live.** `scripts/test-rls-isolation.mjs` needs service credentials that were unavailable. Isolation is **unverified**.
- **H3 — No lockfile committed** (`.gitignore`/repo has none; `bunfig.toml` implies bun). Builds are not reproducible; `npm install` crashes. Needs a decision on the package manager (commit one lockfile) — I did not add one unasked.
- **H4 — Per-call token passing.** Auth headers are attached by hand at ~64 call sites from a React closure; a missed site or stale token yields "Unauthorized". Safer: one client `functionMiddleware` in `src/start.ts` (not a generated file) that reads the current Supabase session. Planned for Phase 2.
- **H5 — Quotas not enforced** (students/teachers/exams) and no billing provider; tier changes already disabled server-side.

### Medium
- **M1 — Proctoring events not captured by the exam UI**; no consent flow. Must not auto-penalize on focus loss (requirement preserved).
- **M2 — Six nav items are placeholders (`soon: true`):** Subscriptions, System health, Audit logs, Reports, Grading queue, Results. Misleading UI until built or hidden.
- **M3 — `exams.server.ts` is 2,513 lines; `academic.server.ts` 1,304; several 1,000+ line components.** Hard to maintain/test; split by responsibility, incrementally.
- **M4 — `.env.example` is AI-Studio boilerplate** (`GEMINI_API_KEY`, `APP_URL`) and does not document `LOVABLE_API_KEY` or server-only rules.
- **M5 — `vercel.json` uses `npm run build`** while the lock/package manager is undecided (see H3).
- **M6 — Deprecation warnings:** `inputValidator()` and redundant `vite-tsconfig-paths`.
- **M7 — Audit log:** only the latest 30 rows, no search/filter; no platform audit log.
- **M8 — Notifications:** none; header bell is informational only.

### Low
- L1 — Hardcoded Supabase URL and *publishable* key fallbacks in generated `auth-middleware.ts` (not secrets; generated file, leave as is, but prefer env in deployments).
- L2 — Client may send `reason: 'deadline_auto_submit'`; server derives status from the real deadline for late submits, but an early client-claimed auto-submit label should be ignored.
- L3 — Accessibility and small-screen audit incomplete; needs a browser run.

### Verified-good (read, not live-tested)
- Server-side `expires_at` enforcement and submit-after-deadline handling in `exam-engine.server.ts`.
- All 100 server functions are behind the auth middleware; Zod validates inputs in the functions files I sampled (exam-engine).
- No service-role key reachable from client code.

## 4. Not verified in this audit
Live RLS, live role workflows, browser/mobile/a11y behaviour, email delivery, concurrency/load, and every file in `src/lib/*.server.ts` beyond sampling. Full per-function authorization review is still open.

## 5. Required Lovable-managed database change (C1) — not applied

Ask Lovable to replace the Phase 8 migration with (names per Phase 2 helpers):

```sql
-- institution isolation: validate attempt/student belong to the same institution (composite FK or trigger)
REVOKE ALL ON public.exam_proctoring_events, public.exam_attempt_reviews, public.institution_subscriptions FROM anon;

-- exam_proctoring_events: staff read; no direct client writes (server inserts via verified path)
CREATE POLICY proctoring_select_staff ON public.exam_proctoring_events FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid())
      OR public.has_institution_role(institution_id, ARRAY['institution_admin','invigilator','teacher']::public.institution_role[], auth.uid()));
-- student inserts only for own active attempt:
CREATE POLICY proctoring_insert_own ON public.exam_proctoring_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.exam_attempts a JOIN public.student_records s ON s.id = a.student_id
                      WHERE a.id = attempt_id AND a.institution_id = institution_id AND s.user_id = auth.uid()));

-- exam_attempt_reviews: invigilators/admins only
CREATE POLICY reviews_staff_all ON public.exam_attempt_reviews FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())
      OR public.has_institution_role(institution_id, ARRAY['institution_admin','invigilator']::public.institution_role[], auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid())
      OR public.has_institution_role(institution_id, ARRAY['institution_admin','invigilator']::public.institution_role[], auth.uid()));

-- institution_subscriptions: members may READ; only platform admin may write
CREATE POLICY subs_select_member ON public.institution_subscriptions FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_institution_member(institution_id, auth.uid()));
CREATE POLICY subs_write_platform ON public.institution_subscriptions FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
```
Column names (`student_records.user_id`, helper argument order) must be checked against the real schema by whoever applies it; this is a specification, not a tested migration.

## 6. Next steps (Phase 2+, in order)
1. Get C1 applied via Lovable; rerun `db:check` and `test-rls-isolation` with temporary credentials.
2. Decide package manager and commit a lockfile; fix `.env.example`.
3. Global auth `functionMiddleware`; unit tests for it.
4. Hide or build the placeholder nav items; start with Reports/Audit log.
5. Wire proctoring event capture with explicit consent and "observed ≠ misconduct" wording.
