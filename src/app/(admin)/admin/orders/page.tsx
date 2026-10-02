'use client';

import React, { useEffect, useState } from 'react';
import {
  ShoppingBag,
  Search,
  MapPin,
  CreditCard,
  Banknote,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Order, OrderStatus } from '@/types';
import { getAllOrdersAdmin } from '@/lib/firebase/firestore';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function AdminOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loading = !isFetched && Boolean(user);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;

    getAllOrdersAdmin()
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

  const handleStatusOverride = async (orderId: string, newStatus: OrderStatus) => {
    try {
      setActionLoading(orderId);
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderStatus: newStatus,
          note: `Admin override: Status changed to ${newStatus}`,
        }),
      });

      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, orderStatus: newStatus } : o))
        );
      } else {
        alert('Failed to override order status.');
      }
    } catch {
      alert('Error updating order status.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerDetails.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerDetails.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.shippingAddress.city.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== 'all' && o.orderStatus !== statusFilter) return false;

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
            Platform Orders & Fulfillment
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Global monitoring of dropshipping orders, payments verification, and administrative status overrides.
          </p>
        </div>

        <div className="text-xs font-mono text-zinc-400">
          {orders.length} total orders logged
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-zinc-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by order number, client name, email, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {(['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const).map(
            (filter) => (
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
            )
          )}
        </div>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-orange-600" />
          <p className="text-xs">Loading platform orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-12 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-zinc-900">No Orders Found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              No orders matched your current search and filter settings.
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
                  <th className="py-3.5 px-4">Customer Details</th>
                  <th className="py-3.5 px-4">Destination</th>
                  <th className="py-3.5 px-4">Grand Total</th>
                  <th className="py-3.5 px-4">Payment</th>
                  <th className="py-3.5 px-4">Administrative Status Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {filteredOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-zinc-50/50 transition-colors">
                    {/* Order Reference */}
                    <td className="py-4 px-4 sm:px-6">
                      <span className="font-mono font-bold text-zinc-900 block">
                        {o.orderNumber}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        {o.items.length} {o.items.length === 1 ? 'item' : 'items'}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="py-4 px-4 text-zinc-500 font-medium">
                      {formatDate(o.createdAt)}
                    </td>

                    {/* Customer */}
                    <td className="py-4 px-4">
                      <span className="font-bold text-zinc-900 block">
                        {o.customerDetails.name}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-mono">
                        {o.customerDetails.email}
                      </span>
                    </td>

                    {/* Destination */}
                    <td className="py-4 px-4">
                      <span className="flex items-center gap-1 text-zinc-800 font-medium">
                        <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                        {o.shippingAddress.city}, {o.shippingAddress.state}
                      </span>
                      <span className="text-[10px] text-zinc-400 block font-mono">
                        PIN: {o.shippingAddress.postalCode}
                      </span>
                    </td>

                    {/* Grand Total */}
                    <td className="py-4 px-4">
                      <span className="font-mono font-bold text-zinc-950 block">
                        {formatCurrency(o.pricing.totalAmount)}
                      </span>
                      {o.couponApplied && (
                        <span className="text-[10px] text-emerald-700 font-mono">
                          Coupon: {o.couponApplied.code}
                        </span>
                      )}
                    </td>

                    {/* Payment */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1.5">
                        {o.payment.method === 'razorpay' ? (
                          <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                        ) : (
                          <Banknote className="w-3.5 h-3.5 text-zinc-500" />
                        )}
                        <span className="capitalize font-medium text-zinc-800">
                          {o.payment.method}
                        </span>
                      </div>
                      <Badge
                        variant={o.payment.status === 'captured' ? 'accent' : 'secondary'}
                        size="sm"
                        className="capitalize text-[10px] mt-1"
                      >
                        {o.payment.status}
                      </Badge>
                    </td>

                    {/* Status Override */}
                    <td className="py-4 px-4">
                      <select
                        value={o.orderStatus}
                        onChange={(e) =>
                          handleStatusOverride(o.id, e.target.value as OrderStatus)
                        }
                        disabled={actionLoading === o.id}
                        className="h-8 px-2.5 text-xs border border-zinc-200 rounded-lg font-medium focus:outline-none focus:border-zinc-900 bg-white"
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="processing">Processing</option>
                        <option value="shipped">Shipped</option>
                        <option value="out_for_delivery">Out for Delivery</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
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
