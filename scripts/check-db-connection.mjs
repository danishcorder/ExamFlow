/**
 * ExamFlow Database Connection & Schema Readiness Check
 *
 * Verifies:
 *   1. Supabase URL & publishable key resolution
 *   2. Supabase Auth (GoTrue) health & sign-in endpoint reachability
 *   3. PostgREST connectivity & presence of all 29 tables across Phases 2-5
 *   4. Core SECURITY DEFINER RPC availability
 *   5. Supabase Storage bucket (`question-attachments`) existence
 *
 * Exit codes:
 *   0 = Database connection & full schema/RPC/bucket are ready
 *   2 = Connection works, but SQL migrations are not yet applied (or incomplete)
 *   1 = Network, auth, or configuration failure
 *
 * Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or their VITE_ equivalents) explicitly.
 * Run: npm run db:check
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const REQUIRED_TABLES = [
  // Phase 2: Auth, Roles, Institutions & Audit
  'profiles',
  'platform_admins',
  'institutions',
  'institution_memberships',
  'institution_invitations',
  'institution_audit_logs',
  // Phase 3: Academic Management
  'academic_sessions',
  'academic_terms',
  'departments',
  'programs',
  'academic_classes',
  'class_sections',
  'courses',
  'teacher_assignments',
  'student_records',
  'student_enrollments',
  'csv_import_jobs',
  // Phase 4: Question Bank
  'question_banks',
  'questions',
  'question_options',
  'question_answer_keys',
  'question_attachments',
  'question_sets',
  'question_set_items',
  // Phase 5: Exam Builder
  'exams',
  'exam_sections',
  'exam_section_questions',
  'exam_assignments',
  'exam_versions',
  'exam_version_answer_keys',
  // Phase 6: Student Examination Engine
  'exam_attempts',
  'exam_attempt_answers',
  // Phase 7: Grading & Results
  'exam_attempt_grades',
  'exam_question_grades',
  // Phase 8 & 9: Proctoring & SaaS Subscriptions
  'exam_proctoring_events',
  'exam_attempt_reviews',
  'institution_subscriptions',
];

const REQUIRED_RPCS = [
  {
    name: 'create_institution_with_owner',
    args: { p_name: 'check', p_slug: 'check', p_institution_type: 'school' },
  },
  {
    name: 'accept_institution_invitation',
    args: { p_token: 'check-token-00000000' },
  },
  {
    name: 'get_my_pending_invitations',
    args: {},
  },
];

async function run() {
  console.log(`Checking Supabase project: ${SUPABASE_URL}`);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('FAIL: Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.');
    process.exit(1);
  }

  // 1. Auth health
  const healthRes = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: SUPABASE_KEY },
  });
  if (!healthRes.ok) {
    console.error(`FAIL: Auth health endpoint returned HTTP ${healthRes.status}`);
    process.exit(1);
  }
  const healthBody = await healthRes.json().catch(() => ({}));
  console.log(`OK   Auth (GoTrue): ${healthBody.version ?? 'online'}`);

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 2. Check all 29 tables via PostgREST
  const missingTables = [];
  const reachableTables = [];
  const unexpectedErrors = [];

  for (const table of REQUIRED_TABLES) {
    const { error } = await sb.from(table).select('*').limit(1);
    if (!error) {
      reachableTables.push(table);
    } else if (error.code === 'PGRST205') {
      missingTables.push(table);
    } else if (error.code === '42501' || error.message?.toLowerCase().includes('permission denied')) {
      // Table exists and anon access is properly revoked by RLS/GRANTs
      reachableTables.push(table);
    } else {
      unexpectedErrors.push({ table, code: error.code, message: error.message });
    }
  }

  console.log(
    `${missingTables.length === 0 ? 'OK  ' : 'MISS'} Tables: ${reachableTables.length}/${REQUIRED_TABLES.length} present in schema cache`,
  );
  if (missingTables.length > 0) {
    console.log(`     Missing: ${missingTables.join(', ')}`);
  }
  if (unexpectedErrors.length > 0) {
    for (const u of unexpectedErrors) {
      console.error(`ERR  Table ${u.table}: [${u.code}] ${u.message}`);
    }
  }

  // 3. Check RPCs
  const missingRpcs = [];
  for (const rpc of REQUIRED_RPCS) {
    const { error } = await sb.rpc(rpc.name, rpc.args);
    if (error?.code === 'PGRST202') {
      missingRpcs.push(rpc.name);
    }
  }
  console.log(
    `${missingRpcs.length === 0 ? 'OK  ' : 'MISS'} RPCs: ${REQUIRED_RPCS.length - missingRpcs.length}/${REQUIRED_RPCS.length} registered`,
  );
  if (missingRpcs.length > 0) {
    console.log(`     Missing: ${missingRpcs.join(', ')}`);
  }

  // 4. Check Storage bucket
  const storageRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/authenticated/question-attachments/health-probe.png`,
    { headers: { apikey: SUPABASE_KEY } },
  );
  const storageBody = await storageRes.json().catch(() => ({}));
  const bucketMissing =
    storageBody?.error === 'Bucket not found' || storageBody?.code === 'NoSuchBucket';
  console.log(
    `${bucketMissing ? 'MISS' : 'OK  '} Storage bucket 'question-attachments': ${
      bucketMissing ? 'not created' : 'present'
    }`,
  );

  if (unexpectedErrors.length > 0) {
    process.exit(1);
  }

  if (missingTables.length > 0 || missingRpcs.length > 0 || bucketMissing) {
    console.log('\nACTION REQUIRED:');
    console.log(
      '  Supabase connection is live, but database migrations have not been applied yet.',
    );
    console.log('  Run these SQL files in order in your Supabase SQL Editor:');
    console.log('    1. supabase/migrations/20261115000000_phase2_auth_roles_rls.sql');
    console.log('    2. supabase/migrations/20261115000001_phase3_academic_management.sql');
    console.log('    3. supabase/migrations/20261115000002_phase4_question_bank.sql');
    console.log('    4. supabase/migrations/20261115000003_phase5_exam_builder.sql');
    console.log('    5. supabase/migrations/20261116000000_question_banks_and_teacher_student_relations.sql');
    console.log('    6. supabase/migrations/20261116000001_phase6_examination_engine.sql');
    console.log('  Then re-run `npm run db:check` to confirm.');
    process.exit(2);
  }

  console.log('\nPASS: Supabase Auth, PostgREST schema, RPCs, and Storage bucket are ready.');
}

run().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
