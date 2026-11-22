import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { AuthCard } from '@/components/app/auth-layout';

export const Route = createFileRoute('/auth/register')({
  head: () => ({
    meta: [
      { title: 'Account access — ExamFlow' },
      { name: 'description', content: 'ExamFlow accounts are provided by administrators.' },
      { property: 'og:title', content: 'Account access — ExamFlow' },
      { property: 'og:description', content: 'ExamFlow accounts are provided by administrators.' },
    ],
  }),
  component: RegistrationDisabled,
});

function RegistrationDisabled() {
  return (
    <AuthCard
      title="Accounts are managed by administrators"
      description="Public registration is disabled. Ask your Super Admin or Institution Admin to create your account and provide your username and temporary password."
    >
      <Button asChild className="w-full">
        <Link to="/auth/login">Back to sign in</Link>
      </Button>
    </AuthCard>
  );
}
