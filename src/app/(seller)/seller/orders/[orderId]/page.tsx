'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Truck,
  MapPin,
  ShoppingBag,
  Check,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Order, FulfillmentStatus } from '@/types';
import { getOrderById } from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function SellerOrderDetailPage() {
  const params = useParams();
  const orderId = params?.orderId as string;
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dispatch form state
  const [fulfillmentStatus, setFulfillmentStatus] = useState<FulfillmentStatus>('processing');
  const [carrier, setCarrier] = useState('Delhivery Express');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');

  useEffect(() => {
    let isMounted = true;
    if (!orderId) return;

    getOrderById(orderId)
      .then((data) => {
        if (isMounted) {
          setOrder(data);
          // Pre-populate if seller has already set tracking on items
          const sellerItem = data?.items.find((i) => i.sellerId === user?.uid);
          if (sellerItem) {
            setFulfillmentStatus(sellerItem.fulfillmentStatus || 'processing');
            if (sellerItem.trackingDetails?.carrier) {
              setCarrier(sellerItem.trackingDetails.carrier);
            }
            if (sellerItem.trackingDetails?.trackingNumber) {
              setTrackingNumber(sellerItem.trackingDetails.trackingNumber);
            }
            if (sellerItem.trackingDetails?.trackingUrl) {
              setTrackingUrl(sellerItem.trackingDetails.trackingUrl);
            }
            if (sellerItem.trackingDetails?.estimatedDelivery) {
              setEstimatedDelivery(sellerItem.trackingDetails.estimatedDelivery);
            }
          }
        }
      })
      .catch(() => {
        if (isMounted) setErrorMessage('Unable to load order details.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [orderId, user]);

  const handleUpdateFulfillment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !orderId) return;

    setIsUpdating(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/seller/orders/${orderId}/fulfillment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: user.uid,
          fulfillmentStatus,
          carrier,
          trackingNumber,
          trackingUrl,
          estimatedDelivery,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update order fulfillment');
      }

      setSuccessMessage('Fulfillment status and courier milestone updated successfully!');

      // Refresh order view
      const refreshed = await getOrderById(orderId);
      setOrder(refreshed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred';
      setErrorMessage(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-amber-600" />
        <p className="text-xs">Loading order and shipment manifest...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-xs text-zinc-500">Order not found.</p>
        <Link href="/seller/orders" className="text-xs underline font-medium">
          Back to Orders
        </Link>
      </div>
    );
  }

  const sellerItems = order.items.filter((i) => i.sellerId === user?.uid);
  const sellerSubtotal = sellerItems.reduce((sum, i) => sum + i.totalPrice, 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4">
        <div className="flex items-center gap-3">
          <Link href="/seller/orders">
            <button className="w-8 h-8 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-950 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-2xl font-bold text-zinc-950">
                Order {order.orderNumber}
              </h1>
              <Badge variant="accent" size="sm" className="capitalize">
                {order.orderStatus.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Placed on {formatDate(order.createdAt)} • Client: {order.customerDetails.name}
            </p>
          </div>
        </div>

        <div className="text-right self-start sm:self-auto">
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
            Your Atelier Payout
          </span>
          <span className="font-mono font-bold text-xl text-zinc-950">
            {formatCurrency(sellerSubtotal)}
          </span>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid: Left Items & Shipping Manifest (7 cols), Right Fulfillment Updater (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column */}
        <div className="lg:col-span-7 space-y-6">
          {/* Items in this Order */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 shadow-xs space-y-4">
            <h3 className="font-serif font-bold text-base text-zinc-950 pb-3 border-b border-zinc-100 flex items-center justify-between">
              <span>Your Dropship Items ({sellerItems.length})</span>
              <span className="text-xs font-mono text-zinc-400">Atelier Stock</span>
            </h3>

            <div className="divide-y divide-zinc-100">
              {sellerItems.map((item, idx) => (
                <div key={idx} className="py-4 first:pt-0 last:pb-0 flex items-center gap-4">
                  <div className="relative w-14 h-14 rounded-lg bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.title}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-300">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-zinc-900 truncate">{item.title}</p>
                    <p className="font-mono text-[11px] text-zinc-400">
                      SKU: {item.variantSku || 'Standard'}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Qty: {item.quantity} × {formatCurrency(item.unitPrice)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono text-xs font-bold text-zinc-950 block">
                      {formatCurrency(item.totalPrice)}
                    </span>
                    <Badge variant="secondary" size="sm" className="capitalize text-[10px] mt-1">
                      {item.fulfillmentStatus}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping Manifest & Delivery Address */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
              <MapPin className="w-4 h-4 text-zinc-700" />
              <h3 className="font-serif font-bold text-sm text-zinc-950">
                Customer Delivery Address (Shipping Label)
              </h3>
            </div>

            <div className="text-xs text-zinc-700 space-y-1">
              <p className="font-bold text-zinc-900 text-sm">{order.shippingAddress.fullName}</p>
              <p className="text-zinc-500 font-mono">
                Phone: +91 {order.shippingAddress.phoneNumber}
                {order.shippingAddress.alternatePhone && ` • Alt: +91 ${order.shippingAddress.alternatePhone}`}
              </p>
              <p className="pt-2 text-zinc-800 leading-relaxed font-medium">
                {order.shippingAddress.addressLine1}
                {order.shippingAddress.addressLine2 && `, ${order.shippingAddress.addressLine2}`}
              </p>
              {order.shippingAddress.landmark && (
                <p className="text-zinc-500 italic">Landmark: {order.shippingAddress.landmark}</p>
              )}
              <p className="font-bold text-zinc-950">
                {order.shippingAddress.city}, {order.shippingAddress.state} — {order.shippingAddress.postalCode}
              </p>
              <p className="text-zinc-500">{order.shippingAddress.country}</p>
            </div>
          </div>

          {/* Timeline Audit History */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 shadow-xs space-y-3">
            <h3 className="font-serif font-bold text-sm text-zinc-950 pb-2 border-b border-zinc-100">
              Status Timeline Log
            </h3>

            <div className="space-y-3 pt-1">
              {order.statusTimeline?.map((t, i) => (
                <div key={i} className="text-xs border-l-2 border-zinc-950 pl-3 py-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-zinc-900 capitalize">
                      {t.status.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-400">
                      {formatDate(t.timestamp)}
                    </span>
                  </div>
                  <p className="text-zinc-600 text-[11px] mt-0.5">{t.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Dispatch Action Card */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
          <form
            onSubmit={handleUpdateFulfillment}
            className="bg-white rounded-2xl border border-zinc-200/80 p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
              <Truck className="w-4 h-4 text-zinc-700" />
              <h3 className="font-serif font-bold text-base text-zinc-950">
                Update Fulfillment & Dispatch
              </h3>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                Milestone Status *
              </label>
              <select
                value={fulfillmentStatus}
                onChange={(e) => setFulfillmentStatus(e.target.value as FulfillmentStatus)}
                className="w-full h-10 px-3 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900"
              >
                <option value="processing">Processing & Atelier Packaging</option>
                <option value="shipped">Shipped (Dispatched to Courier)</option>
                <option value="out_for_delivery">Out for Delivery</option>
                <option value="delivered">Delivered to Client</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <Input
              label="Logistics Carrier *"
              placeholder="e.g. Delhivery, BlueDart, DTDC, FedEx"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              required
            />

            <Input
              label="Courier Airway Bill (AWB) / Tracking #"
              placeholder="e.g. DEL-1092837465"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />

            <Input
              label="Public Tracking URL (Optional)"
              placeholder="https://delhivery.com/track/package/..."
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
            />

            <Input
              label="Estimated Doorstep Delivery (Optional)"
              placeholder="e.g. 5 Oct 2026"
              value={estimatedDelivery}
              onChange={(e) => setEstimatedDelivery(e.target.value)}
            />

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full text-xs"
                isLoading={isUpdating}
                disabled={isUpdating}
                rightIcon={!isUpdating ? <Check className="w-4 h-4" /> : undefined}
              >
                Save Milestone Update
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
