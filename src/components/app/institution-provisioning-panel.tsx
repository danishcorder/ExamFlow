import { useState, type FormEvent } from 'react';
import { Copy, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorState } from '@/components/app/states';
import { useAuth } from '@/lib/auth';
import { createInstitutionWithFirstAdminFn } from '@/lib/provisioning.functions';

const institutionTypes = ['school', 'college', 'university', 'training_centre'] as const;
type InstitutionType = (typeof institutionTypes)[number];

type SetupCredentials = {
  institutionName: string;
  username: string;
  temporaryPassword: string;
};

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function InstitutionProvisioningPanel({ onCreated }: { onCreated: () => void }) {
  const { authHeaders } = useAuth();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [institutionType, setInstitutionType] = useState<InstitutionType>('university');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<SetupCredentials | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCredentials(null);
    setBusy(true);
    try {
      const created = await createInstitutionWithFirstAdminFn({
        data: {
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          institutionType,
          adminFullName: adminFullName.trim(),
          adminEmail: adminEmail.trim(),
          adminUsername: adminUsername.trim(),
        },
        headers: authHeaders(),
      });
      setCredentials({
        institutionName: created.institutionName,
        username: created.adminUsername,
        temporaryPassword: created.temporaryPassword,
      });
      setName('');
      setSlug('');
      setSlugTouched(false);
      setAdminFullName('');
      setAdminEmail('');
      setAdminUsername('');
      toast.success('Institution and first admin created');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create institution');
    } finally {
      setBusy(false);
    }
  }

  async function copyCredentials() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        `Institution: ${credentials.institutionName}\nUsername: ${credentials.username}\nTemporary password: ${credentials.temporaryPassword}`,
      );
      toast.success('Credentials copied');
    } catch {
      setError('Could not copy credentials. Select and copy them manually.');
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Create an institution and first admin</CardTitle>
        <CardDescription>
          The new Institution Admin gets a temporary password and must change it at first sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorState title="Could not create institution" description={error} />}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-institution-name">Institution name</Label>
              <Input
                id="new-institution-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!slugTouched) setSlug(toSlug(event.target.value));
                }}
                required
                minLength={2}
                maxLength={120}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="new-institution-slug">Institution URL name</Label>
              <Input
                id="new-institution-slug"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value.toLowerCase());
                }}
                required
                minLength={2}
                maxLength={80}
                className="mt-1.5 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="new-institution-type">Institution type</Label>
              <Select value={institutionType} onValueChange={(value) => setInstitutionType(value as InstitutionType)}>
                <SelectTrigger id="new-institution-type" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="school">School</SelectItem>
                  <SelectItem value="college">College</SelectItem>
                  <SelectItem value="university">University</SelectItem>
                  <SelectItem value="training_centre">Training centre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="first-admin-name">First admin full name</Label>
              <Input
                id="first-admin-name"
                value={adminFullName}
                onChange={(event) => setAdminFullName(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="first-admin-email">First admin email</Label>
              <Input
                id="first-admin-email"
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                autoComplete="email"
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="first-admin-username">First admin username</Label>
              <Input
                id="first-admin-username"
                value={adminUsername}
                onChange={(event) => setAdminUsername(event.target.value.toLowerCase())}
                autoCapitalize="none"
                spellCheck={false}
                minLength={3}
                maxLength={32}
                required
                className="mt-1.5"
              />
            </div>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create institution
          </Button>
        </form>

        {credentials && (
          <div className="space-y-3 rounded-lg border p-4" role="status" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">First admin credentials for {credentials.institutionName}</p>
                <p className="text-xs text-muted-foreground">Share securely; the password is shown only in this result.</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => void copyCredentials()}>
                <Copy className="h-4 w-4" />
                Copy credentials
              </Button>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Username</dt>
                <dd className="break-all font-mono">{credentials.username}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Temporary password</dt>
                <dd className="break-all font-mono">{credentials.temporaryPassword}</dd>
              </div>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
