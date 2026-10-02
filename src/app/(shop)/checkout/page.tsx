'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import {
  ShieldCheck,
  Truck,
  RotateCcw,
  CreditCard,
  Banknote,
  Plus,
  ArrowRight,
  CheckCircle2,
  Tag,
  AlertCircle,
  ShoppingBag,
  Loader2,
} from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import type { UserAddress, CouponValidationResult } from '@/types';
import {
  getUserAddresses,
  saveUserAddress,
  validateCouponCode,
} from '@/lib/firebase/firestore';
import { AddressCard } from '@/components/address/AddressCard';
import { AddressForm } from '@/components/address/AddressForm';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';

interface RazorpayInstance {
  open: () => void;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export default function CheckoutPage() {
  const checkoutRequest = useRef({ fingerprint: '', id: '' });
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { items, itemCount, subtotal, clearCart } = useCart();

  // Address state
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<UserAddress | null>(null);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [addressLoading, setAddressLoading] = useState(true);

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('razorpay');

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [couponResult, setCouponResult] = useState<CouponValidationResult | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  // Submission state
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Load user addresses
  useEffect(() => {
    async function loadAddresses() {
      if (!user) {
        setAddressLoading(false);
        return;
      }
      try {
        setAddressLoading(true);
        const list = await getUserAddresses(user.uid);
        setAddresses(list);
        const defaultAddr = list.find((a) => a.isDefault) || list[0] || null;
        setSelectedAddress(defaultAddr);
        if (list.length === 0) {
          setIsAddingAddress(true);
        }
      } catch {
        // Fallback
      } finally {
        setAddressLoading(false);
      }
    }

    if (!authLoading) {
      loadAddresses();
    }
  }, [user, authLoading]);

  // Calculations
  const discountAmount = couponResult?.isValid ? couponResult.discountAmount : 0;
  const shippingFee = 0;
  const grandTotal = Math.max(0, subtotal - discountAmount + shippingFee);

  // Coupon handling
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    setCheckoutError(null);
    try {
      const res = await validateCouponCode(couponCode, subtotal);
      setCouponResult(res);
      if (!res.isValid && res.message) {
        setCheckoutError(res.message);
      }
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setCouponResult(null);
  };

  // Address creation from checkout
  const handleSaveNewAddress = async (
    data: Omit<UserAddress, 'id' | 'userId' | 'createdAt'>
  ) => {
    if (!user) return;
    try {
      setAddressLoading(true);
      const newId = await saveUserAddress(user.uid, { ...data, isDefault: true });
      const freshList = await getUserAddresses(user.uid);
      setAddresses(freshList);
      const created = freshList.find((a) => a.id === newId) || freshList[0];
      setSelectedAddress(created);
      setIsAddingAddress(false);
    } catch (error) {
      console.error('Checkout address save failed:', error);
      setCheckoutError('Failed to save delivery address.');
    } finally {
      setAddressLoading(false);
    }
  };

  // Main Checkout Submission
  const handlePlaceOrder = async () => {
    setCheckoutError(null);

    if (!isAuthenticated || !user) {
      router.push('/login?redirect=/checkout');
      return;
    }

    if (!selectedAddress) {
      setCheckoutError('Please select or add a delivery address to continue.');
      return;
    }

    if (items.length === 0) {
      setCheckoutError('Your shopping bag is empty.');
      return;
    }

    setIsProcessing(true);

    try {
      const checkoutFingerprint = JSON.stringify({
        paymentMethod,
        items: items.map((item) => [item.productId, item.quantity]),
        addressId: selectedAddress.id,
        couponCode: couponResult?.isValid ? couponResult.coupon?.code : '',
      });
      if (checkoutRequest.current.fingerprint !== checkoutFingerprint) {
        checkoutRequest.current = { fingerprint: checkoutFingerprint, id: crypto.randomUUID() };
      }
      // 1. Call server API to create the Firestore Order doc and reserve inventory
      const createRes = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutRequestId: checkoutRequest.current.id,
          customerId: user.uid,
          customerDetails: {
            name: user.displayName || selectedAddress.fullName,
            email: user.email,
            phone: selectedAddress.phoneNumber,
          },
          shippingAddress: selectedAddress,
          items,
          paymentMethod,
          couponCode: couponResult?.isValid ? couponResult.coupon?.code : undefined,
        }),
      });

      const orderData = await createRes.json();
      if (!createRes.ok || !orderData.orderId) {
        throw new Error(orderData.error || 'Failed to place order.');
      }

      const { orderId, orderNumber } = orderData;

      if (orderData.paymentStatus === 'captured') {
        clearCart();
        router.push(`/order-confirmation/${orderId}`);
        return;
      }

      // 2. If Cash on Delivery, order is confirmed immediately
      if (paymentMethod === 'cod') {
        clearCart();
        router.push(`/order-confirmation/${orderId}`);
        return;
      }

      // 3. If Online Payment via Razorpay
      const paymentRes = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
        }),
      });

      const rzpOrder = await paymentRes.json();
      if (!paymentRes.ok || !rzpOrder.id) {
        throw new Error(rzpOrder.error || 'Payment initialization failed.');
      }

      // If in dev simulation mode
      if (rzpOrder.isSimulation || !window.Razorpay) {
        // Automatically verify simulated payment for smooth development
        const verifyRes = await fetch('/api/payment/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            razorpayOrderId: rzpOrder.id,
            razorpayPaymentId: `pay_sim_${Date.now()}`,
            razorpaySignature: 'simulated_signature_valid',
          }),
        });

        if (verifyRes.ok) {
          clearCart();
          router.push(`/order-confirmation/${orderId}`);
          return;
        }
      }

      // Production Razorpay Checkout Modal
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_placeholderKey123',
        amount: rzpOrder.amount,
        currency: rzpOrder.currency || 'INR',
        name: 'Casaio Platform',
        description: `Order ${orderNumber}`,
        order_id: rzpOrder.id,
        handler: async function (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) {
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });

            if (verifyRes.ok) {
              clearCart();
              router.push(`/order-confirmation/${orderId}`);
            } else {
              setCheckoutError('Payment verification failed. Please contact concierge support.');
            }
          } catch {
            setCheckoutError('Error verifying payment.');
          } finally {
            setIsProcessing(false);
          }
        },
        prefill: {
          name: selectedAddress.fullName,
          email: user.email,
          contact: selectedAddress.phoneNumber,
        },
        theme: {
          color: '#18181b', // zinc-900 brand charcoal
        },
        modal: {
          ondismiss: function () {
            setIsProcessing(false);
          },
        },
      };

      if (window.Razorpay) {
        const razorpayInstance = new window.Razorpay(options);
        razorpayInstance.open();
      } else {
        throw new Error('Razorpay SDK failed to load. Please try again or choose Cash on Delivery.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during checkout.';
      setCheckoutError(msg);
      setIsProcessing(false);
    }
  };

  // If bag is empty
  if (items.length === 0 && !isProcessing) {
    return (
      <div className="py-20 bg-[#FAFAF8] min-h-[75vh] flex items-center justify-center">
        <div className="text-center max-w-md px-4 space-y-4">
          <div className="w-16 h-16 rounded-full bg-zinc-100 mx-auto flex items-center justify-center text-zinc-400">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-zinc-950">Your Bag is Empty</h2>
          <p className="text-xs text-zinc-500">
            Select handcrafted furnishings or home decor before proceeding to checkout.
          </p>
          <Link href="/products" className="inline-block pt-2">
            <Button variant="primary" size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
              Explore Catalog
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />

      <div className="py-10 bg-[#FAFAF8] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Checkout Header */}
          <div className="mb-8 border-b border-zinc-200/80 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
                Secure Checkout
              </h1>
              <p className="text-xs text-zinc-500 mt-1">
                256-bit encrypted checkout with white-glove insured delivery
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-600 bg-white px-3.5 py-1.5 rounded-full border border-zinc-200/80 shadow-2xs self-start sm:self-auto">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Casaio Buyer Protection Guarantee</span>
            </div>
          </div>

          {/* Checkout Error notification */}
          {checkoutError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">Checkout notice: </span>
                {checkoutError}
              </div>
            </div>
          )}

          {/* Checkout Layout: 2 Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Steps Column (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Step 1: Delivery Address */}
              <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-6">
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-100">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-zinc-950 text-white text-xs font-bold flex items-center justify-center">
                      1
                    </span>
                    <h2 className="font-serif font-bold text-lg text-zinc-950">
                      Delivery Address
                    </h2>
                  </div>

                  {!isAddingAddress && addresses.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                      onClick={() => setIsAddingAddress(true)}
                    >
                      New Address
                    </Button>
                  )}
                </div>

                {/* Unauthenticated Prompt */}
                {!isAuthenticated && (
                  <div className="p-4 rounded-xl bg-orange-50/60 border border-orange-200 text-xs text-orange-900 mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">Have a Casaio account?</p>
                      <p className="text-zinc-600 mt-0.5">
                        Sign in to access your saved addresses and tracked orders.
                      </p>
                    </div>
                    <Link href="/login?redirect=/checkout">
                      <Button size="sm" variant="secondary">
                        Sign In
                      </Button>
                    </Link>
                  </div>
                )}

                {/* Address Form or List */}
                {isAddingAddress ? (
                  <div className="mt-2 pt-2">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="font-medium text-xs text-zinc-900">
                        Add New Delivery Address
                      </h4>
                      {addresses.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setIsAddingAddress(false)}
                          className="text-xs text-zinc-500 hover:text-zinc-900 underline"
                        >
                          Choose from saved
                        </button>
                      )}
                    </div>
                    <AddressForm
                      onSubmit={handleSaveNewAddress}
                      onCancel={addresses.length > 0 ? () => setIsAddingAddress(false) : undefined}
                      isLoading={addressLoading}
                    />
                  </div>
                ) : addressLoading ? (
                  <div className="py-8 flex items-center justify-center text-zinc-400">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span className="text-xs">Loading saved addresses...</span>
                  </div>
                ) : addresses.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-xs text-zinc-500 mb-3">
                      Please enter your shipping address to calculate delivery.
                    </p>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setIsAddingAddress(true)}
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                    >
                      Add Address
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {addresses.map((addr) => (
                      <AddressCard
                        key={addr.id}
                        address={addr}
                        isSelectable
                        isSelected={selectedAddress?.id === addr.id}
                        onSelect={(a) => setSelectedAddress(a)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Step 2: Shipping Method (Complimentary Insured Courier) */}
              <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-6">
                <div className="flex items-center gap-3 pb-4 mb-4 border-b border-zinc-100">
                  <span className="w-7 h-7 rounded-full bg-zinc-950 text-white text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <h2 className="font-serif font-bold text-lg text-zinc-950">
                    Shipping Method
                  </h2>
                </div>

                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 flex items-start gap-4">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-xs text-zinc-900">
                        Complimentary Insured Express Delivery
                      </h4>
                      <span className="text-xs font-bold text-emerald-700 uppercase">
                        FREE
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                      Delivered within 3–5 business days. Ships directly from verified artisan ateliers with bespoke shock-proof packaging.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 3: Payment Method */}
              <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-6">
                <div className="flex items-center gap-3 pb-4 mb-4 border-b border-zinc-100">
                  <span className="w-7 h-7 rounded-full bg-zinc-950 text-white text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <h2 className="font-serif font-bold text-lg text-zinc-950">
                    Payment Method
                  </h2>
                </div>

                <div className="space-y-3">
                  {/* Razorpay Option */}
                  <label
                    onClick={() => setPaymentMethod('razorpay')}
                    className={`block p-4 rounded-xl border cursor-pointer transition-all ${
                      paymentMethod === 'razorpay'
                        ? 'border-zinc-950 bg-zinc-50/60 shadow-xs ring-2 ring-zinc-950/5'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            paymentMethod === 'razorpay'
                              ? 'border-zinc-950 bg-zinc-950'
                              : 'border-zinc-300'
                          }`}
                        >
                          {paymentMethod === 'razorpay' && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                        <CreditCard className="w-4 h-4 text-zinc-700" />
                        <div>
                          <p className="font-serif font-bold text-sm text-zinc-950">
                            Online Payment (Razorpay)
                          </p>
                          <p className="text-xs text-zinc-500">
                            UPI (Google Pay, PhonePe, Paytm), Credit/Debit Cards, NetBanking
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Instant Confirmation
                      </span>
                    </div>
                  </label>

                  {/* Cash on Delivery Option */}
                  <label
                    onClick={() => setPaymentMethod('cod')}
                    className={`block p-4 rounded-xl border cursor-pointer transition-all ${
                      paymentMethod === 'cod'
                        ? 'border-zinc-950 bg-zinc-50/60 shadow-xs ring-2 ring-zinc-950/5'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            paymentMethod === 'cod'
                              ? 'border-zinc-950 bg-zinc-950'
                              : 'border-zinc-300'
                          }`}
                        >
                          {paymentMethod === 'cod' && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                        <Banknote className="w-4 h-4 text-zinc-700" />
                        <div>
                          <p className="font-serif font-bold text-sm text-zinc-950">
                            Cash on Delivery (COD)
                          </p>
                          <p className="text-xs text-zinc-500">
                            Pay upon delivery at your doorstep via cash or digital scan
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">
                        Available
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Summary Column (5 cols) */}
            <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
              <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-6 space-y-6">
                <h3 className="font-serif font-bold text-lg text-zinc-950 pb-4 border-b border-zinc-100">
                  Order Summary ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                </h3>

                {/* Items List Preview */}
                <div className="max-h-60 overflow-y-auto space-y-3.5 pr-1 divide-y divide-zinc-100">
                  {items.map((item) => (
                    <div
                      key={item.variantSku ? `${item.productId}-${item.variantSku}` : item.productId}
                      className="pt-3.5 first:pt-0 flex items-center gap-3"
                    >
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
                        <span className="absolute bottom-0 right-0 bg-zinc-900 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-tl">
                          {item.quantity}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-zinc-900 truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          {item.sellerStoreName}
                        </p>
                      </div>

                      <span className="font-mono text-xs font-bold text-zinc-900 shrink-0">
                        {formatCurrency(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Coupon Code Section */}
                <div className="pt-4 border-t border-zinc-100">
                  {couponResult?.isValid ? (
                    <div className="p-3 rounded-xl bg-orange-50/70 border border-orange-200 flex items-center justify-between text-xs text-orange-900">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-orange-600" />
                        <div>
                          <span className="font-bold">{couponResult.coupon?.code}</span>
                          <span className="text-zinc-600 ml-1.5">
                            (-{formatCurrency(discountAmount)})
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-[11px] font-medium text-rose-600 hover:text-rose-700 underline"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleApplyCoupon} className="flex gap-2">
                      <Input
                        placeholder="Coupon (e.g. CASAIO10)"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        className="text-xs uppercase h-9"
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        disabled={validatingCoupon || !couponCode.trim()}
                        isLoading={validatingCoupon}
                      >
                        Apply
                      </Button>
                    </form>
                  )}
                </div>

                {/* Pricing Line Items */}
                <div className="pt-4 border-t border-zinc-100 space-y-2.5 text-xs">
                  <div className="flex justify-between text-zinc-600">
                    <span>Subtotal</span>
                    <span className="font-mono font-medium text-zinc-900">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>

                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>Artisanal Discount</span>
                      <span className="font-mono">-{formatCurrency(discountAmount)}</span>
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
                      {formatCurrency(Math.round((subtotal - discountAmount) * 0.18))}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-zinc-200/80 flex justify-between items-baseline">
                    <span className="font-serif font-bold text-base text-zinc-950">
                      Grand Total
                    </span>
                    <span className="font-serif font-bold text-xl text-zinc-950">
                      {formatCurrency(grandTotal)}
                    </span>
                  </div>
                </div>

                {/* Primary CTA Button */}
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full text-sm font-semibold tracking-wide py-3.5"
                  onClick={handlePlaceOrder}
                  disabled={isProcessing || !selectedAddress}
                  isLoading={isProcessing}
                  rightIcon={!isProcessing ? <ArrowRight className="w-4 h-4" /> : undefined}
                >
                  {paymentMethod === 'cod'
                    ? `Confirm Order with Cash on Delivery`
                    : `Pay ${formatCurrency(grandTotal)} Securely`}
                </Button>

                {/* Security and Return Guarantees */}
                <div className="pt-4 border-t border-zinc-100 space-y-2.5 text-[11px] text-zinc-500">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
                    <span>Razorpay bank-grade 256-bit encryption</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
                    <span>7-day return policy for verified dropship products</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
                    <span>Direct atelier dispatch with real-time tracking</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
