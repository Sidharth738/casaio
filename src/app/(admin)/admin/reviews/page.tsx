'use client';

import React, { useEffect, useState } from 'react';
import {
  Star,
  Search,
  Eye,
  EyeOff,
  Trash2,
  ShieldCheck,
  MessageSquare,
  Loader2,
  Filter,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Review } from '@/types';
import { getAllReviewsAdmin } from '@/lib/firebase/firestore';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';

type StatusFilter = 'all' | 'published' | 'hidden' | 'pending';

export default function AdminReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loading = !isFetched && Boolean(user);

  useEffect(() => {
    let mounted = true;
    if (!user) return;

    getAllReviewsAdmin()
      .then((data) => { if (mounted) setReviews(data); })
      .catch(() => {})
      .finally(() => { if (mounted) setIsFetched(true); });

    return () => { mounted = false; };
  }, [user]);

  const handleUpdateStatus = async (
    reviewId: string,
    status: 'published' | 'hidden' | 'pending'
  ) => {
    try {
      setActionLoading(reviewId);
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        setReviews((prev) =>
          prev.map((r) => (r.id === reviewId ? { ...r, status } : r))
        );
      } else {
        alert('Failed to update review status.');
      }
    } catch {
      alert('Network error updating review.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!confirm('Permanently delete this review? This cannot be undone.')) return;

    try {
      setActionLoading(reviewId);
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setReviews((prev) => prev.filter((r) => r.id !== reviewId));
      } else {
        alert('Failed to delete review.');
      }
    } catch {
      alert('Network error deleting review.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredReviews = reviews.filter((r) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (r.title || '').toLowerCase().includes(term) ||
      (r.comment || '').toLowerCase().includes(term) ||
      (r.userName || '').toLowerCase().includes(term) ||
      (r.productId || '').toLowerCase().includes(term);

    if (!matchesSearch) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  const getStatusBadge = (status: Review['status']) => {
    switch (status) {
      case 'published':
        return <Badge variant="secondary" size="sm">Published</Badge>;
      case 'hidden':
        return <Badge variant="danger" size="sm">Hidden</Badge>;
      case 'pending':
        return <Badge variant="accent" size="sm">Pending</Badge>;
      default:
        return <Badge size="sm">{status}</Badge>;
    }
  };

  const publishedCount = reviews.filter((r) => r.status === 'published').length;
  const pendingCount = reviews.filter((r) => r.status === 'pending').length;
  const hiddenCount = reviews.filter((r) => r.status === 'hidden').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
          Review Moderation
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          Moderate customer reviews across all products. Publish, hide, or remove reviews as needed.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Reviews</span>
            <MessageSquare className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-950 mt-2">{reviews.length}</div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Published</span>
            <Eye className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-serif text-emerald-700 mt-2">{publishedCount}</div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Pending</span>
            <Star className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-serif text-amber-700 mt-2">{pendingCount}</div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Hidden</span>
            <EyeOff className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold font-serif text-rose-700 mt-2">{hiddenCount}</div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by reviewer name, headline, comment, or product ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="text-xs px-3 py-2 rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="pending">Pending</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>
      </div>

      {/* Reviews Table */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-600 mb-2" />
            <p className="text-xs">Loading review registry...</p>
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
            <p className="font-serif text-base font-bold text-zinc-900">No reviews found</p>
            <p className="text-xs text-zinc-400 mt-1">Adjust search keywords or status filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Review</th>
                  <th className="py-3 px-4">Rating</th>
                  <th className="py-3 px-4">Reviewer</th>
                  <th className="py-3 px-4">Product ID</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredReviews.map((review) => {
                  const isBusy = actionLoading === review.id;

                  return (
                    <tr key={review.id} className="hover:bg-zinc-50/60 transition-colors align-top">
                      {/* Review content */}
                      <td className="py-4 px-4 max-w-xs">
                        <p className="font-semibold text-zinc-900 truncate">{review.title}</p>
                        <p className="text-zinc-500 text-[11px] mt-0.5 line-clamp-2 leading-relaxed">
                          {review.comment}
                        </p>
                        {review.isVerifiedPurchase && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 mt-1">
                            <ShieldCheck className="w-2.5 h-2.5" /> Verified Purchase
                          </span>
                        )}
                      </td>

                      {/* Stars */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${i < review.rating ? 'fill-amber-500 text-amber-500' : 'fill-zinc-200 text-zinc-200'}`}
                            />
                          ))}
                        </div>
                        <span className="text-[11px] text-zinc-500 mt-0.5">{review.rating}/5</span>
                      </td>

                      {/* Reviewer */}
                      <td className="py-4 px-4">
                        <div className="font-semibold text-zinc-900">{review.userName}</div>
                        <div className="text-[11px] text-zinc-400 font-mono truncate max-w-[100px]">
                          {review.userId}
                        </div>
                      </td>

                      {/* Product */}
                      <td className="py-4 px-4 font-mono text-[11px] text-zinc-500 truncate max-w-[100px]">
                        {review.productId}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">{getStatusBadge(review.status)}</td>

                      {/* Date */}
                      <td className="py-4 px-4 text-zinc-500 whitespace-nowrap">
                        {formatDate(review.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {review.status !== 'published' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleUpdateStatus(review.id, 'published')}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
                            >
                              {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                              Publish
                            </button>
                          )}

                          {review.status !== 'hidden' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleUpdateStatus(review.id, 'hidden')}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 hover:text-amber-800 disabled:opacity-50"
                            >
                              {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <EyeOff className="w-3 h-3" />}
                              Hide
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDelete(review.id)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Delete
                          </button>
                        </div>
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
