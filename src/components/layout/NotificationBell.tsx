'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Package,
  Store,
  AlertTriangle,
  Info,
  CheckCheck,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { AppNotification } from '@/types';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/lib/firebase/firestore';
import { formatDate } from '@/lib/utils';

export function NotificationBell() {
  const router = useRouter();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isFetched, setIsFetched] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const userId = user?.uid;

  useEffect(() => {
    let isMounted = true;
    if (!userId) return;

    getUserNotifications(userId)
      .then((data) => {
        if (isMounted) setNotifications(data);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsFetched(true);
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!user) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
      markNotificationAsRead(notif.id).catch(() => {});
    }

    setIsOpen(false);
    if (notif.link) {
      router.push(notif.link);
    }
  };

  const handleMarkAllRead = async () => {
    if (!userId || unreadCount === 0) return;
    try {
      setIsMarkingAll(true);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      await markAllNotificationsAsRead(userId);
    } catch {
      // Revert if needed
    } finally {
      setIsMarkingAll(false);
    }
  };

  const getTypeIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'order':
        return <Package className="w-3.5 h-3.5 text-orange-600" />;
      case 'seller_application':
        return <Store className="w-3.5 h-3.5 text-blue-600" />;
      case 'stock_alert':
        return <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />;
      default:
        return <Info className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="View notifications"
        className="relative p-2 rounded-full text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white shadow-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-xl border border-zinc-200/90 z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50/70">
            <div className="flex items-center gap-2">
              <h3 className="font-serif font-bold text-sm text-zinc-950">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-800">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isMarkingAll}
                className="text-[11px] font-medium text-orange-700 hover:text-orange-900 flex items-center gap-1 disabled:opacity-50"
              >
                {isMarkingAll ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCheck className="w-3 h-3" />
                )}
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-zinc-100">
            {!isFetched ? (
              <div className="p-8 text-center text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-orange-600 mb-2" />
                <p className="text-xs">Loading alerts...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-zinc-400">
                <Bell className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                <p className="font-serif text-sm font-semibold text-zinc-900">
                  All caught up!
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  You have no notifications at this time.
                </p>
              </div>
            ) : (
              notifications.slice(0, 15).map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-colors ${
                    !notif.read ? 'bg-orange-50/40 hover:bg-orange-50/70' : 'hover:bg-zinc-50'
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-white border border-zinc-200 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    {getTypeIcon(notif.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p
                        className={`text-xs truncate ${
                          !notif.read ? 'font-bold text-zinc-950' : 'font-medium text-zinc-800'
                        }`}
                      >
                        {notif.title}
                      </p>
                      {!notif.read && (
                        <span className="w-2 h-2 rounded-full bg-orange-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-2">
                      {notif.message}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-1 font-mono">
                      {formatDate(notif.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-zinc-50 border-t border-zinc-100 text-center">
            <Link
              href="/account/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-zinc-700 hover:text-orange-800 flex items-center justify-center gap-1"
            >
              <span>View Full Notification Center</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
