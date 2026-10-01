'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/common/Logo';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { Badge } from '@/components/ui/Badge';
import { NotificationBell } from '@/components/layout/NotificationBell';
import {
  Search,
  ShoppingBag,
  Heart,
  User as UserIcon,
  Menu,
  X,
  Store,
  Shield,
  LogOut,
  Package,
} from 'lucide-react';

export const StoreHeader: React.FC = () => {
  const router = useRouter();
  const { user, role, isAuthenticated, logout } = useAuth();
  const { itemCount: cartCount, openCart } = useCart();
  const { itemCount: wishlistCount } = useWishlist();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      router.push(`/products?q=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
    }
  };

  const handleSignOut = async () => {
    setIsUserMenuOpen(false);
    await logout();
    router.push('/');
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
              {wishlistCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center ring-2 ring-white">
                  {wishlistCount}
                </span>
              )}
            </Link>

            {/* In-App Notifications */}
            <NotificationBell />

            {/* Auth / Account Dropdown */}
            {isAuthenticated && user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded-full border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-all text-zinc-800"
                >
                  <div className="w-6 h-6 rounded-full bg-zinc-900 text-amber-400 font-serif font-bold text-xs flex items-center justify-center">
                    {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <span className="hidden sm:inline text-xs font-semibold max-w-[80px] truncate">
                    {user.displayName.split(' ')[0]}
                  </span>
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-zinc-200 py-2 z-50 animate-fade-in text-xs">
                    <div className="px-4 py-2 border-b border-zinc-100">
                      <p className="font-semibold text-zinc-900 truncate">{user.displayName}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
                      <div className="mt-1">
                        <Badge variant="accent" size="sm">
                          {role}
                        </Badge>
                      </div>
                    </div>

                    <div className="py-1">
                      <Link
                        href="/account/profile"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
                      >
                        <UserIcon className="w-4 h-4 text-zinc-400" />
                        <span>My Profile</span>
                      </Link>

                      <Link
                        href="/account/orders"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
                      >
                        <Package className="w-4 h-4 text-zinc-400" />
                        <span>Order History</span>
                      </Link>

                      {(role === 'seller' || role === 'admin') && (
                        <Link
                          href="/seller/dashboard"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-amber-700 hover:bg-amber-50"
                        >
                          <Store className="w-4 h-4" />
                          <span>Seller Dashboard</span>
                        </Link>
                      )}

                      {role === 'admin' && (
                        <Link
                          href="/admin/dashboard"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-zinc-900 font-semibold hover:bg-zinc-50"
                        >
                          <Shield className="w-4 h-4 text-amber-600" />
                          <span>Admin Portal</span>
                        </Link>
                      )}
                    </div>

                    <div className="pt-1 border-t border-zinc-100">
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-zinc-700 hover:text-zinc-900 rounded-full hover:bg-zinc-100 transition-colors"
                aria-label="User sign in"
              >
                <UserIcon className="w-5 h-5 sm:w-4 sm:h-4 text-zinc-600" />
                <span className="hidden sm:inline text-xs font-semibold">Sign In</span>
              </Link>
            )}

            {/* Shopping Cart Drawer Trigger */}
            <button
              onClick={openCart}
              className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 text-zinc-900 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full transition-colors relative shadow-xs"
              aria-label="Open Shopping Bag"
            >
              <ShoppingBag className="w-4 h-4 sm:w-4 sm:h-4 text-amber-400" />
              <span className="hidden sm:inline text-xs font-medium tracking-wide">Cart</span>
              <span className="bg-amber-500 text-zinc-950 text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center -ml-1 sm:ml-0">
                {cartCount}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Search Input Drawer */}
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
            {isAuthenticated ? (
              <>
                <Link
                  href="/account/profile"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 rounded-md"
                >
                  My Profile ({user?.displayName})
                </Link>
                <Link
                  href="/account/orders"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 rounded-md"
                >
                  My Orders & Tracking
                </Link>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left block px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 rounded-md"
              >
                Customer Sign In
              </Link>
            )}

            <Link
              href="/seller/dashboard"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 rounded-md"
            >
              <Store className="w-4 h-4" />
              <span>Seller Hub & Registration</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
