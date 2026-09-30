'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Container } from '@/components/ui/Container';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  LayoutDashboard,
  Store,
  Package,
  Layers,
  ShoppingBag,
  Tag,
  Users,
  Shield,
  ExternalLink,
  Loader2,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600 mb-3" />
        <p className="text-xs">Authenticating administrative credentials...</p>
      </div>
    );
  }

  // Not signed in or not an admin
  if (!user || role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-zinc-200 p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <Badge variant="danger" size="sm" className="mb-2">
              Access Restricted
            </Badge>
            <h2 className="font-serif text-2xl font-bold text-zinc-950">
              Admin Privilege Required
            </h2>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
              This command interface requires verified platform administrator credentials. Signed in as{' '}
              <strong className="text-zinc-900">{user?.email || 'Guest'}</strong> (Role: {role}).
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2.5">
            <Link href="/login?redirect=/admin/dashboard">
              <Button variant="primary" size="md" className="w-full">
                Sign In with Admin Account
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" size="sm" className="w-full">
                Return to Storefront
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const navLinks = [
    { label: 'Overview', href: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Sellers', href: '/admin/sellers', icon: Store },
    { label: 'Products', href: '/admin/products', icon: Package },
    { label: 'Categories', href: '/admin/categories', icon: Layers },
    { label: 'Orders', href: '/admin/orders', icon: ShoppingBag },
    { label: 'Coupons', href: '/admin/coupons', icon: Tag },
    { label: 'Users', href: '/admin/users', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      {/* Top Banner Navigation */}
      <header className="bg-zinc-950 text-white border-b border-zinc-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-serif text-xl font-bold tracking-tight text-white flex items-center gap-2"
            >
              <span>Casaio</span>
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-600 text-white">
                Admin
              </span>
            </Link>

            <span className="text-zinc-700 hidden sm:inline">|</span>

            <div className="hidden sm:flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-zinc-300 font-mono">
                {user.email}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/products"
              target="_blank"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-zinc-900 transition-colors"
            >
              <span>Storefront</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Sub-header Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto border-t border-zinc-900 py-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/admin/dashboard' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors',
                  isActive
                    ? 'text-white bg-zinc-800 font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-amber-400' : 'text-zinc-500')} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main Administrative Surface */}
      <main className="flex-1 py-8">
        <Container>{children}</Container>
      </main>
    </div>
  );
}
