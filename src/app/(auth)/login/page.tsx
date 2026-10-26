'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getRoleHome, getSafeRedirect } from '@/lib/auth/redirect';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { isFirebaseEmulatorMode } from '@/lib/firebase/client';
import { getVerificationActionLabel, getVerificationDeliveryMessage, getVerificationPendingInstructions, type VerificationDelivery } from '@/lib/auth/verification-delivery';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get('redirect');
  const redirect = getSafeRedirect(requestedRedirect);
  const hasRequestedRedirect = Boolean(requestedRedirect && (redirect !== '/' || requestedRedirect === '/'));

  const { loginWithEmail, loginWithGoogle, resendVerificationEmail } = useAuth();
  const emailVerified = searchParams.get('verified') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setResendMessage(null);
    setIsLoading(true);

    let role: string;
    try {
      role = await loginWithEmail(email, password);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('Invalid email or password. Please verify and try again.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please reset your password or try again later.');
      } else if (code === 'auth/email-not-verified') {
        setError((err as Error).message);
        setNeedsVerification(true);
        const delivery = (err as { verificationDelivery?: VerificationDelivery }).verificationDelivery;
        setResendCooldown(delivery && delivery !== 'failed' ? 60 : 0);
      } else if (code === 'auth/profile-initialization-failed' || code === 'auth/session-creation-failed') {
        setError((err as Error).message);
      } else {
        setError((err as Error).message || 'Failed to sign in. Please try again.');
      }
      setIsLoading(false);
      return;
    }

    try {
      router.push(hasRequestedRedirect ? redirect : getRoleHome(role));
    } catch {
      setError('You are signed in, but we could not open the next page. Please use the site navigation to continue.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setResendMessage(null);
    try {
      const delivery = await resendVerificationEmail(email, password);
      setResendMessage(getVerificationDeliveryMessage(delivery));
      setResendCooldown(60);
    } catch (cause: unknown) {
      const code = (cause as { code?: string })?.code;
      if (code === 'auth/email-already-verified') {
        setResendMessage('This email is already verified. You can sign in now.');
      } else if (code === 'auth/too-many-requests') {
        setResendMessage('Too many emails were requested. Please wait a few minutes and try again.');
        setResendCooldown(60);
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setResendMessage('We could not verify those sign-in details. Check your email and password, then try again.');
      } else {
        setResendMessage(getVerificationDeliveryMessage('failed'));
      }
    } finally {
      setIsResending(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);
    let role: string;
    try {
      role = await loginWithGoogle();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== 'auth/popup-closed-by-user') {
        setError((err as Error).message || 'Google sign-in was interrupted. Please try again.');
      }
      setIsLoading(false);
      return;
    }

    try {
      router.push(hasRequestedRedirect ? redirect : getRoleHome(role));
    } catch {
      setError('You are signed in, but we could not open the next page. Please use the site navigation to continue.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="font-serif text-2xl font-bold tracking-tight text-zinc-950">Welcome Back</h2>
        <p className="mt-1 text-xs text-zinc-500">Sign in to your Casaio account to continue</p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 animate-fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {needsVerification && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950" aria-live="polite">
          <p>{getVerificationPendingInstructions(isFirebaseEmulatorMode)}</p>
          <button
            type="button"
            onClick={handleResendVerification}
            disabled={isResending || resendCooldown > 0 || !email || !password}
            className="min-h-10 rounded px-1 font-semibold text-orange-800 underline decoration-orange-300 underline-offset-4 hover:text-orange-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 disabled:opacity-50"
          >
            {isResending ? (isFirebaseEmulatorMode ? 'Creating verification link…' : 'Sending verification email…') : resendCooldown > 0 ? `Try again in ${resendCooldown}s` : getVerificationActionLabel(isFirebaseEmulatorMode)}
          </button>
          {resendMessage && <p className="text-xs leading-5" role="status">{resendMessage}</p>}
        </div>
      )}

      {emailVerified && !error && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          Email verified. You can now sign in.
        </div>
      )}

      {/* Google Login Button */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-zinc-300 rounded-md shadow-2xs bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors disabled:opacity-50"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>Continue with Google</span>
      </button>

      <div className="relative flex items-center justify-center">
        <div className="border-t border-zinc-200 w-full" />
        <span className="bg-white px-3 text-[11px] font-medium text-zinc-400 uppercase tracking-wider relative">
          Or with email
        </span>
      </div>

      <form onSubmit={handleEmailLogin} className="space-y-4">
        <Input
          label="Email Address"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="w-4 h-4" />}
        />

        <div>
          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="w-4 h-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="focus:outline-none hover:text-zinc-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
          </div>

          <div className="flex items-center justify-end mt-1.5">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-orange-700 hover:text-orange-800 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          className="w-full mt-2"
        >
          Sign In
        </Button>
      </form>

      <div className="pt-2 text-center text-xs text-zinc-500">
        Don&apos;t have an account yet?{' '}
        <Link
          href={`/register?redirect=${encodeURIComponent(redirect)}`}
          className="font-semibold text-zinc-900 hover:text-orange-700 transition-colors underline"
        >
          Create account
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
