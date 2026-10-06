'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getRoleHome, getSafeRedirect } from '@/lib/auth/redirect';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get('redirect');
  const redirect = getSafeRedirect(requestedRedirect);
  const hasRequestedRedirect = Boolean(requestedRedirect && (redirect !== '/' || requestedRedirect === '/'));

  const { registerWithEmail, loginWithGoogle } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!agreeTerms) {
      setError('Please agree to the Terms of Service to create an account.');
      return;
    }

    setIsLoading(true);

    try {
      await registerWithEmail(email, password, displayName);
      setVerificationEmail(email);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please sign in instead.');
      } else if (code === 'auth/weak-password') {
        setError('Please choose a stronger password.');
      } else {
        setError((err as Error).message || 'Failed to create account. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const role = await loginWithGoogle();
      router.push(hasRequestedRedirect ? redirect : getRoleHome(role));
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== 'auth/popup-closed-by-user') {
        setError((err as Error).message || 'Google registration was interrupted. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="font-serif text-2xl font-bold tracking-tight text-zinc-950">Join Casaio</h2>
        <p className="mt-1 text-xs text-zinc-500">Create your account to unlock curated drops and order tracking</p>
      </div>

      {verificationEmail && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <h3 className="font-semibold">Check your email</h3>
          <p className="mt-1">
            We sent a verification link to <strong>{verificationEmail}</strong>. Open it to verify your address,
            then sign in to your account.
          </p>
          <Link
            href={`/login?redirect=${encodeURIComponent(redirect)}`}
            className="mt-3 inline-block font-semibold underline"
          >
            Continue to sign in
          </Link>
        </div>
      )}

      {!verificationEmail && <>
      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 animate-fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Google Sign Up */}
      <button
        type="button"
        onClick={handleGoogleSignup}
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
        <span>Sign up with Google</span>
      </button>

      <div className="relative flex items-center justify-center">
        <div className="border-t border-zinc-200 w-full" />
        <span className="bg-white px-3 text-[11px] font-medium text-zinc-400 uppercase tracking-wider relative">
          Or register with email
        </span>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <Input
          label="Full Name"
          type="text"
          required
          autoComplete="name"
          placeholder="Aarav Sharma"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          leftIcon={<User className="w-4 h-4" />}
        />

        <Input
          label="Email Address"
          type="email"
          required
          autoComplete="email"
          placeholder="aarav@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="w-4 h-4" />}
        />

        <Input
          label="Password (min. 6 characters)"
          type={showPassword ? 'text' : 'password'}
          required
          autoComplete="new-password"
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

        <Input
          label="Confirm Password"
          type={showPassword ? 'text' : 'password'}
          required
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
        />

        <div className="flex items-start gap-2 pt-1">
          <input
            id="terms"
            type="checkbox"
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            className="mt-0.5 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
          />
          <label htmlFor="terms" className="text-xs text-zinc-600 leading-normal">
            I agree to the{' '}
            <Link href="/terms" className="text-zinc-900 underline hover:text-orange-700">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-zinc-900 underline hover:text-orange-700">
              Privacy Policy
            </Link>.
          </label>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          className="w-full mt-2"
        >
          Create Account
        </Button>
      </form>

      <div className="pt-2 text-center text-xs text-zinc-500">
        Already have an account?{' '}
        <Link
          href={`/login?redirect=${encodeURIComponent(redirect)}`}
          className="font-semibold text-zinc-900 hover:text-orange-700 transition-colors underline"
        >
          Sign in
        </Link>
      </div>
      </>}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
