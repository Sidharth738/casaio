'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ShoppingBag,
  ArrowRight,
  CreditCard,
  Banknote,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Order } from '@/types';
import { getUserOrders } from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function CustomerOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      if (!user) return;
      try {
        setLoading(true);
        const data = await getUserOrders(user.uid);
        setOrders(data);
      } catch {
        // Fallback
      } finally {
        setLoading(false);
      }
    }

    fetchOrders();
  }, [user]);

  const getStatusBadge = (status: Order['orderStatus']) => {
    switch (status) {
      case 'delivered':
        return <Badge variant="secondary" size="sm">Delivered</Badge>;
      case 'shipped':
      case 'out_for_delivery':
        return <Badge variant="accent" size="sm">In Transit</Badge>;
      case 'confirmed':
      case 'processing':
        return <Badge variant="default" size="sm">Confirmed</Badge>;
      case 'cancelled':
        return <Badge variant="danger" size="sm">Cancelled</Badge>;
      case 'pending':
      default:
        return <Badge variant="secondary" size="sm">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-100 gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-zinc-950">Order History</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Review previous orders, track live milestone shipments, and view receipts.
          </p>
        </div>

        {orders.length > 0 && (
          <div className="text-xs text-zinc-400 font-mono">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'} placed
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin mb-2 text-amber-600" />
          <p className="text-xs">Loading order history...</p>
        </div>
      ) : orders.length === 0 ? (
        /* Empty State */
        <div className="py-16 text-center border-2 border-dashed border-zinc-200 rounded-xl p-8 space-y-4">
          <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-zinc-900">No Orders Placed Yet</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              When you purchase handcrafted furnishings or home decor from Casaio, your orders and tracking details will appear here.
            </p>
          </div>
          <Link href="/products" className="inline-block pt-2">
            <Button variant="primary" size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
              Explore Products
            </Button>
          </Link>
        </div>
      ) : (
        /* Orders List */
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs hover:border-zinc-300 transition-all flex flex-col"
            >
              {/* Order Header */}
              <div className="p-4 sm:p-5 bg-zinc-50/70 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase tracking-wider">
                      Order Reference
                    </span>
                    <span className="font-mono font-bold text-zinc-900">
                      {order.orderNumber}
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase tracking-wider">
                      Date Placed
                    </span>
                    <span className="font-medium text-zinc-700">
                      {formatDate(order.createdAt)}
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase tracking-wider">
                      Total
                    </span>
                    <span className="font-mono font-bold text-zinc-950">
                      {formatCurrency(order.pricing.totalAmount)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getStatusBadge(order.orderStatus)}
                  <Link href={`/account/orders/${order.id}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7.5 px-2.5"
                      rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                    >
                      Details
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Items Preview */}
              <div className="p-4 sm:p-5 divide-y divide-zinc-100">
                {order.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="relative w-12 h-12 rounded-lg bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.title}
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-300">
                            <ShoppingBag className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <Link href={`/products/${item.slug}`}>
                          <h4 className="font-medium text-xs text-zinc-900 truncate hover:text-amber-700 transition-colors">
                            {item.title}
                          </h4>
                        </Link>
                        <p className="text-[11px] text-zinc-400">
                          Qty: {item.quantity} • Sold by: {item.sellerStoreName}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono text-xs font-bold text-zinc-900">
                        {formatCurrency(item.totalPrice)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order Footer */}
              <div className="px-5 py-3 bg-zinc-50/40 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500">
                <div className="flex items-center gap-2">
                  {order.payment.method === 'razorpay' ? (
                    <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                  ) : (
                    <Banknote className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  <span className="capitalize">
                    {order.payment.method === 'razorpay' ? 'Online Payment' : 'Cash on Delivery'}
                  </span>
                </div>

                <Link
                  href={`/account/orders/${order.id}`}
                  className="font-medium text-zinc-700 hover:text-zinc-950 underline underline-offset-2"
                >
                  Track Package & Timeline →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
