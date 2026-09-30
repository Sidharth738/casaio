'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { ShoppingBag, ArrowRight } from 'lucide-react';

export default function CustomerOrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-bold text-zinc-950">Order History</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Review previous orders, track live milestone shipments, and download invoices.
        </p>
      </div>

      {/* Empty State */}
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
    </div>
  );
}
