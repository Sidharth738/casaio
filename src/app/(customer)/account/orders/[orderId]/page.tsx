'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  MapPin,
  CreditCard,
  Banknote,
  ShoppingBag,
  Truck,
  Loader2,
  XCircle,
} from 'lucide-react';
import type { Order } from '@/types';
import { getOrderById } from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params?.orderId as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancellationMessage, setCancellationMessage] = useState<string | null>(null);
  const [cancellationError, setCancellationError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrder() {
      if (!orderId) return;
      try {
        setLoading(true);
        const data = await getOrderById(orderId);
        setOrder(data);
      } catch {
        // Fallback
      } finally {
        setLoading(false);
      }
    }

    fetchOrder();
  }, [orderId]);

  const canCancel = Boolean(
    order &&
    ['pending', 'confirmed', 'processing'].includes(order.orderStatus) &&
    order.items.length > 0 &&
    order.items.every((item) => item.fulfillmentStatus === 'pending') &&
    ((order.payment.method === 'cod' && order.payment.status === 'pending') ||
      (order.payment.method === 'razorpay' && order.payment.status === 'captured' && order.payment.razorpayPaymentId))
  );

  const handleCancelOrder = async () => {
    if (!order || !canCancel) return;
    const confirmed = window.confirm(
      order.payment.method === 'razorpay'
        ? 'Cancel this order? A refund will be sent to your original payment method.'
        : 'Cancel this order?'
    );
    if (!confirmed) return;

    setCancelling(true);
    setCancellationError(null);
    setCancellationMessage(null);
    try {
      const response = await fetch(`/api/orders/${order.id}/cancel`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not cancel this order.');

      setCancellationMessage(data.message || 'Order cancelled successfully.');
      const updatedOrder = await getOrderById(order.id);
      setOrder(updatedOrder);
    } catch (error) {
      setCancellationError(error instanceof Error ? error.message : 'Could not cancel this order.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-orange-600" />
        <p className="text-xs">Loading order details...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="py-16 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mx-auto">
          <ShoppingBag className="w-6 h-6" />
        </div>
        <h3 className="font-serif text-lg font-bold text-zinc-900">Order Not Found</h3>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto">
          We could not find the specified order or you may not have permission to view it.
        </p>
        <Link href="/account/orders">
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
            Back to Orders
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-100 gap-4">
        <div className="flex items-center gap-3">
          <Link href="/account/orders">
            <button className="w-8 h-8 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-950 hover:border-zinc-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-serif text-xl sm:text-2xl font-bold text-zinc-950">
                Order {order.orderNumber}
              </h2>
              <Badge variant="accent" size="sm" className="capitalize">
                {order.orderStatus.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Placed on {formatDate(order.createdAt)}
            </p>
          </div>
        </div>

        <div className="text-right self-start sm:self-auto">
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
            Order Total
          </span>
          <span className="font-mono font-bold text-lg text-zinc-950">
            {formatCurrency(order.pricing.totalAmount)}
          </span>
        </div>
      </div>

      {cancellationError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {cancellationError}
        </div>
      )}
      {cancellationMessage && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {cancellationMessage}
        </div>
      )}
      {canCancel && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cancelling}
            isLoading={cancelling}
            leftIcon={!cancelling ? <XCircle className="w-4 h-4" /> : undefined}
            onClick={handleCancelOrder}
          >
            Cancel Order
          </Button>
        </div>
      )}

      {/* Shipment & Timeline Section */}
      <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-6 space-y-4">
        <h3 className="font-serif font-bold text-sm text-zinc-900 flex items-center gap-2">
          <Truck className="w-4 h-4 text-zinc-700" />
          <span>Fulfillment & Milestone Timeline</span>
        </h3>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200">
          {order.statusTimeline && order.statusTimeline.length > 0 ? (
            order.statusTimeline.map((event, idx) => (
              <div key={idx} className="relative">
                <div className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-zinc-950 ring-4 ring-white" />
                <p className="text-xs font-bold text-zinc-900 capitalize">
                  {event.status.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">{event.note}</p>
                <p className="text-[10px] text-zinc-400 font-mono mt-1">
                  {formatDate(event.timestamp)}
                </p>
              </div>
            ))
          ) : (
            <div className="relative">
              <div className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-zinc-950 ring-4 ring-white" />
              <p className="text-xs font-bold text-zinc-900">Order Confirmed</p>
              <p className="text-xs text-zinc-600 mt-0.5">
                Order has been received and is being prepared for shipment.
              </p>
              <p className="text-[10px] text-zinc-400 font-mono mt-1">
                {formatDate(order.createdAt)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Ordered Items Grid */}
      <div className="rounded-xl border border-zinc-200/80 bg-white p-6 space-y-4">
        <h3 className="font-serif font-bold text-base text-zinc-950 pb-3 border-b border-zinc-100">
          Items in this Shipment ({order.items.length})
        </h3>

        <div className="divide-y divide-zinc-100">
          {order.items.map((item, idx) => (
            <div key={idx} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative w-16 h-16 rounded-lg bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200">
                  {typeof item.imageUrl === 'string' && item.imageUrl.trim() ? (
                    <Image
                      src={item.imageUrl.trim()}
                      alt={item.title}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-300">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <Link href={`/products/${item.slug}`}>
                    <h4 className="font-bold text-xs text-zinc-900 truncate hover:text-orange-700 transition-colors">
                      {item.title}
                    </h4>
                  </Link>
                  <p className="text-[11px] text-zinc-400">Sold by: {item.sellerStoreName}</p>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Qty: {item.quantity} × {formatCurrency(item.unitPrice)}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="font-mono text-xs font-bold text-zinc-950">
                  {formatCurrency(item.totalPrice)}
                </span>
                <span className="block text-[10px] text-zinc-400 uppercase mt-0.5">
                  {item.fulfillmentStatus}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2-Column: Delivery Address & Pricing Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Shipping & Payment Card */}
        <div className="rounded-xl border border-zinc-200/80 bg-white p-6 space-y-4">
          <div>
            <h4 className="font-serif font-bold text-sm text-zinc-950 flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-zinc-700" />
              <span>Delivery Address</span>
            </h4>
            <div className="text-xs text-zinc-700 space-y-0.5">
              <p className="font-bold text-zinc-900">{order.shippingAddress.fullName}</p>
              <p className="text-zinc-500 font-mono">+91 {order.shippingAddress.phoneNumber}</p>
              <p className="pt-1">{order.shippingAddress.addressLine1}</p>
              {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
              <p>
                {order.shippingAddress.city}, {order.shippingAddress.state} —{' '}
                {order.shippingAddress.postalCode}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100">
            <h4 className="font-serif font-bold text-sm text-zinc-950 flex items-center gap-2 mb-2">
              {order.payment.method === 'razorpay' ? (
                <CreditCard className="w-4 h-4 text-zinc-700" />
              ) : (
                <Banknote className="w-4 h-4 text-zinc-700" />
              )}
              <span>Payment Details</span>
            </h4>
            <div className="text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-zinc-500">Method</span>
                <span className="font-medium text-zinc-900 uppercase">
                  {order.payment.method === 'razorpay' ? 'Online Payment' : 'Cash on Delivery'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Status</span>
                <span className="capitalize font-medium text-emerald-700">
                  {order.payment.status === 'refund_pending'
                    ? 'Refund processing'
                    : order.payment.status === 'refund_failed'
                      ? 'Refund failed — contact support'
                      : order.payment.status}
                </span>
              </div>
              {order.payment.razorpayPaymentId && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Transaction ID</span>
                  <span className="font-mono text-zinc-700 text-[11px]">
                    {order.payment.razorpayPaymentId}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pricing Summary Card */}
        <div className="rounded-xl border border-zinc-200/80 bg-white p-6 space-y-3">
          <h4 className="font-serif font-bold text-sm text-zinc-950 pb-2 border-b border-zinc-100">
            Payment Summary
          </h4>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-zinc-600">
              <span>Items Subtotal</span>
              <span className="font-mono font-medium text-zinc-900">
                {formatCurrency(order.pricing.subtotal)}
              </span>
            </div>

            {order.pricing.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Discount ({order.couponApplied?.code})</span>
                <span className="font-mono">-{formatCurrency(order.pricing.discountAmount)}</span>
              </div>
            )}

            <div className="flex justify-between text-zinc-600">
              <span>Insured Courier Shipping</span>
              <span className="text-emerald-700 font-bold uppercase text-[11px]">
                Complimentary
              </span>
            </div>

            <div className="flex justify-between text-zinc-400 text-[11px]">
              <span>Estimated GST (18% inclusive)</span>
              <span className="font-mono">
                {formatCurrency(order.pricing.taxAmount)}
              </span>
            </div>

            <div className="pt-3 border-t border-zinc-200 flex justify-between items-baseline font-bold text-zinc-950">
              <span className="font-serif text-base">Grand Total</span>
              <span className="font-serif text-xl font-mono">
                {formatCurrency(order.pricing.totalAmount)}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100">
            <Link href="/products" className="block w-full">
              <Button variant="outline" size="sm" className="w-full text-xs">
                Continue Shopping
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
