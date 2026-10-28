import Link from 'next/link';
import { Logo } from '@/components/common/Logo';
import {
  ShieldCheck,
  Truck,
  RotateCcw,
  CreditCard,
} from 'lucide-react';

export function Footer() {
  return (
    <footer data-site-footer className="bg-zinc-950 text-zinc-300 border-t border-zinc-900 pt-16 pb-12 transition-colors">
      {/* Trust Badges */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 border-b border-zinc-900">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-zinc-900 text-orange-500 border border-zinc-800">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Inspected Shipping</h2>
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
              <h2 className="text-sm font-semibold text-white">Flexible Payments</h2>
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
              <h2 className="text-sm font-semibold text-white">7-Day Easy Returns</h2>
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
              <h2 className="text-sm font-semibold text-white">Verified Dropshippers</h2>
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
              <Logo size="md" />
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
              Casaio is a premier modern e-commerce dropshipping destination curating exquisite home furnishings, artisan decor, and architectural living essentials.
            </p>

          </div>

          {/* Quick Categories */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white mb-4">
              Curated Collections
            </h2>
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white mb-4">
              Customer Experience
            </h2>
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white mb-4">
              Seller Platform
            </h2>
            <ul className="space-y-2.5 text-xs text-zinc-400">
              <li><Link href="/seller/register" className="hover:text-orange-400 transition-colors">Sell on Casaio</Link></li>
              <li><Link href="/seller/dashboard" className="hover:text-orange-400 transition-colors">Seller Portal Login</Link></li>
              <li><Link href="/seller/guidelines" className="hover:text-orange-400 transition-colors">Supplier Standards</Link></li>
              <li><Link href="/seller/dropship-faq" className="hover:text-orange-400 transition-colors">Dropship Logistics</Link></li>
            </ul>
            <a
              href="https://www.instagram.com/casaio.official/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Follow Casaio on Instagram"
              className="mt-8 inline-flex items-center gap-2 text-xs text-zinc-400 transition-colors hover:text-orange-400"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
              <span>Follow Casaio on Instagram</span>
            </a>
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
}
