'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Container } from '@/components/ui/Container';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Shield,
  Users,
  Store,
  CreditCard,
  ShoppingBag,
  ArrowRight,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const { user } = useAuth();

  return (
    <div className="py-10 bg-[#FAFAF8] min-h-[85vh]">
      <Container>
        {/* Welcome Header */}
        <div className="bg-zinc-950 text-white rounded-2xl p-6 sm:p-8 shadow-xl mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-white">
                Platform Administration
              </h1>
              <Badge variant="accent" size="sm">
                Super Admin
              </Badge>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Active administrative authority for Casaio Platform &bull; Signed in as {user?.email}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/admin/sellers">
              <Button variant="accent" size="md">
                Review Seller Applications
              </Button>
            </Link>
          </div>
        </div>

        {/* Global Statistics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Gross Merchandise Value</p>
                <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">₹0</h3>
                <span className="text-[11px] text-zinc-400 mt-0.5 block">Razorpay & COD</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <CreditCard className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Orders</p>
                <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">0</h3>
                <span className="text-[11px] text-zinc-400 mt-0.5 block">0 pending verification</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-zinc-100 text-zinc-700 flex items-center justify-center">
                <ShoppingBag className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Registered Sellers</p>
                <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">0</h3>
                <span className="text-[11px] text-amber-700 mt-0.5 block font-medium">0 pending approval</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <Store className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Customer Base</p>
                <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-1">1</h3>
                <span className="text-[11px] text-zinc-400 mt-0.5 block">100% active status</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admin Modules Placeholder */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-8 sm:p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-zinc-900 text-amber-400 flex items-center justify-center mx-auto">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-zinc-950">Administrative Infrastructure Live</h3>
            <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1">
              Protected administrative routing, custom claims verification, and platform oversight are active. Full administrative management modules will activate in Phase 9.
            </p>
          </div>
          <Link href="/" className="inline-block pt-2">
            <Button variant="outline" size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
              Return to Storefront
            </Button>
          </Link>
        </div>
      </Container>
    </div>
  );
}
