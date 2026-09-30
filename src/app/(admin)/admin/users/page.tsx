'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  Shield,
  Store,
  UserCheck,
  UserX,
  Loader2,
  Calendar,
  Mail,
  Phone,
  Filter,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { UserProfile, UserRole, UserStatus } from '@/types';
import { getAllUsersAdmin } from '@/lib/firebase/firestore';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loading = !isFetched && Boolean(user);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;

    getAllUsersAdmin()
      .then((data) => {
        if (isMounted) setUsersList(data);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsFetched(true);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleUpdateUser = async (
    targetUserId: string,
    updates: { role?: UserRole; status?: UserStatus }
  ) => {
    try {
      setActionLoading(targetUserId);
      const res = await fetch(`/api/admin/users/${targetUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        setUsersList((prev) =>
          prev.map((u) => {
            const uId = u.uid || u.id;
            if (uId === targetUserId) {
              return {
                ...u,
                ...updates,
                updatedAt: new Date().toISOString(),
              };
            }
            return u;
          })
        );
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || 'Failed to update user profile.');
      }
    } catch {
      alert('Network error updating user profile.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = usersList.filter((u) => {
    const matchesSearch =
      (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.phoneNumber || '').includes(searchTerm);

    if (!matchesSearch) return false;
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;

    return true;
  });

  const totalUsers = usersList.length;
  const customerCount = usersList.filter((u) => u.role === 'customer').length;
  const sellerCount = usersList.filter((u) => u.role === 'seller').length;
  const adminCount = usersList.filter((u) => u.role === 'admin').length;

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Shield className="w-3 h-3" />
            Admin
          </span>
        );
      case 'seller':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Store className="w-3 h-3" />
            Seller
          </span>
        );
      case 'customer':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
            Customer
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
            User Governance
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Manage user accounts, administrative privileges, and platform access control.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Total Accounts
            </span>
            <Users className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-950 mt-2">
            {totalUsers}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Customers
            </span>
            <span className="w-2 h-2 rounded-full bg-blue-500" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-950 mt-2">
            {customerCount}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Sellers
            </span>
            <Store className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-950 mt-2">
            {sellerCount}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Administrators
            </span>
            <Shield className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-950 mt-2">
            {adminCount}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, or phone number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400 shrink-0" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
            className="text-xs px-3 py-2 rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="all">All Roles</option>
            <option value="customer">Customers</option>
            <option value="seller">Sellers</option>
            <option value="admin">Admins</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | UserStatus)}
            className="text-xs px-3 py-2 rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-600 mb-2" />
            <p className="text-xs">Loading user registry...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            <Users className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
            <p className="font-serif text-base font-bold text-zinc-900">
              No matching accounts found
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Adjust search keywords or role filters to view accounts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredUsers.map((u) => {
                  const targetId = u.uid || u.id || '';
                  const isCurrentAdmin = targetId === user?.uid;
                  const isActionBusy = actionLoading === targetId;

                  return (
                    <tr key={targetId} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-200 text-zinc-700 flex items-center justify-center font-bold text-xs uppercase shrink-0 overflow-hidden">
                            {u.photoURL ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={u.photoURL}
                                alt={u.displayName || 'Avatar'}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              (u.displayName?.[0] || u.email?.[0] || 'U').toUpperCase()
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-zinc-900 flex items-center gap-1.5">
                              <span>{u.displayName || 'Anonymous User'}</span>
                              {isCurrentAdmin && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-normal">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400 font-mono">
                              UID: {targetId.slice(0, 10)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-zinc-700">
                            <Mail className="w-3 h-3 text-zinc-400 shrink-0" />
                            <span>{u.email}</span>
                          </div>
                          {u.phoneNumber && (
                            <div className="flex items-center gap-1.5 text-zinc-500">
                              <Phone className="w-3 h-3 text-zinc-400 shrink-0" />
                              <span>{u.phoneNumber}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {getRoleBadge(u.role)}
                          {!isCurrentAdmin && (
                            <select
                              value={u.role}
                              disabled={isActionBusy}
                              onChange={(e) =>
                                handleUpdateUser(targetId, {
                                  role: e.target.value as UserRole,
                                })
                              }
                              className="text-[10px] py-0.5 px-1.5 rounded border border-zinc-200 bg-white text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              <option value="customer">Set Customer</option>
                              <option value="seller">Set Seller</option>
                              <option value="admin">Set Admin</option>
                            </select>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {u.status === 'active' ? (
                          <Badge variant="secondary" size="sm">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="danger" size="sm">
                            Suspended
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4 text-zinc-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-zinc-400" />
                          <span>{u.createdAt ? formatDate(u.createdAt) : 'N/A'}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        {isCurrentAdmin ? (
                          <span className="text-[11px] text-zinc-400 italic">
                            Current session
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {u.status === 'active' ? (
                              <button
                                type="button"
                                disabled={isActionBusy}
                                onClick={() =>
                                  handleUpdateUser(targetId, { status: 'suspended' })
                                }
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
                              >
                                {isActionBusy ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <UserX className="w-3 h-3" />
                                )}
                                Suspend
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isActionBusy}
                                onClick={() =>
                                  handleUpdateUser(targetId, { status: 'active' })
                                }
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
                              >
                                {isActionBusy ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <UserCheck className="w-3 h-3" />
                                )}
                                Reactivate
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
