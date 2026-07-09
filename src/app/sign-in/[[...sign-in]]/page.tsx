import { redirect } from 'next/navigation';
import { ClerkSignInView } from '@/components/ClerkSignInView';
import { clerkEnvConfigured, getAuthMode } from '@/lib/authMode';

export default function SignInPage() {
  const mode = getAuthMode();

  if (mode === 'legacy' || !clerkEnvConfigured()) {
    redirect('/');
  }

  return <ClerkSignInView showLegacyLink={mode === 'dual'} />;
}