'use client';

import React, { useEffect, useState } from 'react';
import {
  Store,
  Search,
  CheckCircle2,
  XCircle,
  MapPin,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { SellerProfile, SellerStatus } from '@/types';
import { getAllSellers } from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function AdminSellersPage() {
  const { user } = useAuth();
  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'suspended' | 'rejected'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loading = !isFetched && Boolean(user);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;

    getAllSellers()
      .then((data) => {
        if (isMounted) setSellers(data);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsFetched(true);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleUpdateStatus = async (sellerId: string, status: SellerStatus) => {
    try {
      setActionLoading(sellerId);
      const res = await fetch(`/api/admin/sellers/${sellerId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        setSellers((prev) =>
          prev.map((s) => (s.id === sellerId ? { ...s, status } : s))
        );
      } else {
        alert('Failed to update seller status.');
      }
    } catch {
      alert('Error updating seller status.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredSellers = sellers.filter((s) => {
    const matchesSearch =
      s.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.storeEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.businessAddress?.city || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;

    return true;
  });

  const getStatusBadge = (status: SellerStatus) => {
    switch (status) {
      case 'approved':
        return <Badge variant="secondary" size="sm">Approved</Badge>;
      case 'pending':
        return <Badge variant="accent" size="sm">Pending Review</Badge>;
      case 'suspended':
        return <Badge variant="danger" size="sm">Suspended</Badge>;
      case 'rejected':
        return <Badge variant="secondary" size="sm">Rejected</Badge>;
      default:
        return <Badge size="sm">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
            Artisan Seller Network
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Review merchant applications, approve partner dropshippers, and regulate platform commissions.
          </p>
        </div>

        <div className="text-xs font-mono text-zinc-400">
          {sellers.length} registered vendors
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-zinc-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by store name, email, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {(['all', 'pending', 'approved', 'suspended', 'rejected'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg font-medium capitalize whitespace-nowrap transition-colors ${
                statusFilter === filter
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Sellers Table */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-orange-600" />
          <p className="text-xs">Loading seller registry...</p>
        </div>
      ) : filteredSellers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-12 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
            <Store className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-zinc-900">No Sellers Found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              No merchant applications match the selected filters.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50/70 border-b border-zinc-100 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:px-6">Store & Atelier</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4">Commission</th>
                  <th className="py-3.5 px-4">Sales Volume</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right sm:pr-6">Governance Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {filteredSellers.map((seller) => (
                  <tr key={seller.id} className="hover:bg-zinc-50/50 transition-colors">
                    {/* Store details */}
                    <td className="py-4 px-4 sm:px-6">
                      <h4 className="font-bold text-zinc-900 block text-xs">
                        {seller.storeName}
                      </h4>
                      {seller.description && (
                        <p className="text-[11px] text-zinc-400 truncate max-w-xs mt-0.5">
                          {seller.description}
                        </p>
                      )}
                      <span className="text-[10px] text-zinc-400 font-mono">
                        Applied {formatDate(seller.createdAt)}
                      </span>
                    </td>

                    {/* Contact */}
                    <td className="py-4 px-4">
                      <span className="font-medium text-zinc-900 block">
                        {seller.storeEmail}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-mono">
                        {seller.storePhone}
                      </span>
                    </td>

                    {/* Location */}
                    <td className="py-4 px-4">
                      <span className="flex items-center gap-1 text-zinc-600">
                        <MapPin className="w-3 h-3 text-zinc-400" />
                        {seller.businessAddress?.city || 'India'}, {seller.businessAddress?.state || ''}
                      </span>
                    </td>

                    {/* Commission */}
                    <td className="py-4 px-4 font-mono font-medium text-zinc-900">
                      {seller.commissionRatePercent || 10}%
                    </td>

                    {/* Sales Volume */}
                    <td className="py-4 px-4 font-mono font-bold text-zinc-950">
                      {formatCurrency(seller.metrics?.totalSalesAmount || 0)}
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4">
                      {getStatusBadge(seller.status)}
                    </td>

                    {/* Governance Actions */}
                    <td className="py-4 px-4 sm:pr-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {seller.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="primary"
                              className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 border-emerald-700"
                              onClick={() => handleUpdateStatus(seller.id, 'approved')}
                              disabled={actionLoading === seller.id}
                              leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                              onClick={() => handleUpdateStatus(seller.id, 'rejected')}
                              disabled={actionLoading === seller.id}
                              leftIcon={<XCircle className="w-3.5 h-3.5" />}
                            >
                              Reject
                            </Button>
                          </>
                        )}

                        {seller.status === 'approved' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                            onClick={() => handleUpdateStatus(seller.id, 'suspended')}
                            disabled={actionLoading === seller.id}
                          >
                            Suspend
                          </Button>
                        )}

                        {(seller.status === 'suspended' || seller.status === 'rejected') && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs"
                            onClick={() => handleUpdateStatus(seller.id, 'approved')}
                            disabled={actionLoading === seller.id}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
