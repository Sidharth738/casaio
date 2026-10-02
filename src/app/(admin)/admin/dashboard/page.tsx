'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  ShoppingBag,
  Store,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Order, SellerProfile, Product, UserProfile } from '@/types';
import {
  getAllOrdersAdmin,
  getAllSellers,
  getAllProductsAdmin,
  getAllUsersAdmin,
} from '@/lib/firebase/firestore';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loading = !isFetched && Boolean(user);

  const loadData = () => {
    Promise.all([
      getAllOrdersAdmin(),
      getAllSellers(),
      getAllProductsAdmin(),
      getAllUsersAdmin(),
    ])
      .then(([ords, sels, prods, usrs]) => {
        setOrders(ords);
        setSellers(sels);
        setProducts(prods);
        setUsers(usrs);
      })
      .catch(() => {})
      .finally(() => {
        setIsFetched(true);
      });
  };

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const handleSellerStatusChange = async (sellerId: string, status: 'approved' | 'rejected') => {
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
      alert('Error updating status.');
    } finally {
      setActionLoading(null);
    }
  };

  // Calculations
  const gmv = orders.reduce((sum, o) => {
    if (o.orderStatus !== 'cancelled') {
      return sum + o.pricing.totalAmount;
    }
    return sum;
  }, 0);

  const pendingSellers = sellers.filter((s) => s.status === 'pending');
  const pendingOrders = orders.filter(
    (o) => o.orderStatus === 'pending' || o.orderStatus === 'confirmed'
  );
  const recentOrders = orders.slice(0, 5);

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-orange-600" />
        <p className="text-xs">Compiling platform telemetry and governance stats...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="bg-zinc-950 text-white rounded-2xl p-6 sm:p-8 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 border border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-white">
              Platform Command Center
            </h1>
            <Badge variant="accent" size="sm">
              Live Production
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl">
            Global governance for Casaio dropshipping infrastructure &bull; Signed in as {user?.email}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {pendingSellers.length > 0 && (
            <Link href="/admin/sellers">
              <Button variant="accent" size="sm" className="text-xs">
                Review {pendingSellers.length} Pending {pendingSellers.length === 1 ? 'Seller' : 'Sellers'}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Global Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-zinc-200/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Platform GMV
              </p>
              <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">
                {formatCurrency(gmv)}
              </h3>
              <span className="text-[11px] text-zinc-400 mt-0.5 block">
                Razorpay + COD Settlement
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <CreditCard className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Total Orders
              </p>
              <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">
                {orders.length}
              </h3>
              <span className="text-[11px] text-orange-700 font-medium mt-0.5 block">
                {pendingOrders.length} pending processing
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-zinc-100 text-zinc-700 flex items-center justify-center">
              <ShoppingBag className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Artisan Sellers
              </p>
              <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">
                {sellers.length}
              </h3>
              <span className="text-[11px] text-orange-700 font-semibold mt-0.5 block">
                {pendingSellers.length} pending review
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-700 flex items-center justify-center">
              <Store className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Catalog & Users
              </p>
              <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">
                {products.length}
              </h3>
              <span className="text-[11px] text-zinc-400 mt-0.5 block">
                {users.length} registered accounts
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2-Column: Pending Seller Applications Queue + Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Pending Seller Queue (6 cols) */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-zinc-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-600" />
              <h3 className="font-serif font-bold text-base text-zinc-950">
                Pending Seller Applications ({pendingSellers.length})
              </h3>
            </div>
            <Link
              href="/admin/sellers"
              className="text-xs font-medium text-zinc-500 hover:text-zinc-950 flex items-center gap-1"
            >
              <span>All Sellers</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {pendingSellers.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-xs">
              No seller applications currently pending review.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {pendingSellers.map((seller) => (
                <div key={seller.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-serif font-bold text-sm text-zinc-900">
                        {seller.storeName}
                      </h4>
                      <p className="text-xs text-zinc-500 font-mono mt-0.5">
                        {seller.storeEmail} &bull; {seller.storePhone}
                      </p>
                      <p className="text-xs text-zinc-600 mt-1">
                        Location: {seller.businessAddress?.city}, {seller.businessAddress?.state}
                      </p>
                      {seller.description && (
                        <p className="text-xs text-zinc-500 italic mt-0.5">
                          &ldquo;{seller.description}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="primary"
                        className="h-8 text-xs bg-emerald-700 hover:bg-emerald-800 border-emerald-700"
                        onClick={() => handleSellerStatusChange(seller.id, 'approved')}
                        disabled={actionLoading === seller.id}
                        isLoading={actionLoading === seller.id}
                        leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                        onClick={() => handleSellerStatusChange(seller.id, 'rejected')}
                        disabled={actionLoading === seller.id}
                        leftIcon={<XCircle className="w-3.5 h-3.5" />}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Recent Orders (6 cols) */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-zinc-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <h3 className="font-serif font-bold text-base text-zinc-950">
              Recent Customer Orders
            </h3>
            <Link
              href="/admin/orders"
              className="text-xs font-medium text-zinc-500 hover:text-zinc-950 flex items-center gap-1"
            >
              <span>All Orders</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-xs">
              No orders placed yet.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {recentOrders.map((o) => (
                <div key={o.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-zinc-900">
                        {o.orderNumber}
                      </span>
                      <Badge variant="secondary" size="sm" className="capitalize text-[10px]">
                        {o.orderStatus.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="text-zinc-500 mt-0.5">
                      {o.customerDetails.name} &bull; {o.items.length} {o.items.length === 1 ? 'item' : 'items'} &bull; {formatDate(o.createdAt)}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-zinc-950 block">
                      {formatCurrency(o.pricing.totalAmount)}
                    </span>
                    <span className="text-[10px] text-zinc-400 capitalize">
                      {o.payment.method} ({o.payment.status})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
