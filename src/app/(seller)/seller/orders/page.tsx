'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  Search,
  ChevronRight,
  Loader2,
  MapPin,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Order } from '@/types';
import { getSellerOrders } from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function SellerOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'shipped' | 'delivered'>('all');

  const loading = !isFetched && Boolean(user);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;

    getSellerOrders(user.uid)
      .then((data) => {
        if (isMounted) setOrders(data);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsFetched(true);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerDetails.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.shippingAddress.city.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'pending') {
      return o.orderStatus === 'pending' || o.orderStatus === 'confirmed' || o.orderStatus === 'processing';
    }
    if (statusFilter === 'shipped') {
      return o.orderStatus === 'shipped' || o.orderStatus === 'out_for_delivery';
    }
    if (statusFilter === 'delivered') {
      return o.orderStatus === 'delivered';
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
            Dropship Orders & Dispatches
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Monitor client orders for your pieces, generate packing slips, and update courier milestones.
          </p>
        </div>

        {orders.length > 0 && (
          <span className="text-xs font-mono text-zinc-400">
            {orders.length} total client orders
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-zinc-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by order number, client, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {(['all', 'pending', 'shipped', 'delivered'] as const).map((filter) => (
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

      {/* Orders List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-orange-600" />
          <p className="text-xs">Loading orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-12 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-zinc-900">No Orders Found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              {searchTerm || statusFilter !== 'all'
                ? 'No client orders match the current filter criteria.'
                : 'Customer orders containing your listed products will appear here for packing and dispatch.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50/70 border-b border-zinc-100 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:px-6">Order Reference</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Customer & Destination</th>
                  <th className="py-3.5 px-4">Your Items</th>
                  <th className="py-3.5 px-4">Atelier Payout</th>
                  <th className="py-3.5 px-4">Fulfillment Status</th>
                  <th className="py-3.5 px-4 text-right sm:pr-6">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {filteredOrders.map((o) => {
                  // Items belonging to this seller
                  const sellerItems = o.items.filter((i) => i.sellerId === user?.uid);
                  const sellerSubtotal = sellerItems.reduce(
                    (sum, i) => sum + i.totalPrice,
                    0
                  );

                  return (
                    <tr key={o.id} className="hover:bg-zinc-50/50 transition-colors">
                      {/* Order Number */}
                      <td className="py-4 px-4 sm:px-6">
                        <Link
                          href={`/seller/orders/${o.id}`}
                          className="font-mono font-bold text-zinc-900 hover:text-orange-700 transition-colors"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>

                      {/* Date */}
                      <td className="py-4 px-4 text-zinc-500 font-medium">
                        {formatDate(o.createdAt)}
                      </td>

                      {/* Customer */}
                      <td className="py-4 px-4">
                        <span className="font-semibold text-zinc-900 block">
                          {o.customerDetails.name}
                        </span>
                        <span className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-zinc-400" />
                          {o.shippingAddress.city}, {o.shippingAddress.state}
                        </span>
                      </td>

                      {/* Items */}
                      <td className="py-4 px-4">
                        <span className="font-medium text-zinc-900">
                          {sellerItems.length} {sellerItems.length === 1 ? 'item' : 'items'}
                        </span>
                        <p className="text-[11px] text-zinc-400 truncate max-w-xs mt-0.5">
                          {sellerItems.map((i) => i.title).join(', ')}
                        </p>
                      </td>

                      {/* Atelier Payout */}
                      <td className="py-4 px-4 font-mono font-bold text-zinc-950">
                        {formatCurrency(sellerSubtotal)}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <Badge
                          variant={
                            o.orderStatus === 'delivered'
                              ? 'secondary'
                              : o.orderStatus === 'shipped' || o.orderStatus === 'out_for_delivery'
                              ? 'accent'
                              : 'default'
                          }
                          size="sm"
                          className="capitalize"
                        >
                          {o.orderStatus.replace(/_/g, ' ')}
                        </Badge>
                      </td>

                      {/* Action */}
                      <td className="py-4 px-4 sm:pr-6 text-right">
                        <Link href={`/seller/orders/${o.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                          >
                            Dispatch Details
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
