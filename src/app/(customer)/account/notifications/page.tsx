'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Package,
  Store,
  AlertTriangle,
  Info,
  CheckCheck,
  Trash2,
  Loader2,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { AppNotification, NotificationType } from '@/types';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';

export default function AccountNotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | NotificationType>('all');
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const userId = user?.uid;
  const loading = !isFetched && Boolean(userId);

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

  const handleMarkAsRead = async (id: string) => {
    try {
      setActionId(id);
      await markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch {
      // Ignore
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setActionId(id);
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {
      // Ignore
    } finally {
      setActionId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (!userId) return;
    try {
      setIsMarkingAll(true);
      await markAllNotificationsAsRead(userId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Ignore
    } finally {
      setIsMarkingAll(false);
    }
  };

  const filtered = notifications.filter((n) => {
    if (typeFilter !== 'all' && n.type !== typeFilter) return false;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getTypeIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'order':
        return <Package className="w-4 h-4 text-orange-600" />;
      case 'seller_application':
        return <Store className="w-4 h-4 text-blue-600" />;
      case 'stock_alert':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      default:
        return <Info className="w-4 h-4 text-zinc-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Title + Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-zinc-950">
            Notification Center
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Real-time updates regarding your orders, fulfillment milestones, and account activity.
          </p>
        </div>

        {unreadCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleMarkAllRead}
            isLoading={isMarkingAll}
            leftIcon={<CheckCheck className="w-3.5 h-3.5" />}
          >
            Mark all as read
          </Button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="flex items-center gap-1 text-zinc-400 font-medium mr-1">
          <Filter className="w-3.5 h-3.5" />
          Filter:
        </span>
        {(['all', 'order', 'seller_application', 'system'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-full capitalize font-medium transition-colors ${
              typeFilter === t
                ? 'bg-zinc-950 text-white shadow-2xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {t.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs divide-y divide-zinc-100 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-zinc-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-600 mb-2" />
            <p className="text-xs">Loading your notifications...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Bell className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
            <p className="font-serif text-base font-bold text-zinc-900">
              No notifications
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              You are all caught up on all platform alerts and updates.
            </p>
          </div>
        ) : (
          filtered.map((notif) => {
            const isBusy = actionId === notif.id;

            return (
              <div
                key={notif.id}
                className={`p-4 sm:p-5 flex items-start gap-4 transition-colors ${
                  !notif.read ? 'bg-orange-50/30' : 'hover:bg-zinc-50/50'
                }`}
              >
                {/* Type Icon */}
                <div className="w-9 h-9 rounded-xl bg-zinc-100 border border-zinc-200/60 flex items-center justify-center shrink-0 mt-0.5">
                  {getTypeIcon(notif.type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3
                      className={`text-sm ${
                        !notif.read ? 'font-bold text-zinc-950' : 'font-medium text-zinc-800'
                      }`}
                    >
                      {notif.title}
                    </h3>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-orange-600 shrink-0" />
                    )}
                  </div>

                  <p className="text-xs text-zinc-600 leading-relaxed max-w-2xl">
                    {notif.message}
                  </p>

                  <div className="flex items-center gap-4 mt-2.5">
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {formatDate(notif.createdAt)}
                    </span>

                    {notif.link && (
                      <Link
                        href={notif.link}
                        className="text-xs font-semibold text-orange-700 hover:text-orange-900 flex items-center gap-1"
                      >
                        <span>View Details</span>
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 self-center">
                  {!notif.read && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleMarkAsRead(notif.id)}
                      title="Mark as read"
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
                    >
                      <CheckCheck className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDelete(notif.id)}
                    title="Delete notification"
                    className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
