'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/common/Logo';
import {
  ShieldCheck,
  Truck,
  RotateCcw,
  CreditCard,
  Mail,
  ArrowRight,
} from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-zinc-950 text-zinc-300 border-t border-zinc-900 pt-16 pb-12 transition-colors">
      {/* Trust Badges */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 border-b border-zinc-900">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-zinc-900 text-orange-500 border border-zinc-800">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Inspected Shipping</h4>
              <p className="text-xs text-zinc-400 mt-1">
                Fast & secure delivery nationwide with real-time milestone tracking.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-zinc-900 text-orange-500 border border-zinc-800">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Flexible Payments</h4>
              <p className="text-xs text-zinc-400 mt-1">
                Razorpay Online (UPI, Cards, Netbanking) & Cash on Delivery supported.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-zinc-900 text-orange-500 border border-zinc-800">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">7-Day Easy Returns</h4>
              <p className="text-xs text-zinc-400 mt-1">
                Hassle-free replacement or refund guarantee on damaged or incorrect items.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-zinc-900 text-orange-500 border border-zinc-800">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Verified Dropshippers</h4>
              <p className="text-xs text-zinc-400 mt-1">
                Every supplier and artisan is rigorously vetted for quality and authenticity.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white p-1 rounded-md inline-block">
              <Logo size="md" showSubtitle />
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
              Casaio is a premier modern e-commerce dropshipping destination curating exquisite home furnishings, artisan decor, and architectural living essentials.
            </p>
            
            {/* Newsletter */}
            <div className="pt-2">
              <p className="text-xs font-semibold text-white uppercase tracking-wider mb-2">
                Join The Casaio Collective
              </p>
              <form onSubmit={(e) => e.preventDefault()} className="flex items-center max-w-sm">
                <div className="relative w-full">
                  <input
                    type="email"
                    placeholder="Enter your email address"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-l-md px-3.5 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-600 focus:ring-1 focus:ring-orange-600"
                  />
                  <Mail className="absolute right-3 top-2.5 w-3.5 h-3.5 text-zinc-500" />
                </div>
                <button
                  type="submit"
                  className="bg-orange-600 hover:bg-orange-700 text-white px-3.5 py-2 rounded-r-md text-xs font-semibold transition-colors flex items-center justify-center shrink-0"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
              <p className="text-[11px] text-zinc-500 mt-1.5">
                Exclusive drop previews, curated interior guides, and zero spam.
              </p>
            </div>
          </div>

          {/* Quick Categories */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white mb-4">
              Curated Collections
            </h4>
            <ul className="space-y-2.5 text-xs text-zinc-400">
              <li><Link href="/categories/living-room" className="hover:text-orange-400 transition-colors">Living Room</Link></li>
              <li><Link href="/categories/lighting" className="hover:text-orange-400 transition-colors">Architectural Lighting</Link></li>
              <li><Link href="/categories/decor" className="hover:text-orange-400 transition-colors">Artisan Home Decor</Link></li>
              <li><Link href="/categories/kitchen" className="hover:text-orange-400 transition-colors">Dining & Kitchen</Link></li>
              <li><Link href="/categories/bed-bath" className="hover:text-orange-400 transition-colors">Bed & Bath Linen</Link></li>
              <li><Link href="/products?isFeatured=true" className="hover:text-orange-400 transition-colors">Featured New Arrivals</Link></li>
            </ul>
          </div>

          {/* Customer Care */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white mb-4">
              Customer Experience
            </h4>
            <ul className="space-y-2.5 text-xs text-zinc-400">
              <li><Link href="/account/orders" className="hover:text-orange-400 transition-colors">Track Order Status</Link></li>
              <li><Link href="/shipping-policy" className="hover:text-orange-400 transition-colors">Shipping & Delivery</Link></li>
              <li><Link href="/returns-refunds" className="hover:text-orange-400 transition-colors">Returns & Exchanges</Link></li>
              <li><Link href="/faq" className="hover:text-orange-400 transition-colors">Help & FAQ</Link></li>
              <li><Link href="/contact" className="hover:text-orange-400 transition-colors">Contact Support</Link></li>
            </ul>
          </div>

          {/* Partners & Sellers */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white mb-4">
              Seller Platform
            </h4>
            <ul className="space-y-2.5 text-xs text-zinc-400">
              <li><Link href="/seller/register" className="hover:text-orange-400 transition-colors">Sell on Casaio</Link></li>
              <li><Link href="/seller/dashboard" className="hover:text-orange-400 transition-colors">Seller Portal Login</Link></li>
              <li><Link href="/seller/guidelines" className="hover:text-orange-400 transition-colors">Supplier Standards</Link></li>
              <li><Link href="/seller/dropship-faq" className="hover:text-orange-400 transition-colors">Dropship Logistics</Link></li>
              <li><Link href="/admin/dashboard" className="text-zinc-600 hover:text-zinc-400 transition-colors">Platform Admin</Link></li>
            </ul>
          </div>

        </div>
      </div>

      {/* Bottom Bar: Copyright & Payment Methods */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-zinc-500">
          &copy; {new Date().getFullYear()} Casaio Inc. All rights reserved. Crafted for sophisticated modern living.
        </p>

        {/* Payment Badges */}
        <div className="flex items-center gap-2 text-[10px] text-zinc-400">
          <span className="px-2 py-1 bg-zinc-900 rounded border border-zinc-800 font-mono">Razorpay</span>
          <span className="px-2 py-1 bg-zinc-900 rounded border border-zinc-800 font-mono">UPI</span>
          <span className="px-2 py-1 bg-zinc-900 rounded border border-zinc-800 font-mono">Cards</span>
          <span className="px-2 py-1 bg-zinc-900 rounded border border-zinc-800 font-mono">Cash on Delivery</span>
        </div>
      </div>
    </footer>
  );
};
