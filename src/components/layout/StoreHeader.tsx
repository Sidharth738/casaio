'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/common/Logo';
import {
  Search,
  ShoppingBag,
  Heart,
  User,
  Menu,
  X,
  Store,
} from 'lucide-react';

export const StoreHeader: React.FC = () => {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Sample category navigation items
  const navCategories = [
    { name: 'All Products', href: '/products' },
    { name: 'Living Room', href: '/categories/living-room' },
    { name: 'Lighting', href: '/categories/lighting' },
    { name: 'Decor & Accents', href: '/categories/decor' },
    { name: 'Kitchen & Dining', href: '/categories/kitchen' },
    { name: 'Bed & Bath', href: '/categories/bed-bath' },
  ];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?searchQuery=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-zinc-200/80 transition-shadow duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          
          {/* Mobile menu trigger */}
          <div className="flex items-center lg:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 -ml-2 text-zinc-700 hover:text-zinc-900 rounded-md hover:bg-zinc-100 focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Brand Logo */}
          <div className="flex shrink-0 items-center">
            <Logo size="md" showSubtitle />
          </div>

          {/* Desktop Search Bar */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <form onSubmit={handleSearchSubmit} className="relative w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search luxury furnishings, rugs, lighting..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-full focus:outline-none focus:border-amber-600 focus:bg-white focus:ring-1 focus:ring-amber-600 transition-all text-zinc-900 placeholder:text-zinc-400"
              />
              <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-zinc-400 pointer-events-none" />
            </form>
          </div>

          {/* Right Action Icons */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Mobile Search Toggle */}
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="md:hidden p-2 text-zinc-700 hover:text-zinc-900 rounded-full hover:bg-zinc-100"
              aria-label="Search products"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Seller Portal Link */}
            <Link
              href="/seller/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:text-zinc-900 border border-zinc-200 rounded-md hover:bg-zinc-50 transition-colors"
            >
              <Store className="w-3.5 h-3.5 text-amber-600" />
              <span>Seller Hub</span>
            </Link>

            {/* Wishlist */}
            <Link
              href="/account/wishlist"
              className="p-2 text-zinc-700 hover:text-zinc-900 rounded-full hover:bg-zinc-100 relative transition-colors"
              aria-label="Saved items wishlist"
            >
              <Heart className="w-5 h-5" />
            </Link>

            {/* Account Link */}
            <Link
              href="/login"
              className="p-2 text-zinc-700 hover:text-zinc-900 rounded-full hover:bg-zinc-100 relative transition-colors"
              aria-label="User account or sign in"
            >
              <User className="w-5 h-5" />
            </Link>

            {/* Shopping Cart */}
            <Link
              href="/cart"
              className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 text-zinc-900 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full transition-colors relative shadow-xs"
              aria-label="Shopping Cart"
            >
              <ShoppingBag className="w-4 h-4 sm:w-4 sm:h-4 text-amber-400" />
              <span className="hidden sm:inline text-xs font-medium tracking-wide">Cart</span>
              <span className="bg-amber-500 text-zinc-950 text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center -ml-1 sm:ml-0">
                0
              </span>
            </Link>
          </div>
        </div>

        {/* Mobile Search Input Drawer (Expands below header when toggled) */}
        {isSearchOpen && (
          <div className="md:hidden pb-3 pt-1 border-t border-zinc-100 animate-fade-in">
            <form onSubmit={handleSearchSubmit} className="relative w-full">
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-full focus:outline-none focus:border-amber-600 focus:bg-white"
              />
              <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-zinc-400 pointer-events-none" />
            </form>
          </div>
        )}

        {/* Desktop Category Navigation */}
        <nav className="hidden lg:flex items-center justify-center space-x-8 py-2.5 border-t border-zinc-100 text-xs font-medium tracking-wide uppercase text-zinc-600">
          {navCategories.map((cat) => (
            <Link
              key={cat.href}
              href={cat.href}
              className="hover:text-amber-600 transition-colors py-1 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-amber-600 hover:after:w-full after:transition-all"
            >
              {cat.name}
            </Link>
          ))}
          <Link
            href="/products?isFeatured=true"
            className="text-amber-700 font-semibold hover:text-amber-800 transition-colors py-1"
          >
            Curator&apos;s Choice
          </Link>
        </nav>
      </div>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-zinc-200 bg-white px-4 pt-3 pb-6 animate-fade-in shadow-xl">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-3 py-1">Categories</p>
            {navCategories.map((cat) => (
              <Link
                key={cat.href}
                href={cat.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 rounded-md"
              >
                {cat.name}
              </Link>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-100 space-y-2">
            <Link
              href="/seller/dashboard"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 rounded-md"
            >
              <Store className="w-4 h-4" />
              <span>Seller Hub & Registration</span>
            </Link>
            <Link
              href="/account/orders"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 rounded-md"
            >
              My Orders & Tracking
            </Link>
            <Link
              href="/login"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 rounded-md"
            >
              Customer Sign In
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
