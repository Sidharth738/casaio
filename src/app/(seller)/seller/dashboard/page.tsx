'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Container } from '@/components/ui/Container';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Store,
  Package,
  TrendingUp,
  Clock,
  ArrowRight,
  PlusCircle,
} from 'lucide-react';

export default function SellerDashboardPage() {
  const { user } = useAuth();

  return (
    <div className="py-10 bg-[#FAFAF8] min-h-[85vh]">
      <Container>
        {/* Welcome Banner */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-zinc-200 shadow-xs mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
                Seller Command Center
              </h1>
              <Badge variant="accent" size="sm">
                Verified Vendor
              </Badge>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Welcome back, {user?.displayName || 'Partner'}. Monitor your dropshipping inventory, sales, and fulfillment.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/seller/products/new">
              <Button variant="primary" size="md" leftIcon={<PlusCircle className="w-4 h-4" />}>
                Add New Product
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Gross Sales</p>
                <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">₹0</h3>
                <span className="text-[11px] text-zinc-400 mt-0.5 block">0 orders this month</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Active Catalog</p>
                <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">0</h3>
                <span className="text-[11px] text-zinc-400 mt-0.5 block">0 draft items</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-zinc-100 text-zinc-700 flex items-center justify-center">
                <Store className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Pending Shipment</p>
                <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">0</h3>
                <span className="text-[11px] text-zinc-400 mt-0.5 block">0 overdue</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Dispatches</p>
                <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">0</h3>
                <span className="text-[11px] text-zinc-400 mt-0.5 block">100% on-time rate</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Package className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Empty Catalog State */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-8 sm:p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center mx-auto">
            <Package className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-zinc-950">Your Catalog Is Ready</h3>
            <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1">
              Start publishing your furnishings and decor items to the Casaio platform. Detailed product management will activate in Phase 8.
            </p>
          </div>
          <Link href="/products" className="inline-block pt-2">
            <Button variant="secondary" size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
              Preview Public Catalog
            </Button>
          </Link>
        </div>
      </Container>
    </div>
  );
}
