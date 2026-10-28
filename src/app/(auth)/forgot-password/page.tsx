'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, CheckCircle2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading || cooldownSeconds > 0) return;
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address and try again.');
      return;
    }
    setIsLoading(true);

    try {
      await resetPassword(normalizedEmail);
      setCooldownSeconds(30);
      setIsSuccess(true);
    } catch (cause: unknown) {
      const code = (cause as { code?: string })?.code;
      if (code === 'auth/user-not-found') {
        // Keep the response identical for registered and unregistered emails.
        setIsSuccess(true);
      } else if (code === 'auth/too-many-requests') {
        setError('Too many requests were made. Please wait a few minutes before trying again.');
      } else if (code === 'auth/invalid-email') {
        setError('Enter a valid email address and try again.');
      } else {
        setError('We could not send the request right now. Check your connection and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="space-y-6 text-center" aria-live="polite">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-700 ring-1 ring-orange-100">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700">A secure next step</p>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-zinc-950">Check your inbox</h1>
          <p className="text-sm leading-6 text-zinc-600">
            If an account exists for this email, a password-reset link will be sent. Check your spam folder too.
          </p>
        </div>
        <Link href="/login" className="block pt-1">
          <Button variant="primary" size="lg" className="w-full">Return to sign in</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-700 ring-1 ring-orange-100">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700">Account recovery</p>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-zinc-950">Forgot your password?</h1>
          <p className="text-sm leading-6 text-zinc-600">
            Enter your email and we&apos;ll send a secure link to help you get back to your Casaio account.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
        <Input
          label="Email address"
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
          aria-describedby="reset-email-help"
        />
        <p id="reset-email-help" className="-mt-2 text-xs leading-5 text-zinc-500">
          We&apos;ll only use this address to send account recovery instructions.
        </p>
        <Button type="submit" variant="primary" size="lg" isLoading={isLoading} className="w-full">
          {isLoading ? 'Sending instructions' : cooldownSeconds > 0 ? `Try again in ${cooldownSeconds}s` : 'Send reset link'}
        </Button>
      </form>

      <div className="flex items-center justify-center gap-2 border-t border-zinc-100 pt-4 text-[11px] text-zinc-500">
        <ShieldCheck className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        <span>Your account details stay private.</span>
      </div>
      <div className="text-center">
        <Link href="/login" className="inline-flex min-h-10 items-center gap-2 rounded px-2 text-sm font-medium text-zinc-700 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
