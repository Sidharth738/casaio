'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  MessageSquare,
  Mail,
  LogOut,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/common/Logo';

export default function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, isLoading, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadReviews, setUnreadReviews] = useState(0);

  useEffect(() => {
    if (!user || role !== 'admin') return;

    let active = true;
    const loadUnreadNotifications = async () => {
      try {
        const [messagesResponse, reviewsResponse] = await Promise.all([
          fetch('/api/admin/contact-messages?summary=true', { cache: 'no-store' }),
          fetch('/api/admin/reviews/notifications', { cache: 'no-store' }),
        ]);
        if (messagesResponse.ok) {
          const data = await messagesResponse.json() as { unreadCount?: number };
          if (active) setUnreadMessages(data.unreadCount || 0);
        }
        if (reviewsResponse.ok) {
          const data = await reviewsResponse.json() as { unreadCount?: number };
          if (active) setUnreadReviews(data.unreadCount || 0);
        }
      } catch {
        // The navigation remains usable if the count request temporarily fails.
      }
    };

    void loadUnreadNotifications();
    const interval = window.setInterval(loadUnreadNotifications, 30000);
    const onMessagesUpdated = () => { void loadUnreadNotifications(); };
    const onReviewsUpdated = () => { void loadUnreadNotifications(); };
    window.addEventListener('casaio:messages-updated', onMessagesUpdated);
    window.addEventListener('casaio:reviews-updated', onReviewsUpdated);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('casaio:messages-updated', onMessagesUpdated);
      window.removeEventListener('casaio:reviews-updated', onReviewsUpdated);
    };
  }, [role, user]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      router.replace('/login');
    } catch {
      alert('Could not log out. Please try again.');
      setIsLoggingOut(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600 mb-3" />
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
              This command interface requires active platform administrator credentials. Signed in as{' '}
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
    { label: 'Refunds', href: '/admin/refunds', icon: RotateCcw },
    { label: 'Coupons', href: '/admin/coupons', icon: Tag },
    { label: 'Reviews', href: '/admin/reviews', icon: MessageSquare },
    { label: 'Messages', href: '/admin/messages', icon: Mail },
    { label: 'Users', href: '/admin/users', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      {/* Top Banner Navigation */}
      <header className="bg-zinc-950 text-white border-b border-zinc-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Logo size="sm" className="rounded bg-white px-1" />
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-600 text-white">
                Admin
              </span>
            </div>

            <span className="text-zinc-700 hidden sm:inline">|</span>

            <div className="hidden sm:flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-xs text-zinc-300 font-mono">
                {user.email}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-zinc-900 transition-colors disabled:opacity-60"
            >
              {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              <span>{isLoggingOut ? 'Signing out…' : 'Log out'}</span>
            </button>
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
                <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-orange-400' : 'text-zinc-500')} />
                <span>{item.label}</span>
                {item.href === '/admin/messages' && unreadMessages > 0 && (
                  <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {unreadMessages > 99 ? '99+' : unreadMessages}
                  </span>
                )}
                {item.href === '/admin/reviews' && unreadReviews > 0 && (
                  <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {unreadReviews > 99 ? '99+' : unreadReviews}
                  </span>
                )}
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
