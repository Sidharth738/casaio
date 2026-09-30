'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { ShieldAlert, ArrowLeft, Home, LogOut, Loader2 } from 'lucide-react';

function UnauthorizedContent() {
  const searchParams = useSearchParams();
  const requiredRole = searchParams.get('requiredRole') || 'authorized';
  const { user, role, logout } = useAuth();

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-16">
      <Container size="sm">
        <div className="bg-white p-8 sm:p-12 rounded-2xl border border-zinc-200 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
              Access Restricted
            </h1>
            <p className="text-sm text-zinc-600 max-w-md mx-auto">
              This portal requires <strong className="text-zinc-900 uppercase font-mono">{requiredRole}</strong> clearance.
              Your current account role is <span className="px-2 py-0.5 rounded bg-zinc-100 font-mono text-xs uppercase font-semibold text-zinc-800">{role}</span>.
            </p>
          </div>

          {user && (
            <p className="text-xs text-zinc-400">
              Signed in as: <span className="font-medium text-zinc-600">{user.email}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/">
              <Button variant="primary" size="md" leftIcon={<Home className="w-4 h-4" />}>
                Storefront
              </Button>
            </Link>

            <Link href="/account/profile">
              <Button variant="secondary" size="md" leftIcon={<ArrowLeft className="w-4 h-4" />}>
                My Account
              </Button>
            </Link>

            {user && (
              <Button
                variant="outline"
                size="md"
                onClick={() => logout()}
                leftIcon={<LogOut className="w-4 h-4 text-red-600" />}
              >
                Sign Out
              </Button>
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
        </div>
      }
    >
      <UnauthorizedContent />
    </Suspense>
  );
}
