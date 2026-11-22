import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const admin: any = supabaseAdmin;
const INVALID_LOGIN = 'Invalid username or password';

type ManagedRole = 'teacher' | 'student';
type InstitutionType = 'school' | 'college' | 'university' | 'training_centre';

function cleanUsername(value: string) {
  return value.trim().toLowerCase();
}

function temporaryPassword() {
  return `Ef${randomBytes(18).toString('base64url')}!7`;
}

function authFetch(apiKey: string): typeof fetch {
  const isNewKey = apiKey.startsWith('sb_publishable_') || apiKey.startsWith('sb_secret_');
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (isNewKey && headers.get('Authorization') === `Bearer ${apiKey}`) {
      headers.delete('Authorization');
    }
    headers.set('apikey', apiKey);
    return fetch(input, { ...init, headers });
  };
}

function createPasswordAuthClient() {
  const url = process.env['SUPABASE_URL'] ?? process.env['VITE_SUPABASE_URL'];
  const key =
    process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Supabase authentication is not configured');
  return createClient(url, key, {
    global: { fetch: authFetch(key) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function getProfileById(userId: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id,email,username,must_change_password')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`Could not load account profile: ${error.message}`);
  return data;
}

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Could not verify platform access: ${error.message}`);
  return Boolean(data);
}

async function requireInstitutionManager(actorId: string, institutionId: string) {
  const platformAdmin = await isPlatformAdmin(actorId);
  const { data: institution, error: institutionError } = await admin
    .from('institutions')
    .select('id,name,status')
    .eq('id', institutionId)
    .maybeSingle();
  if (institutionError) throw new Error(institutionError.message);
  if (!institution || institution.status !== 'active') {
    throw new Error('Institution not found or unavailable');
  }
  if (!platformAdmin) {
    const { data: membership, error } = await admin
      .from('institution_memberships')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('user_id', actorId)
      .eq('role', 'institution_admin')
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!membership) throw new Error('Institution Admin access is required');
  }
  return { institution, platformAdmin };
}

async function ensureAccountIdentifiers(email: string, username: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = cleanUsername(username);
  const { data: existingEmail, error: emailError } = await admin
    .from('profiles')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (emailError) throw new Error(emailError.message);
  if (existingEmail) throw new Error('An account already uses this email address');

  const { data: existingUsername, error: usernameError } = await admin
    .from('profiles')
    .select('id')
    .ilike('username', normalizedUsername)
    .maybeSingle();
  if (usernameError) throw new Error(usernameError.message);
  if (existingUsername) throw new Error('That username is already in use');
  return { normalizedEmail, normalizedUsername };
}

async function createAuthAccount(email: string, fullName: string, username: string) {
  const password = temporaryPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      username,
      must_change_password: true,
    },
  });
  if (error || !data?.user) throw new Error(error?.message ?? 'Could not create account');

  const { error: profileError } = await admin
    .from('profiles')
    .update({ username, must_change_password: true, full_name: fullName, email })
    .eq('id', data.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(profileError.message);
  }
  return { user: data.user, password };
}

export async function signInWithUsername(input: {
  username: string;
  password: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  redirectTo: string;
}> {
  const username = cleanUsername(input.username);
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,email,must_change_password')
    .ilike('username', username)
    .maybeSingle();
  if (profileError || !profile?.email) throw new Error(INVALID_LOGIN);

  const auth = createPasswordAuthClient();
  const { data, error } = await auth.auth.signInWithPassword({
    email: profile.email,
    password: input.password,
  });
  if (error || !data.session || !data.user) throw new Error(INVALID_LOGIN);

  const { data: memberships, error: membershipsError } = await admin
    .from('institution_memberships')
    .select('institution_id,role,created_at')
    .eq('user_id', data.user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (membershipsError) throw new Error('Could not verify workspace access');

  const membershipRows = memberships ?? [];
  const activeInstitutionIds: string[] = [];
  if (membershipRows.length) {
    const { data: institutions, error: institutionsError } = await admin
      .from('institutions')
      .select('id')
      .in('id', membershipRows.map((item: any) => item.institution_id))
      .eq('status', 'active');
    if (institutionsError) throw new Error('Could not verify workspace access');
    for (const institution of institutions ?? []) activeInstitutionIds.push(institution.id);
  }

  const activeMembership = membershipRows.find((item: any) =>
    activeInstitutionIds.includes(item.institution_id),
  );
  let redirectTo = '/app/onboarding';
  if (activeMembership) {
    const paths: Record<string, string> = {
      institution_admin: '/app/institution',
      teacher: '/app/teacher',
      student: '/app/student',
      invigilator: '/app/invigilator',
    };
    redirectTo = paths[activeMembership.role] ?? redirectTo;
  } else if (await isPlatformAdmin(data.user.id)) {
    redirectTo = '/app/super-admin';
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    mustChangePassword: Boolean(profile.must_change_password),
    redirectTo,
  };
}

export async function createManagedAccount(actorId: string, input: {
  institutionId: string;
  fullName: string;
  email: string;
  username: string;
  role: ManagedRole;
  studentCode?: string;
}): Promise<{ username: string; temporaryPassword: string; role: ManagedRole; fullName: string }> {
  await requireInstitutionManager(actorId, input.institutionId);
  const { normalizedEmail, normalizedUsername } = await ensureAccountIdentifiers(
    input.email,
    input.username,
  );

  let studentRecord: any = null;
  let createStudentRecord = false;
  if (input.role === 'student') {
    const { data: existingRecord, error } = await admin
      .from('student_records')
      .select('id,membership_id,student_code')
      .eq('institution_id', input.institutionId)
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (existingRecord?.membership_id) {
      throw new Error('A student account is already linked to this student record');
    }
    if (existingRecord) {
      studentRecord = existingRecord;
    } else {
      if (!input.studentCode?.trim()) throw new Error('Enter a student code for this account');
      const { data: duplicateCode, error: codeError } = await admin
        .from('student_records')
        .select('id')
        .eq('institution_id', input.institutionId)
        .ilike('student_code', input.studentCode.trim())
        .maybeSingle();
      if (codeError) throw new Error(codeError.message);
      if (duplicateCode) throw new Error('That student code is already in use in this institution');
      createStudentRecord = true;
    }
  }

  const { user, password } = await createAuthAccount(
    normalizedEmail,
    input.fullName.trim(),
    normalizedUsername,
  );
  let membershipId: string | null = null;
  let createdRecordId: string | null = null;
  let linkedExistingRecordId: string | null = null;
  try {
    const { data: membership, error: membershipError } = await admin
      .from('institution_memberships')
      .insert({
        institution_id: input.institutionId,
        user_id: user.id,
        role: input.role,
        status: 'active',
        invited_by: actorId,
      })
      .select('id')
      .single();
    if (membershipError || !membership) throw new Error(membershipError?.message ?? 'Could not assign role');
    membershipId = membership.id;

    if (input.role === 'student') {
      if (createStudentRecord) {
        const { data: inserted, error } = await admin
          .from('student_records')
          .insert({
            institution_id: input.institutionId,
            membership_id: membershipId,
            student_code: input.studentCode!.trim(),
            full_name: input.fullName.trim(),
            email: normalizedEmail,
            created_by: actorId,
          })
          .select('id')
          .single();
        if (error || !inserted) throw new Error(error?.message ?? 'Could not create student record');
        createdRecordId = inserted.id;
      } else if (studentRecord) {
        const { error } = await admin
          .from('student_records')
          .update({ membership_id: membershipId, full_name: input.fullName.trim() })
          .eq('id', studentRecord.id)
          .eq('institution_id', input.institutionId)
          .is('membership_id', null);
        if (error) throw new Error(error.message);
        linkedExistingRecordId = studentRecord.id;
      }
    }

    const { error: auditError } = await admin.from('institution_audit_logs').insert({
      institution_id: input.institutionId,
      actor_user_id: actorId,
      action: 'account.created',
      target_type: 'institution_membership',
      target_id: membershipId,
      metadata: { username: normalizedUsername, role: input.role },
    });
    if (auditError) throw new Error(`Account was created but the audit entry failed: ${auditError.message}`);
  } catch (error) {
    if (createdRecordId) {
      await admin.from('student_records').delete().eq('id', createdRecordId);
    } else if (linkedExistingRecordId) {
      await admin
        .from('student_records')
        .update({ membership_id: null })
        .eq('id', linkedExistingRecordId)
        .eq('membership_id', membershipId);
    }
    if (membershipId) await admin.from('institution_memberships').delete().eq('id', membershipId);
    await admin.auth.admin.deleteUser(user.id);
    throw error;
  }

  return {
    username: normalizedUsername,
    temporaryPassword: password,
    role: input.role,
    fullName: input.fullName.trim(),
  };
}

export async function createInstitutionWithFirstAdmin(actorId: string, input: {
  name: string;
  slug: string;
  institutionType: InstitutionType;
  adminFullName: string;
  adminEmail: string;
  adminUsername: string;
}): Promise<{
  institutionId: string;
  institutionName: string;
  adminUsername: string;
  temporaryPassword: string;
}> {
  if (!(await isPlatformAdmin(actorId))) throw new Error('Platform Super Admin access is required');
  const { normalizedEmail, normalizedUsername } = await ensureAccountIdentifiers(
    input.adminEmail,
    input.adminUsername,
  );
  const { user, password } = await createAuthAccount(
    normalizedEmail,
    input.adminFullName.trim(),
    normalizedUsername,
  );
  let institutionId: string | null = null;
  try {
    const { data: institution, error: institutionError } = await admin
      .from('institutions')
      .insert({
        name: input.name.trim(),
        slug: input.slug.trim().toLowerCase(),
        institution_type: input.institutionType,
        status: 'active',
        created_by: actorId,
      })
      .select('id,name')
      .single();
    if (institutionError || !institution) {
      throw new Error(institutionError?.message ?? 'Could not create institution');
    }
    institutionId = institution.id;

    const { data: membership, error: membershipError } = await admin
      .from('institution_memberships')
      .insert({
        institution_id: institutionId,
        user_id: user.id,
        role: 'institution_admin',
        status: 'active',
        invited_by: actorId,
      })
      .select('id')
      .single();
    if (membershipError || !membership) {
      throw new Error(membershipError?.message ?? 'Could not create the first Institution Admin');
    }

    const { error: auditError } = await admin.from('institution_audit_logs').insert({
      institution_id: institutionId,
      actor_user_id: actorId,
      action: 'institution.created',
      target_type: 'institution',
      target_id: institutionId,
      metadata: {
        name: institution.name,
        slug: input.slug.trim().toLowerCase(),
        first_admin_user_id: user.id,
        first_admin_username: normalizedUsername,
      },
    });
    if (auditError) throw new Error(`Institution was created but the audit entry failed: ${auditError.message}`);

    const { error: memberAuditError } = await admin.from('institution_audit_logs').insert({
      institution_id: institutionId,
      actor_user_id: actorId,
      action: 'account.created',
      target_type: 'institution_membership',
      target_id: membership.id,
      metadata: { username: normalizedUsername, role: 'institution_admin' },
    });
    if (memberAuditError) throw new Error(`Institution Admin was created but the audit entry failed: ${memberAuditError.message}`);

    return {
      institutionId,
      institutionName: institution.name,
      adminUsername: normalizedUsername,
      temporaryPassword: password,
    };
  } catch (error) {
    if (institutionId) {
      await admin.from('institution_memberships').delete().eq('institution_id', institutionId);
      await admin.from('institution_audit_logs').delete().eq('institution_id', institutionId);
      await admin.from('institutions').delete().eq('id', institutionId);
    }
    await admin.auth.admin.deleteUser(user.id);
    throw error;
  }
}

export async function resetManagedAccountPassword(actorId: string, input: {
  institutionId: string;
  membershipId: string;
}): Promise<{ username: string; temporaryPassword: string }> {
  await requireInstitutionManager(actorId, input.institutionId);
  const { data: membership, error: membershipError } = await admin
    .from('institution_memberships')
    .select('id,user_id,role')
    .eq('id', input.membershipId)
    .eq('institution_id', input.institutionId)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (!membership || !['teacher', 'student'].includes(membership.role)) {
    throw new Error('Only teacher and student account passwords can be reset here');
  }
  const profile = await getProfileById(membership.user_id);
  if (!profile) throw new Error('Account profile not found');
  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(membership.user_id);
  if (authUserError || !authUser?.user) throw new Error(authUserError?.message ?? 'Account not found');

  const password = temporaryPassword();
  const oldMetadata = authUser.user.user_metadata ?? {};
  const { error: profileError } = await admin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', membership.user_id);
  if (profileError) throw new Error(profileError.message);

  const { error: passwordError } = await admin.auth.admin.updateUserById(membership.user_id, {
    password,
    user_metadata: { ...oldMetadata, must_change_password: true },
  });
  if (passwordError) {
    await admin.from('profiles').update({ must_change_password: profile.must_change_password }).eq('id', membership.user_id);
    throw new Error(passwordError.message);
  }

  const { error: auditError } = await admin.from('institution_audit_logs').insert({
    institution_id: input.institutionId,
    actor_user_id: actorId,
    action: 'account.password_reset',
    target_type: 'institution_membership',
    target_id: membership.id,
    metadata: { username: profile.username, role: membership.role },
  });
  if (auditError) throw new Error(`Password was reset but the audit entry failed: ${auditError.message}`);

  return { username: profile.username, temporaryPassword: password };
}

export async function changeOwnPassword(userId: string, password: string): Promise<{ ok: true }> {
  const profile = await getProfileById(userId);
  if (!profile) throw new Error('Account profile not found');
  if (!profile.must_change_password) throw new Error('This account does not require a temporary-password change');

  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
  if (authUserError || !authUser?.user) throw new Error(authUserError?.message ?? 'Account not found');
  const oldMetadata = authUser.user.user_metadata ?? {};

  const { error: profileError } = await admin
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', userId);
  if (profileError) throw new Error(profileError.message);

  const { error: passwordError } = await admin.auth.admin.updateUserById(userId, {
    password,
    user_metadata: { ...oldMetadata, must_change_password: false },
  });
  if (passwordError) {
    await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
    throw new Error(passwordError.message);
  }

  return { ok: true };
}
