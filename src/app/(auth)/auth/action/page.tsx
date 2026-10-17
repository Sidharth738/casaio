'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  applyActionCode,
  confirmPasswordReset,
  reload,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { auth } from '@/lib/firebase/client';
import { getActionErrorMessage, validateNewPassword } from '@/lib/auth/action-code';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
type ActionStatus = 'checking' | 'ready' | 'processing' | 'success' | 'invalid' | 'error';
type ActionMode = 'resetPassword' | 'verifyEmail' | null;

function FirebaseActionForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refreshSession } = useAuth();
  const modeParam = searchParams.get('mode');
  const actionCode = searchParams.get('oobCode');
  const mode: ActionMode = modeParam === 'resetPassword' || modeParam === 'verifyEmail' ? modeParam : null;
  const [status, setStatus] = useState<ActionStatus>(mode && actionCode ? 'checking' : 'invalid');
  const [email, setEmail] = useState('');
  const [validatedActionCode, setValidatedActionCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const handledAction = useRef<string | null>(null);
  const completedAction = useRef(false);

  useEffect(() => {
    if (completedAction.current) return;
    if (!mode || !actionCode) return;

    const actionKey = `${mode}:${actionCode}`;
    if (handledAction.current === actionKey) return;
    handledAction.current = actionKey;
    setError(null);

    if (mode === 'resetPassword') {
      void verifyPasswordResetCode(auth, actionCode)
        .then((accountEmail) => {
          setValidatedActionCode(actionCode);
          setEmail(accountEmail);
          setStatus('ready');
          // Keep the validated one-time code in memory, not in the address bar.
          router.replace('/auth/action?mode=resetPassword');
        })
        .catch((cause: unknown) => {
          setError(getActionErrorMessage(cause));
          setStatus((cause as { code?: string })?.code === 'auth/network-request-failed' ? 'error' : 'invalid');
        });
      return;
    }

    void applyActionCode(auth, actionCode)
      .then(async () => {
        completedAction.current = true;
        setStatus('success');
        if (auth.currentUser) {
          try {
            await reload(auth.currentUser);
            await refreshSession();
          } catch {
            // Applying the action code is authoritative; session refresh is best-effort.
          }
        }
        // Remove the one-time code from the address bar after it has been applied.
        router.replace('/auth/action?mode=verifyEmail');
      })
      .catch((cause: unknown) => {
        setError(getActionErrorMessage(cause));
        setStatus((cause as { code?: string })?.code === 'auth/network-request-failed' ? 'error' : 'invalid');
      });
  }, [actionCode, mode, refreshSession, router]);

  const handlePasswordReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validatedActionCode || status !== 'ready') return;
    setError(null);

    const validationError = validateNewPassword(password, confirmPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    setStatus('processing');
    try {
      await confirmPasswordReset(auth, validatedActionCode, password);
      completedAction.current = true;
      setValidatedActionCode(null);
      setPassword('');
      setConfirmPassword('');
      setStatus('success');
      router.replace('/auth/action?mode=resetPassword');
    } catch (cause: unknown) {
      setError(getActionErrorMessage(cause));
      const code = (cause as { code?: string })?.code;
      if (code === 'auth/weak-password' || code === 'auth/network-request-failed') {
        setStatus('ready');
      } else {
        setValidatedActionCode(null);
        setStatus('invalid');
      }
    }
  };

  if (status === 'checking' || status === 'processing') {
    return (
      <div className="space-y-4 py-3 text-center" role="status" aria-live="polite">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-700 ring-1 ring-orange-100">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold text-zinc-950">
            {status === 'processing' ? 'Updating your password' : 'Checking your secure link'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">This may take a few seconds.</p>
        </div>
      </div>
    );
  }

  if (mode === 'verifyEmail') {
    const verified = status === 'success';
    return (
      <div className="space-y-5 text-center" aria-live="polite">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ring-1 ${status === 'success' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-amber-100'}`}>
          {status === 'success' ? <CheckCircle2 className="h-7 w-7" aria-hidden="true" /> : <AlertCircle className="h-7 w-7" aria-hidden="true" />}
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700">Casaio account security</p>
          <h1 className="font-serif text-2xl font-bold text-zinc-950">
            {verified ? 'Email verified successfully.' : status === 'error' ? 'We couldn’t check this link' : 'This verification link needs attention'}
          </h1>
          <p className="text-sm leading-6 text-zinc-600">
            {verified
              ? 'Your email is confirmed. You can now sign in to your Casaio account.'
              : error || 'This link is invalid, expired, or has already been used. Request a new verification email from the sign-in page.'}
          </p>
        </div>
        <Link href={verified ? '/login?verified=1' : '/login'} className="block pt-1">
          <Button variant="primary" size="lg" className="w-full">
            {verified ? 'Continue to login' : 'Go to sign in'}
          </Button>
        </Link>
      </div>
    );
  }

  if (mode !== 'resetPassword' || (!actionCode && !validatedActionCode) || status === 'invalid' || status === 'error') {
    return (
      <div className="space-y-5 text-center" aria-live="polite">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <AlertCircle className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700">Password recovery</p>
          <h1 className="font-serif text-2xl font-bold text-zinc-950">
            {status === 'error' ? 'We couldn’t check this reset link' : 'This reset link is no longer valid'}
          </h1>
          <p className="text-sm leading-6 text-zinc-600">{error || 'Request a new password-reset email and use the latest link.'}</p>
        </div>
        <div className="space-y-3">
          <Link href="/forgot-password" className="block">
            <Button variant="primary" size="lg" className="w-full">Request a new link</Button>
          </Link>
          <Link href="/login" className="inline-flex min-h-10 items-center px-3 text-sm font-medium text-zinc-600 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600">Back to sign in</Link>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="space-y-5 text-center" aria-live="polite">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700">Password updated</p>
          <h1 className="font-serif text-2xl font-bold text-zinc-950">You&apos;re all set</h1>
          <p className="text-sm leading-6 text-zinc-600">Your Casaio password has been changed. Sign in with your new password.</p>
        </div>
        <Link href="/login" className="block pt-1">
          <Button variant="primary" size="lg" className="w-full">Return to login</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-700 ring-1 ring-orange-100">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700">Choose a new password</p>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-zinc-950">Reset your password</h1>
          <p className="text-sm leading-6 text-zinc-600">Create a new password for {email}.</p>
        </div>
      </div>

      <form onSubmit={handlePasswordReset} className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">{error}</p>}
        <Input
          label="New password"
          type={showPassword ? 'text' : 'password'}
          name="new-password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          leftIcon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
          rightIcon={<button type="button" aria-label={showPassword ? 'Hide new password' : 'Show new password'} onClick={() => setShowPassword((visible) => !visible)} className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
          helperText="Use at least 6 characters."
        />
        <Input
          label="Confirm new password"
          type={showConfirmPassword ? 'text' : 'password'}
          name="confirm-password"
          autoComplete="new-password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          leftIcon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
          rightIcon={<button type="button" aria-label={showConfirmPassword ? 'Hide confirmation' : 'Show confirmation'} onClick={() => setShowConfirmPassword((visible) => !visible)} className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600">{showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
        />
        <Button type="submit" variant="primary" size="lg" className="w-full">Save new password</Button>
      </form>
      <div className="flex items-center justify-center gap-2 border-t border-zinc-100 pt-4 text-[11px] text-zinc-500">
        <MailCheck className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        <span>Reset links can only be used once.</span>
      </div>
    </div>
  );
}

export default function FirebaseActionPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>}>
      <FirebaseActionForm />
    </Suspense>
  );
}
