'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Container } from '@/components/ui/Container';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Store,
  Clock,
  PlusCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSellerProfile } from '@/lib/firebase/firestore';
import type { SellerProfile } from '@/types';

export default function SellerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, role, isLoading: authLoading } = useAuth();
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [isFetched, setIsFetched] = useState(false);

  // If user is on the registration page itself, don't apply the gating
  const isRegisterPage = pathname === '/seller/register';
  const profileLoading = !isFetched && Boolean(user) && !isRegisterPage;

  useEffect(() => {
    let isMounted = true;
    if (!user || isRegisterPage) return;

    getSellerProfile(user.uid)
      .then((profile) => {
        if (isMounted) setSellerProfile(profile);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsFetched(true);
      });

    return () => {
      isMounted = false;
    };
  }, [user, isRegisterPage]);

  if (isRegisterPage) {
    return <>{children}</>;
  }

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600 mb-3" />
        <p className="text-xs">Authenticating seller portal credentials...</p>
      </div>
    );
  }

  // Not signed in
  if (!user) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-zinc-200 p-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto text-zinc-500">
            <Store className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-zinc-950">Seller Portal</h2>
          <p className="text-xs text-zinc-500">
            Please sign in with your verified merchant account to access your inventory and order dispatch system.
          </p>
          <div className="pt-2">
            <Link href="/login?redirect=/seller/dashboard">
              <Button variant="primary" size="md" className="w-full">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // If user has applied and is pending approval
  if (role !== 'seller' && role !== 'admin') {
    if (sellerProfile?.status === 'pending') {
      return (
        <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-2xl border border-amber-200 p-8 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
              <Clock className="w-7 h-7" />
            </div>
            <div>
              <Badge variant="accent" size="sm" className="mb-2">
                Application Under Review
              </Badge>
              <h2 className="font-serif text-2xl font-bold text-zinc-950">
                {sellerProfile.storeName}
              </h2>
              <p className="text-xs text-zinc-500 mt-2 max-w-sm mx-auto leading-relaxed">
                Thank you for applying to Casaio. Our vendor curation committee is reviewing your atelier catalog details. Standard approval turnaround is 24 to 48 business hours.
              </p>
            </div>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/">
                <Button variant="outline" size="sm">
                  Return to Storefront
                </Button>
              </Link>
              <Link href="/account/profile">
                <Button variant="secondary" size="sm">
                  Customer Account
                </Button>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // No application submitted yet
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-zinc-200 p-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
            <Store className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-zinc-950">Partner with Casaio</h2>
          <p className="text-xs text-zinc-500 leading-relaxed">
            You do not currently have a registered seller store. Apply today to showcase your artisanal furnishings and modern dropship pieces to design aficionados nationwide.
          </p>
          <div className="pt-2 flex flex-col gap-2.5">
            <Link href="/seller/register">
              <Button variant="primary" size="md" className="w-full">
                Apply for Seller Store
              </Button>
            </Link>
            <Link href="/">
              <Button variant="ghost" size="sm" className="w-full text-zinc-500">
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const navLinks = [
    { label: 'Overview', href: '/seller/dashboard', icon: LayoutDashboard },
    { label: 'Catalog & Products', href: '/seller/products', icon: Package },
    { label: 'Dropship Orders', href: '/seller/orders', icon: ShoppingBag },
    { label: 'Store Profile', href: '/seller/profile', icon: Store },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      {/* Top Banner / Navigation */}
      <header className="bg-white border-b border-zinc-200/80 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-serif text-xl font-bold tracking-tight text-zinc-950 flex items-center gap-2"
            >
              <span>Casaio</span>
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-900 text-amber-400">
                Atelier
              </span>
            </Link>

            <span className="text-zinc-300 hidden sm:inline">|</span>

            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-800">
                {sellerProfile?.storeName || user.displayName || 'Vendor Portal'}
              </span>
              <Badge variant="accent" size="sm">
                Verified Dropshipper
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/seller/products/new">
              <Button
                variant="primary"
                size="sm"
                className="text-xs"
                leftIcon={<PlusCircle className="w-3.5 h-3.5" />}
              >
                Add Product
              </Button>
            </Link>

            <Link
              href="/products"
              target="_blank"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-950 px-3 py-1.5 rounded-md hover:bg-zinc-100 transition-colors"
            >
              <span>View Storefront</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Sub-header Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto border-t border-zinc-100 py-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/seller/dashboard' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors',
                  isActive
                    ? 'text-zinc-950 bg-zinc-100 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-amber-600' : 'text-zinc-400')} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-8">
        <Container>{children}</Container>
      </main>
    </div>
  );
}
