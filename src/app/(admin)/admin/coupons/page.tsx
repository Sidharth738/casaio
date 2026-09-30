'use client';

import React, { useEffect, useState } from 'react';
import {
  Tag,
  Plus,
  Trash2,
  Check,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Coupon, DiscountType } from '@/types';
import { getAllCoupons, saveCoupon, deleteCoupon } from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';

export default function AdminCouponsPage() {
  const { user } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Form Fields
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [minOrderValue, setMinOrderValue] = useState('0');
  const [maxDiscountAmount, setMaxDiscountAmount] = useState('');
  const [validUntil, setValidUntil] = useState('2026-12-31');
  const [usageLimit, setUsageLimit] = useState('1000');
  const [isActive, setIsActive] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = !isFetched && Boolean(user);

  const fetchCoupons = () => {
    getAllCoupons()
      .then((data) => setCoupons(data))
      .catch(() => {})
      .finally(() => setIsFetched(true));
  };

  useEffect(() => {
    if (!user) return;
    fetchCoupons();
  }, [user]);

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !discountValue) {
      setError('Coupon code and discount value are required.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await saveCoupon({
        code: code.trim().toUpperCase(),
        description: description.trim(),
        discountType,
        discountValue: Number(discountValue),
        minOrderValue: Number(minOrderValue) || 0,
        maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : undefined,
        validFrom: new Date().toISOString(),
        validUntil: new Date(validUntil).toISOString(),
        usageLimit: Number(usageLimit) || 1000,
        perUserLimit: 1,
        isActive,
      });

      setIsAdding(false);
      setCode('');
      setDescription('');
      setDiscountValue('');
      fetchCoupons();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save coupon';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this coupon?')) return;
    try {
      await deleteCoupon(id);
      setCoupons((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert('Failed to delete coupon.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
            Promotion & Coupon Engine
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Create promotional incentives, discount codes, and order threshold incentives.
          </p>
        </div>

        {!isAdding && (
          <Button
            variant="primary"
            size="md"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsAdding(true)}
          >
            Create New Coupon
          </Button>
        )}
      </div>

      {/* Add Coupon Inline Form */}
      {isAdding && (
        <form
          onSubmit={handleCreateCoupon}
          className="bg-white rounded-2xl border border-zinc-900/10 p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <h3 className="font-serif font-bold text-base text-zinc-950">
              New Promotional Campaign Coupon
            </h3>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-xs text-zinc-400 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Coupon Code *"
              placeholder="e.g. CASAIO15"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                Discount Type *
              </label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                className="w-full h-10 px-3.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900"
              >
                <option value="percentage">Percentage Off (%)</option>
                <option value="flat">Flat Amount Off (₹)</option>
              </select>
            </div>

            <Input
              label={discountType === 'percentage' ? 'Percentage Off (%) *' : 'Flat Discount (₹) *'}
              type="number"
              placeholder={discountType === 'percentage' ? '15' : '500'}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Minimum Order Value (₹)"
              type="number"
              placeholder="2999"
              value={minOrderValue}
              onChange={(e) => setMinOrderValue(e.target.value)}
            />

            <Input
              label="Max Discount Cap (₹) (Optional)"
              type="number"
              placeholder="1500"
              value={maxDiscountAmount}
              onChange={(e) => setMaxDiscountAmount(e.target.value)}
            />

            <Input
              label="Expiration Date"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />

            <Input
              label="Total Usage Limit"
              type="number"
              placeholder="1000"
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Public Description
            </label>
            <input
              type="text"
              placeholder="e.g. 15% off artisanal woodwork orders above ₹2,999"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-10 px-3.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded text-zinc-950"
              />
              <span className="text-xs font-medium text-zinc-800">
                Active and redeemable at checkout
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAdding(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSaving}
              rightIcon={<Check className="w-3.5 h-3.5" />}
            >
              Publish Coupon
            </Button>
          </div>
        </form>
      )}

      {/* Coupons Table */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-amber-600" />
          <p className="text-xs">Loading coupons...</p>
        </div>
      ) : coupons.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-12 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
            <Tag className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-zinc-900">No Coupons Created</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              Configure your first coupon code to run merchandising campaigns.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsAdding(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Coupon
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50/70 border-b border-zinc-100 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:px-6">Coupon Code</th>
                  <th className="py-3.5 px-4">Discount</th>
                  <th className="py-3.5 px-4">Min Order</th>
                  <th className="py-3.5 px-4">Max Cap</th>
                  <th className="py-3.5 px-4">Usage</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right sm:pr-6">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-zinc-50/50 transition-colors">
                    {/* Code */}
                    <td className="py-4 px-4 sm:px-6">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="font-mono font-bold text-zinc-950 text-xs">
                          {coupon.code}
                        </span>
                      </div>
                      {coupon.description && (
                        <p className="text-[11px] text-zinc-400 mt-0.5 max-w-xs truncate">
                          {coupon.description}
                        </p>
                      )}
                    </td>

                    {/* Discount */}
                    <td className="py-4 px-4 font-bold text-emerald-700">
                      {coupon.discountType === 'percentage'
                        ? `${coupon.discountValue}% OFF`
                        : formatCurrency(coupon.discountValue) + ' OFF'}
                    </td>

                    {/* Min Order */}
                    <td className="py-4 px-4 font-mono">
                      {coupon.minOrderValue ? formatCurrency(coupon.minOrderValue) : '₹0'}
                    </td>

                    {/* Max Cap */}
                    <td className="py-4 px-4 font-mono text-zinc-500">
                      {coupon.maxDiscountAmount ? formatCurrency(coupon.maxDiscountAmount) : 'No Cap'}
                    </td>

                    {/* Usage */}
                    <td className="py-4 px-4 font-mono">
                      {coupon.usageCount || 0} / {coupon.usageLimit || '∞'}
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4">
                      <Badge variant={coupon.isActive ? 'accent' : 'secondary'} size="sm">
                        {coupon.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>

                    {/* Action */}
                    <td className="py-4 px-4 sm:pr-6 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2.5 text-rose-600 hover:bg-rose-50"
                        onClick={() => handleDelete(coupon.id)}
                        leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                      >
                        Delete
                      </Button>
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
