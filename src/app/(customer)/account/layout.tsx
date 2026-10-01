'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Container } from '@/components/ui/Container';
import { Badge } from '@/components/ui/Badge';
import {
  User,
  ShoppingBag,
  MapPin,
  Heart,
  Bell,
  Store,
  Shield,
  LogOut,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, isLoading, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    );
  }

  const navItems = [
    { label: 'My Profile', href: '/account/profile', icon: User },
    { label: 'Order History', href: '/account/orders', icon: ShoppingBag },
    { label: 'Saved Addresses', href: '/account/addresses', icon: MapPin },
    { label: 'Wishlist', href: '/account/wishlist', icon: Heart },
    { label: 'Notifications', href: '/account/notifications', icon: Bell },
  ];

  return (
    <div className="py-10 bg-[#FAFAF8] min-h-[80vh]">
      <Container>
        {/* Header summary banner */}
        <div className="bg-white rounded-2xl p-6 mb-8 border border-zinc-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-zinc-900 text-amber-500 font-serif font-bold text-xl flex items-center justify-center border border-zinc-800 shrink-0">
              {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-xl sm:text-2xl font-bold text-zinc-950">
                  {user?.displayName || 'Customer'}
                </h1>
                <Badge
                  variant={
                    role === 'admin'
                      ? 'secondary'
                      : role === 'seller'
                      ? 'accent'
                      : 'default'
                  }
                  size="sm"
                >
                  {role}
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{user?.email}</p>
            </div>
          </div>

          {/* Quick elevated portal links if seller or admin */}
          <div className="flex flex-wrap items-center gap-2">
            {(role === 'seller' || role === 'admin') && (
              <Link
                href="/seller/dashboard"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold hover:bg-amber-100 transition-colors"
              >
                <Store className="w-3.5 h-3.5 text-amber-700" />
                <span>Seller Portal</span>
              </Link>
            )}

            {role === 'admin' && (
              <Link
                href="/admin/dashboard"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs font-semibold hover:bg-zinc-800 transition-colors"
              >
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>Admin Operations</span>
              </Link>
            )}
          </div>
        </div>

        {/* Main Account Grid: Sidebar + View Surface */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Navigation Sidebar */}
          <aside className="lg:col-span-3 bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
            <nav className="p-2 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-zinc-900 text-white shadow-2xs'
                        : 'text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={cn('w-4 h-4', isActive ? 'text-amber-400' : 'text-zinc-400')} />
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight className={cn('w-3.5 h-3.5', isActive ? 'text-zinc-400' : 'text-zinc-300')} />
                  </Link>
                );
              })}

              <div className="pt-2 border-t border-zinc-100 mt-2">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </nav>
          </aside>

          {/* Account Subview Body */}
          <main className="lg:col-span-9 bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-6 sm:p-8">
            {children}
          </main>
        </div>
      </Container>
    </div>
  );
}
