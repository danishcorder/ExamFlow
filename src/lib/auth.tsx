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
import { dbRoleToRoleKey, type RoleKey } from '@/lib/roles';
import { AUTH_MODE } from '@/lib/auth-mode';

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
};

const AuthContext = createContext<AuthState | null>(null);

const ACTIVE_INST_STORAGE_PREFIX = 'examflow.active_institution.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);
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

  const user = session?.user ?? null;
  const accessToken = session?.access_token ?? null;

  const authHeaders = useCallback((): Record<string, string> => {
    if (!accessToken) return {};
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

  const workspace = bootstrapQuery.data ?? null;

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
    if (!workspace) return null;
    if (selectedInstitutionId) {
      const found = workspace.memberships.find((membership) => membership.institution_id === selectedInstitutionId);
      if (found) return found;
    }
    return workspace.memberships[0] ?? null;
  }, [workspace, selectedInstitutionId]);

  const activeInstitutionId = activeMembership?.institution_id ?? null;

  const activeRoleKey: RoleKey | null = useMemo(() => {
    if (activeMembership) return dbRoleToRoleKey(activeMembership.role);
    if (workspace?.isSuperAdmin) return 'super-admin';
    return null;
  }, [activeMembership, workspace]);

  const refreshWorkspace = useCallback(async () => {
    if (AUTH_MODE === 'none') return;
    await queryClient.invalidateQueries({ queryKey: ['workspace-bootstrap', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['institution-workspace'] });
    await queryClient.invalidateQueries({ queryKey: ['platform-overview'] });
  }, [queryClient, user?.id]);

  const signOut = useCallback(async () => {
    if (AUTH_MODE === 'supabase') {
      const { isSupabaseConfigured, supabase } = await import('@/integrations/supabase/client');
      if (isSupabaseConfigured) await supabase.auth.signOut();
    }
    setSelectedInstitutionId(null);
    queryClient.clear();
  }, [queryClient]);

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
