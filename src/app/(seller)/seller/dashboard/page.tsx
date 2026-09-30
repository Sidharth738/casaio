'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Store,
  Package,
  TrendingUp,
  Clock,
  PlusCircle,
  AlertTriangle,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Product, Order, SellerProfile } from '@/types';
import {
  getSellerProfile,
  getSellerProducts,
  getSellerOrders,
} from '@/lib/firebase/firestore';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function SellerDashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isFetched, setIsFetched] = useState(false);

  const loading = !isFetched && Boolean(user);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;

    Promise.all([
      getSellerProfile(user.uid),
      getSellerProducts(user.uid),
      getSellerOrders(user.uid),
    ])
      .then(([prof, prods, ords]) => {
        if (isMounted) {
          setProfile(prof);
          setProducts(prods);
          setOrders(ords);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsFetched(true);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  // Derived metrics for this seller
  let grossSales = 0;
  let pendingShipmentsCount = 0;
  let totalDispatchesCount = 0;

  orders.forEach((o) => {
    const sellerItems = o.items.filter((i) => i.sellerId === user?.uid);
    sellerItems.forEach((i) => {
      grossSales += i.totalPrice;
      if (i.fulfillmentStatus === 'pending' || i.fulfillmentStatus === 'processing') {
        pendingShipmentsCount += 1;
      } else if (i.fulfillmentStatus === 'shipped' || i.fulfillmentStatus === 'delivered') {
        totalDispatchesCount += 1;
      }
    });
  });

  const activeProducts = products.filter((p) => p.status === 'active');
  const lowStockProducts = products.filter((p) => p.stock <= p.lowStockThreshold);
  const recentOrders = orders.slice(0, 5);

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-amber-600" />
        <p className="text-xs">Loading seller command metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-zinc-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
              {profile?.storeName || 'Atelier'} Command Center
            </h1>
            <Badge variant="accent" size="sm">
              Verified Vendor
            </Badge>
          </div>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            Welcome back, {user?.displayName || 'Partner'}. Monitor your live dropshipping metrics, atelier stock, and client courier dispatches.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/seller/products/new">
            <Button
              variant="primary"
              size="md"
              leftIcon={<PlusCircle className="w-4 h-4" />}
            >
              Add New Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Real Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-zinc-200/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Gross Sales
              </p>
              <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">
                {formatCurrency(grossSales)}
              </h3>
              <span className="text-[11px] text-zinc-400 mt-0.5 block">
                {orders.length} orders total
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Active Catalog
              </p>
              <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">
                {activeProducts.length}
              </h3>
              <span className="text-[11px] text-zinc-400 mt-0.5 block">
                {products.length - activeProducts.length} draft/out of stock
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-zinc-100 text-zinc-700 flex items-center justify-center">
              <Store className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Pending Shipments
              </p>
              <h3 className="font-serif text-2xl font-bold text-amber-700 mt-1">
                {pendingShipmentsCount}
              </h3>
              <span className="text-[11px] text-zinc-400 mt-0.5 block">
                Requires courier packing
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Total Dispatches
              </p>
              <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">
                {totalDispatchesCount}
              </h3>
              <span className="text-[11px] text-zinc-400 mt-0.5 block">
                Shipped or delivered
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Package className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2-Column: Low Stock Alerts + Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Recent Orders (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-zinc-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <h3 className="font-serif font-bold text-base text-zinc-950">
              Recent Client Orders
            </h3>
            <Link
              href="/seller/orders"
              className="text-xs font-medium text-zinc-500 hover:text-zinc-950 flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-xs">
              No orders placed yet for your products.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {recentOrders.map((o) => {
                const sellerItems = o.items.filter((i) => i.sellerId === user?.uid);
                const sellerSubtotal = sellerItems.reduce((sum, i) => sum + i.totalPrice, 0);

                return (
                  <div key={o.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/seller/orders/${o.id}`}
                          className="font-mono font-bold text-xs text-zinc-900 hover:text-amber-700 transition-colors"
                        >
                          {o.orderNumber}
                        </Link>
                        <Badge variant="secondary" size="sm" className="capitalize text-[10px]">
                          {o.orderStatus.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {o.customerDetails.name} • {o.shippingAddress.city} • {formatDate(o.createdAt)}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="font-mono text-xs font-bold text-zinc-900 block">
                        {formatCurrency(sellerSubtotal)}
                      </span>
                      <Link
                        href={`/seller/orders/${o.id}`}
                        className="text-[11px] text-amber-700 hover:underline font-medium"
                      >
                        Dispatch →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Low Stock Warnings & Quick Links (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Low stock alerts */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="font-serif font-bold text-sm text-zinc-950">
                  Inventory Alerts
                </h3>
              </div>
              <span className="text-xs font-mono text-zinc-400">
                {lowStockProducts.length} low stock
              </span>
            </div>

            {lowStockProducts.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">
                All catalog inventory levels are healthy.
              </p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {lowStockProducts.slice(0, 4).map((p) => (
                  <div key={p.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-xs text-zinc-900 truncate">{p.title}</p>
                      <span className="font-mono text-[10px] text-zinc-400">SKU: {p.sku}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-xs text-rose-600">
                        {p.stock} units left
                      </span>
                      <Link
                        href={`/seller/products/${p.id}/edit`}
                        className="block text-[10px] text-zinc-500 hover:underline"
                      >
                        Restock
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 shadow-xs space-y-3">
            <h4 className="font-serif font-bold text-sm text-zinc-950 pb-2 border-b border-zinc-100">
              Quick Shortcuts
            </h4>
            <div className="space-y-2 text-xs">
              <Link
                href="/seller/products/new"
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                <span className="font-medium text-zinc-800">Publish New Item</span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              </Link>
              <Link
                href="/seller/products"
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                <span className="font-medium text-zinc-800">Manage Catalog & Stock</span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              </Link>
              <Link
                href="/seller/orders"
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                <span className="font-medium text-zinc-800">Check Pending Dispatches</span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              </Link>
              <Link
                href="/seller/profile"
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                <span className="font-medium text-zinc-800">Store Profile & Payout Settings</span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
