'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  CheckCircle,
  AlertCircle,
  MapPin,
  ArrowRight,
  ShoppingBag,
  CreditCard,
  Banknote,
  Package,
  Loader2,
} from 'lucide-react';
import type { Order } from '@/types';
import { getOrderById } from '@/lib/firebase/firestore';
import { getPaymentConfirmationState } from '@/lib/payment/confirmation-state';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { SafeProductImage } from '@/components/product/SafeProductImage';

export default function OrderConfirmationPage() {
  const params = useParams();
  const orderId = params?.orderId as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="py-24 bg-[#FAFAF8] min-h-[75vh] flex flex-col items-center justify-center text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-orange-600" />
        <p className="text-xs">Retrieving your order confirmation...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="py-24 bg-[#FAFAF8] min-h-[75vh] flex flex-col items-center justify-center text-center px-4">
        <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-4">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-zinc-950 mb-2">Order Not Found</h2>
        <p className="text-xs text-zinc-500 max-w-sm mb-6">
          We could not locate this order. It may still be syncing or the reference ID is invalid.
        </p>
        <Link href="/products">
          <Button variant="primary" size="md">
            Return to Store
          </Button>
        </Link>
      </div>
    );
  }

  const confirmationState = getPaymentConfirmationState(order);
  const isConfirmed = confirmationState === 'confirmed';

  return (
    <div className="py-12 bg-[#FAFAF8] min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Persisted order state */}
        <div className="text-center mb-10 space-y-3">
          <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center shadow-xs ${isConfirmed ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-700'}`}>
            {isConfirmed
              ? <CheckCircle className="w-8 h-8 stroke-[2.2]" />
              : confirmationState === 'pending'
                ? <Loader2 className="w-8 h-8 animate-spin" />
                : <AlertCircle className="w-8 h-8" />}
          </div>
          <Badge variant={isConfirmed ? 'accent' : 'secondary'} size="sm" className="uppercase tracking-widest font-mono text-[10px]">
            {confirmationState === 'confirmed' ? 'Order Confirmed' : confirmationState === 'reconciliation_required' ? 'Payment Review Required' : confirmationState === 'failed' ? 'Payment Failed' : confirmationState === 'cancelled' ? 'Order Cancelled' : 'Payment Pending'}
          </Badge>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-zinc-950">
            {isConfirmed ? 'Thank you for your order!' : confirmationState === 'reconciliation_required' ? 'Your payment needs review' : confirmationState === 'failed' ? 'Payment was not confirmed' : confirmationState === 'cancelled' ? 'This order was cancelled' : 'We are confirming your payment'}
          </h1>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Order <span className="font-mono font-bold text-zinc-900">{order.orderNumber}</span>{' '}
            {isConfirmed
              ? <>is confirmed. A confirmation receipt has been sent to <span className="font-medium text-zinc-900">{order.customerDetails.email}</span>.</>
              : confirmationState === 'reconciliation_required'
                ? order.payment.status === 'captured'
                  ? 'has a captured payment that requires review before fulfillment confirmation. Please do not pay again.'
                  : 'requires a payment review before fulfillment confirmation. Please do not pay again.'
                : confirmationState === 'failed'
                  ? 'has no confirmed payment. You can contact support if you believe your bank completed the payment.'
                  : confirmationState === 'cancelled'
                    ? 'is cancelled. Contact support if you need help with a payment.'
                    : 'is saved, but payment is still pending. Please do not pay again while the status is checked.'}
          </p>
        </div>

        {/* Status Tracker Box */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-zinc-700" />
              <div>
                <p className="text-xs font-semibold text-zinc-900">Current Status</p>
                  <p className="text-[11px] text-zinc-500">
                  {isConfirmed ? 'Direct dispatch being prepared by artisan ateliers' : 'Order fulfillment will proceed after payment confirmation'}
                </p>
              </div>
            </div>
            <Badge variant="secondary" size="md" className="capitalize self-start sm:self-auto font-mono">
              {order.orderStatus.replace(/_/g, ' ')}
            </Badge>
          </div>

          {/* Timeline steps */}
          <div className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className={`space-y-1.5 ${isConfirmed ? '' : 'opacity-50'}`}>
              <div className={`w-7 h-7 rounded-full ${isConfirmed ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-600'} flex items-center justify-center mx-auto text-xs font-bold`}>
                ✓
              </div>
              <p className="text-xs font-bold text-zinc-900">{isConfirmed ? 'Confirmed' : 'Payment'}</p>
              <p className="text-[10px] text-zinc-400">{isConfirmed ? 'Order received' : confirmationState.replace(/_/g, ' ')}</p>
            </div>

            <div className="space-y-1.5">
              <div className="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center mx-auto text-xs font-bold">
                2
              </div>
              <p className="text-xs font-bold text-zinc-900">Processing</p>
              <p className="text-[10px] text-zinc-400">Atelier packing</p>
            </div>

            <div className="space-y-1.5 opacity-40">
              <div className="w-7 h-7 rounded-full bg-zinc-200 text-zinc-600 flex items-center justify-center mx-auto text-xs font-bold">
                3
              </div>
              <p className="text-xs font-bold text-zinc-900">Shipped</p>
              <p className="text-[10px] text-zinc-400">In transit</p>
            </div>

            <div className="space-y-1.5 opacity-40">
              <div className="w-7 h-7 rounded-full bg-zinc-200 text-zinc-600 flex items-center justify-center mx-auto text-xs font-bold">
                4
              </div>
              <p className="text-xs font-bold text-zinc-900">Delivered</p>
              <p className="text-[10px] text-zinc-400">Doorstep delivery</p>
            </div>
          </div>
        </div>

        {/* Order Details Grid: Items + Delivery Address */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Items Summary (7 cols) */}
          <div className="md:col-span-7 bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-6 space-y-4">
            <h3 className="font-serif font-bold text-base text-zinc-950 pb-3 border-b border-zinc-100 flex items-center justify-between">
              <span>Ordered Items ({order.items.length})</span>
              <span className="font-mono text-xs text-zinc-400">{order.orderNumber}</span>
            </h3>

            <div className="divide-y divide-zinc-100">
              {order.items.map((item, idx) => (
                <div key={idx} className="py-3.5 first:pt-0 last:pb-0 flex items-center gap-3.5">
                  <div className="relative w-14 h-14 rounded-lg bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200">
                    <SafeProductImage src={item.imageUrl} alt={item.title} sizes="56px" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-zinc-900 truncate">{item.title}</p>
                    <p className="text-[11px] text-zinc-400">Sold by: {item.sellerStoreName}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Qty: {item.quantity} × {formatCurrency(item.unitPrice)}
                    </p>
                  </div>

                  <span className="font-mono text-xs font-bold text-zinc-900 shrink-0">
                    {formatCurrency(item.totalPrice)}
                  </span>
                </div>
              ))}
            </div>

            {/* Price breakdown */}
            <div className="pt-4 border-t border-zinc-100 space-y-2 text-xs">
              <div className="flex justify-between text-zinc-600">
                <span>Items Subtotal (GST-inclusive)</span>
                <span className="font-mono">{formatCurrency(order.pricing.subtotal)}</span>
              </div>
              {order.pricing.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Coupon Discount ({order.couponApplied?.code})</span>
                  <span className="font-mono">-{formatCurrency(order.pricing.discountAmount)}</span>
                </div>
              )}
              {typeof order.pricing.taxRate === 'number' && typeof order.pricing.taxAmount === 'number' && (
                <div className="flex justify-between text-zinc-600">
                  <span>Includes GST ({Math.round(order.pricing.taxRate * 100)}%)</span>
                  <span className="font-mono">{formatCurrency(order.pricing.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-600">
                <span>Insured Courier Delivery</span>
                <span className="text-emerald-700 font-bold uppercase text-[11px]">Free</span>
              </div>
              <div className="pt-3 border-t border-zinc-200 flex justify-between items-baseline font-bold text-zinc-950">
                <span className="font-serif text-base">{order.payment.status === 'captured' ? 'Total Amount Paid' : 'Order Total'}</span>
                <span className="font-serif text-xl font-mono">
                  {formatCurrency(order.pricing.totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Delivery & Payment Info (5 cols) */}
          <div className="md:col-span-5 space-y-6">
            {/* Delivery Card */}
            <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-6 space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
                <MapPin className="w-4 h-4 text-zinc-700" />
                <h4 className="font-serif font-bold text-sm text-zinc-950">Shipping Destination</h4>
              </div>

              <div>
                <p className="text-xs font-bold text-zinc-900">{order.shippingAddress.fullName}</p>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">
                  +91 {order.shippingAddress.phoneNumber}
                </p>
                <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                  {order.shippingAddress.addressLine1}
                  {order.shippingAddress.addressLine2 && `, ${order.shippingAddress.addressLine2}`}
                </p>
                <p className="text-xs font-medium text-zinc-800 mt-1">
                  {order.shippingAddress.city}, {order.shippingAddress.state} —{' '}
                  {order.shippingAddress.postalCode}
                </p>
              </div>
            </div>

            {/* Payment Method Card */}
            <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-6 space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
                {order.payment.method === 'razorpay' ? (
                  <CreditCard className="w-4 h-4 text-zinc-700" />
                ) : (
                  <Banknote className="w-4 h-4 text-zinc-700" />
                )}
                <h4 className="font-serif font-bold text-sm text-zinc-950">Payment Information</h4>
              </div>

              <div className="text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Method</span>
                  <span className="font-medium text-zinc-900 uppercase">
                    {order.payment.method === 'razorpay' ? 'Online Payment (Razorpay)' : 'Cash on Delivery'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Status</span>
                  <Badge
                    variant={order.payment.status === 'captured' ? 'accent' : 'secondary'}
                    size="sm"
                    className="capitalize"
                  >
                    {order.payment.method === 'cod' && order.payment.status === 'pending' ? 'Due on delivery' : order.payment.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Link href="/account/orders" className="block w-full">
                <Button variant="primary" size="md" className="w-full text-xs" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                  View All Orders in Account
                </Button>
              </Link>
              <Link href="/products" className="block w-full">
                <Button variant="outline" size="md" className="w-full text-xs">
                  Continue Shopping
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
