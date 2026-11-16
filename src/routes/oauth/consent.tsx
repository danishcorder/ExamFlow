import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Check, ExternalLink, Loader2, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthCard } from '@/components/app/auth-layout';
import { ErrorState, LoadingState } from '@/components/app/states';
import { StatusPill } from '@/components/app/status-pill';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  formatOAuthServerError,
  OAUTH_SCOPE_LABELS,
  parseOAuthScopes,
} from '@/lib/oauth-consent';

export const Route = createFileRoute('/oauth/consent')({
  validateSearch: (search: Record<string, unknown>): { authorization_id?: string | undefined } =>
    typeof search['authorization_id'] === 'string' && search['authorization_id'].trim().length > 0
      ? { authorization_id: search['authorization_id'].trim() }
      : {},
  head: () => ({
    meta: [
      { title: 'Authorize application — ExamFlow' },
      {
        name: 'description',
        content: 'Review and approve OAuth 2.1 access permissions for your ExamFlow account.',
      },
    ],
  }),
  component: OAuthConsentPage,
});

function OAuthConsentPage() {
  const { authorization_id: authorizationId } = Route.useSearch();
  const { user, loading: authLoading } = useAuth();
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionBusy, setDecisionBusy] = useState<'approve' | 'deny' | null>(null);

  const scopes = useMemo(() => parseOAuthScopes(details?.scope), [details?.scope]);

  useEffect(() => {
    if (authLoading || !user || !authorizationId) return;
    let cancelled = false;

    async function load() {
      setLoadingDetails(true);
      setError(null);
      const { data, error: reqErr } = await supabase.auth.oauth.getAuthorizationDetails(
        authorizationId!,
      );
      if (cancelled) return;

      if (reqErr) {
        setError(formatOAuthServerError(reqErr));
        setLoadingDetails(false);
        return;
      }

      if (!data) {
        setError('Authorization request not found or has expired.');
        setLoadingDetails(false);
        return;
      }

      if ('redirect_url' in data && data.redirect_url) {
        window.location.assign(data.redirect_url);
        return;
      }

      if ('authorization_id' in data) {
        setDetails(data);
      }
      setLoadingDetails(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, authorizationId]);

  async function handleDecision(decision: 'approve' | 'deny') {
    if (!authorizationId) return;
    setDecisionBusy(decision);
    setError(null);
    try {
      const res =
        decision === 'approve'
          ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
              skipBrowserRedirect: true,
            })
          : await supabase.auth.oauth.denyAuthorization(authorizationId, {
              skipBrowserRedirect: true,
            });

      if (res.error) {
        setError(formatOAuthServerError(res.error));
        setDecisionBusy(null);
        return;
      }

      if (res.data?.redirect_url) {
        toast.success(
          decision === 'approve' ? 'Access granted — redirecting…' : 'Access denied — redirecting…',
        );
        window.location.assign(res.data.redirect_url);
        return;
      }

      setError('OAuth server did not return a redirect URL.');
      setDecisionBusy(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit consent decision.');
      setDecisionBusy(null);
    }
  }

  const returnToConsent = authorizationId
    ? `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
    : '/oauth/consent';

  return (
    <AuthCard
      title="Authorize access"
      description="Supabase OAuth 2.1 authorization consent for your ExamFlow account."
      footer={
        <Link to="/" className="font-medium text-primary hover:underline">
          Return to ExamFlow home
        </Link>
      }
    >
      {!authorizationId ? (
        <ErrorState
          title="Missing authorization request"
          description="Open this page via a Supabase OAuth 2.1 authorization link containing an authorization_id parameter."
        />
      ) : authLoading ? (
        <LoadingState label="Checking your session…" />
      ) : !user ? (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Sign in required
            </CardTitle>
            <CardDescription>
              Sign in to review and approve the permissions requested by this application.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link to="/auth/login" search={{ redirect: returnToConsent }}>
                Sign in to continue
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth/register" search={{ redirect: returnToConsent }}>
                Create an account
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : loadingDetails ? (
        <LoadingState label="Loading application permissions…" />
      ) : error ? (
        <ErrorState title="Could not authorize request" description={error} />
      ) : details ? (
        <Card className="shadow-none">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {details.client.name}
                </CardTitle>
                <CardDescription className="mt-1">
                  Signed in as <span className="font-medium text-foreground">{details.user.email}</span>
                </CardDescription>
              </div>
              <StatusPill tone="info">OAuth 2.1</StatusPill>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {details.client.uri && (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span>Application URL</span>
                <a
                  href={details.client.uri}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-foreground hover:underline"
                >
                  {details.client.uri}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Requested permissions
              </p>
              <ul className="mt-2 space-y-2">
                {scopes.length === 0 ? (
                  <li className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                    Basic OpenID authentication
                  </li>
                ) : (
                  scopes.map((scope) => {
                    const meta = OAUTH_SCOPE_LABELS[scope];
                    return (
                      <li key={scope} className="rounded-md border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{meta?.title ?? scope}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {scope}
                          </span>
                        </div>
                        {meta && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>

            <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              After approving, you will be redirected to{' '}
              <span className="break-all font-mono text-foreground">{details.redirect_uri}</span>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={decisionBusy !== null}
                onClick={() => void handleDecision('deny')}
              >
                {decisionBusy === 'deny' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Deny
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={decisionBusy !== null}
                onClick={() => void handleDecision('approve')}
              >
                {decisionBusy === 'approve' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Allow access
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </AuthCard>
  );
}
