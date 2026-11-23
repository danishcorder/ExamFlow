import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getWorkspaceBootstrapFn } from '@/lib/workspace.functions';
import type {
  MembershipWithInstitution,
  WorkspaceBootstrap,
} from '@/lib/workspace.server';
import { dbRoleToRoleKey, roleKeyToDbRole, type RoleKey } from '@/lib/roles';
import { AUTH_MODE } from '@/lib/auth-mode';
import { localRepository, type LocalRole } from '@/lib/local-repository';

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  authHeaders: () => Record<string, string>;
  workspace: WorkspaceBootstrap | null;
  workspaceLoading: boolean;
  workspaceError: string | null;
  activeInstitutionId: string | null;
  activeMembership: MembershipWithInstitution | null;
  activeRoleKey: RoleKey | null;
  setActiveInstitutionId: (institutionId: string) => void;
  refreshWorkspace: () => Promise<void>;
  localRole: LocalRole | null;
  setLocalRole: (role: LocalRole | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

const ACTIVE_INST_STORAGE_PREFIX = 'examflow.active_institution.';
const LOCAL_ROLE_STORAGE_KEY = 'examflow:local-role';

function isValidLocalRole(value: unknown): value is LocalRole {
  return value === 'institution' || value === 'teacher' || value === 'student' || value === 'invigilator';
}

function readStoredLocalRole(): LocalRole | null {
  if (AUTH_MODE !== 'none' || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(LOCAL_ROLE_STORAGE_KEY);
    return isValidLocalRole(raw) ? raw : null;
  } catch {
    return null;
  }
}

function buildLocalAuthState(localRole: LocalRole | null): {
  user: User | null;
  workspace: WorkspaceBootstrap | null;
  activeInstitutionId: string | null;
  activeMembership: MembershipWithInstitution | null;
  activeRoleKey: RoleKey | null;
} {
  if (!localRole) {
    return {
      user: null,
      workspace: null,
      activeInstitutionId: null,
      activeMembership: null,
      activeRoleKey: null,
    };
  }

  const snap = localRepository.read();
  const rawInst = snap.data.institution[0];
  const now = new Date().toISOString();
  const institutionId = rawInst?.id ?? 'inst-local';
  const institutionName =
    typeof rawInst?.['name'] === 'string' && rawInst['name'].trim()
      ? rawInst['name']
      : 'Riverside College (sample)';
  const institutionSlug =
    typeof rawInst?.['slug'] === 'string' && rawInst['slug'].trim()
      ? rawInst['slug']
      : 'riverside-sample';
  const institutionType =
    rawInst?.['institution_type'] === 'school' ||
    rawInst?.['institution_type'] === 'college' ||
    rawInst?.['institution_type'] === 'university' ||
    rawInst?.['institution_type'] === 'training_centre'
      ? rawInst['institution_type']
      : 'college';

  const dbRole = roleKeyToDbRole(localRole) ?? 'institution_admin';
  const matchingMember =
    snap.data.members.find((m) => m['role'] === dbRole) ??
    snap.data.members.find((m) => m['role'] === localRole) ??
    snap.data.members[0];

  const userId =
    typeof matchingMember?.['userId'] === 'string'
      ? matchingMember['userId']
      : `local-user-${localRole}`;
  const fullName =
    typeof matchingMember?.['name'] === 'string'
      ? matchingMember['name']
      : `Local ${localRole}`;
  const email =
    typeof matchingMember?.['email'] === 'string'
      ? matchingMember['email']
      : `${localRole}@local.example`;
  const membershipId = matchingMember?.id ?? `member-local-${localRole}`;

  const institution: MembershipWithInstitution['institution'] = {
    id: institutionId,
    name: institutionName,
    slug: institutionSlug,
    institution_type: institutionType,
    status: 'active',
    created_by: typeof rawInst?.['created_by'] === 'string' ? rawInst['created_by'] : 'local-user-institution',
    created_at: typeof rawInst?.['created_at'] === 'string' ? rawInst['created_at'] : now,
    updated_at: typeof rawInst?.['updated_at'] === 'string' ? rawInst['updated_at'] : now,
  };

  const membership: MembershipWithInstitution = {
    id: membershipId,
    institution_id: institutionId,
    user_id: userId,
    role: dbRole,
    status: 'active',
    invited_by: null,
    created_at: now,
    updated_at: now,
    institution,
  };

  const workspace: WorkspaceBootstrap = {
    profile: {
      id: userId,
      email,
      full_name: fullName,
      phone: null,
      timezone: 'UTC',
      avatar_url: null,
      created_at: now,
      updated_at: now,
    },
    isSuperAdmin: false,
    memberships: [membership],
    pendingInvitations: [],
  };

  const user = {
    id: userId,
    app_metadata: {},
    user_metadata: { full_name: fullName },
    aud: 'authenticated',
    created_at: now,
    email,
  } as User;

  return {
    user,
    workspace,
    activeInstitutionId: institutionId,
    activeMembership: membership,
    activeRoleKey: localRole,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(AUTH_MODE !== 'none');
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);
  const [localRole, setLocalRoleState] = useState<LocalRole | null>(() => readStoredLocalRole());
  const [localRevision, setLocalRevision] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    if (AUTH_MODE === 'none') {
      setLoading(false);
      return;
    }

    void import('@/integrations/supabase/client').then(({ isSupabaseConfigured, supabase }) => {
      if (cancelled) return;
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }

      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (cancelled) return;
        setSession(nextSession);
        setLoading(false);
        if (!nextSession) {
          setSelectedInstitutionId(null);
          queryClient.removeQueries({ queryKey: ['workspace-bootstrap'] });
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
      void supabase.auth.getSession()
        .then(({ data: sessionResult }) => {
          if (cancelled) return;
          setSession(sessionResult.session);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [queryClient]);

  const setLocalRole = useCallback(
    (role: LocalRole | null) => {
      if (AUTH_MODE !== 'none') return;
      setLocalRoleState(role);
      if (typeof window !== 'undefined') {
        try {
          if (role) {
            window.sessionStorage.setItem(LOCAL_ROLE_STORAGE_KEY, role);
          } else {
            window.sessionStorage.removeItem(LOCAL_ROLE_STORAGE_KEY);
          }
        } catch {
          // Ignore storage restrictions
        }
      }
      queryClient.clear();
    },
    [queryClient],
  );

  const localAuth = useMemo(() => {
    if (AUTH_MODE !== 'none') return null;
    void localRevision;
    return buildLocalAuthState(localRole);
  }, [localRole, localRevision]);

  const user = AUTH_MODE === 'none' ? (localAuth?.user ?? null) : (session?.user ?? null);
  const accessToken = AUTH_MODE === 'none' ? null : (session?.access_token ?? null);

  const authHeaders = useCallback((): Record<string, string> => {
    if (AUTH_MODE === 'none' || !accessToken) return {};
    return { Authorization: `Bearer ${accessToken}` };
  }, [accessToken]);

  const bootstrapQuery = useQuery({
    queryKey: ['workspace-bootstrap', user?.id],
    enabled: AUTH_MODE === 'supabase' && Boolean(user && accessToken),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      if (!accessToken) throw new Error('Not authenticated');
      return getWorkspaceBootstrapFn({
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    },
  });

  const workspace =
    AUTH_MODE === 'none' ? (localAuth?.workspace ?? null) : (bootstrapQuery.data ?? null);

  useEffect(() => {
    if (AUTH_MODE === 'none' || !user || !workspace) return;
    const validIds = new Set(workspace.memberships.map((membership) => membership.institution_id));
    if (selectedInstitutionId && validIds.has(selectedInstitutionId)) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(`${ACTIVE_INST_STORAGE_PREFIX}${user.id}`);
    } catch {
      stored = null;
    }
    if (stored && validIds.has(stored)) setSelectedInstitutionId(stored);
    else setSelectedInstitutionId(workspace.memberships[0]?.institution_id ?? null);
  }, [user, workspace, selectedInstitutionId]);

  const setActiveInstitutionId = useCallback(
    (institutionId: string) => {
      if (AUTH_MODE === 'none' || !workspace || !user) return;
      const isMember = workspace.memberships.some((membership) => membership.institution_id === institutionId);
      if (!isMember) return;
      setSelectedInstitutionId(institutionId);
      try {
        localStorage.setItem(`${ACTIVE_INST_STORAGE_PREFIX}${user.id}`, institutionId);
      } catch {
        // Ignore storage write errors in private browsing.
      }
    },
    [workspace, user],
  );

  const activeMembership = useMemo(() => {
    if (AUTH_MODE === 'none') return localAuth?.activeMembership ?? null;
    if (!workspace) return null;
    if (selectedInstitutionId) {
      const found = workspace.memberships.find((membership) => membership.institution_id === selectedInstitutionId);
      if (found) return found;
    }
    return workspace.memberships[0] ?? null;
  }, [localAuth, workspace, selectedInstitutionId]);

  const activeInstitutionId =
    AUTH_MODE === 'none'
      ? (localAuth?.activeInstitutionId ?? null)
      : (activeMembership?.institution_id ?? null);

  const activeRoleKey: RoleKey | null = useMemo(() => {
    if (AUTH_MODE === 'none') return localAuth?.activeRoleKey ?? null;
    if (activeMembership) return dbRoleToRoleKey(activeMembership.role);
    if (workspace?.isSuperAdmin) return 'super-admin';
    return null;
  }, [localAuth, activeMembership, workspace]);

  const refreshWorkspace = useCallback(async () => {
    if (AUTH_MODE === 'none') {
      setLocalRevision((rev) => rev + 1);
      await queryClient.invalidateQueries();
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['workspace-bootstrap', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['institution-workspace'] });
    await queryClient.invalidateQueries({ queryKey: ['platform-overview'] });
  }, [queryClient, user?.id]);

  const signOut = useCallback(async () => {
    if (AUTH_MODE === 'none') {
      setLocalRole(null);
      return;
    }
    const { isSupabaseConfigured, supabase } = await import('@/integrations/supabase/client');
    if (isSupabaseConfigured) await supabase.auth.signOut();
    setSelectedInstitutionId(null);
    queryClient.clear();
  }, [queryClient, setLocalRole]);

  const workspaceError = bootstrapQuery.error
    ? bootstrapQuery.error instanceof Error
      ? bootstrapQuery.error.message
      : 'Failed to load workspace'
    : null;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading: AUTH_MODE === 'none' ? false : loading,
        signOut,
        authHeaders,
        workspace,
        workspaceLoading: AUTH_MODE === 'none' ? false : Boolean(user) && bootstrapQuery.isLoading,
        workspaceError: AUTH_MODE === 'none' ? null : workspaceError,
        activeInstitutionId,
        activeMembership,
        activeRoleKey,
        setActiveInstitutionId,
        refreshWorkspace,
        localRole,
        setLocalRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
