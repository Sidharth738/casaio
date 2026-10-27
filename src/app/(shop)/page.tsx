import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Container } from '@/components/ui/Container';
import { getRenderableImageUrl } from '@/lib/utils';
import { getPublicCategories, getPublicProductPage } from '@/lib/firebase/server-catalog';
import type { Category, Product } from '@/types';
import { ProductCard } from '@/components/product/ProductCard';
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';

export const revalidate = 60;

export default async function HomePage() {
  const fallbackCategories = [
    {
      name: 'Living Room',
      count: '140+ Pieces',
      imageUrl: 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&q=80&w=600',
      href: '/categories/living-room',
    },
    {
      name: 'Architectural Lighting',
      count: '85+ Fixtures',
      imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=600',
      href: '/categories/lighting',
    },
    {
      name: 'Artisan Decor & Vases',
      count: '210+ Objects',
      imageUrl: 'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&q=80&w=600',
      href: '/categories/decor',
    },
    {
      name: 'Dining & Kitchenware',
      count: '95+ Sets',
      imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&q=80&w=600',
      href: '/categories/kitchen',
    },
  ];

  let activeCategories: Category[] = [];
  try {
    activeCategories = await getPublicCategories();
  } catch {
    // Keep the curated fallback while Firestore is unavailable.
  }
  const categories = activeCategories.length > 0
    ? activeCategories.slice(0, 8).map((category, index) => ({
        name: category.name,
        count: 'Explore Collection',
        imageUrl: getRenderableImageUrl(category.imageUrl) || fallbackCategories[index % fallbackCategories.length].imageUrl,
        href: `/categories/${category.slug}`,
      }))
    : fallbackCategories;

  let activeProducts: Product[] = [];
  try {
    activeProducts = (await getPublicProductPage({ sortBy: 'newest' })).products;
  } catch {
    // Keep the curated fallback while Firestore is unavailable.
  }
  const showcaseProducts = activeProducts.slice(0, 8);

  return (
    <div className="flex flex-col space-y-16 sm:space-y-24 pb-20">
      
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-[#F4F1EB] pt-12 pb-20 lg:pt-20 lg:pb-32 border-b border-zinc-200/60">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 border border-zinc-200 text-xs font-medium text-zinc-800 shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                <span>Modern Dropshipping Elevated &bull; Fall/Winter 2026</span>
              </div>

              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-zinc-950 leading-[1.1]">
                Architectural Elegance For The <span className="italic font-normal text-orange-700">Modern</span> Sanctuary.
              </h1>

              <p className="text-base sm:text-lg text-zinc-600 max-w-xl leading-relaxed">
                Casaio connects selective homeowners with certified artisan workshops and verified suppliers worldwide. Experience verified dropshipping with guaranteed quality control, secure Razorpay checkout, and express delivery.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link href="/products">
                  <Button size="lg" variant="primary" rightIcon={<ArrowRight className="w-4 h-4" />}>
                    Explore Curated Drops
                  </Button>
                </Link>
                <Link href="/seller/register">
                  <Button size="lg" variant="outline">
                    Become A Verified Seller
                  </Button>
                </Link>
              </div>

              {/* Assurance Metrics */}
              <div className="pt-6 border-t border-zinc-200/80 grid grid-cols-3 gap-6 max-w-md">
                <div>
                  <p className="font-serif text-2xl font-bold text-zinc-900">100%</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Authenticity Vetted</p>
                </div>
                <div>
                  <p className="font-serif text-2xl font-bold text-zinc-900">₹0</p>
                  <p className="text-xs text-zinc-500 mt-0.5">COD Processing Fee</p>
                </div>
                <div>
                  <p className="font-serif text-2xl font-bold text-zinc-900">7 Days</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Hassle-Free Returns</p>
                </div>
              </div>
            </div>

            {/* Right Visual Banner */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <div className="relative aspect-4/5 rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-zinc-200">
                  <Image
                    src="https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&q=80&w=1200"
                    alt="Casaio Curated Living Room Design"
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 500px"
                    className="object-cover transition-transform duration-700 hover:scale-105"
                  />
                </div>

                {/* Floating Highlight Card */}
                <div className="absolute -bottom-6 -left-6 bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-xl border border-zinc-200/80 max-w-xs hidden sm:block animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-900">Casaio Quality Guarantee</p>
                      <p className="text-[11px] text-zinc-500">Every item dispatched with certified multi-point inspection.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </Container>
      </section>

      {/* Featured Categories */}
      <section>
        <Container>
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10">
            <div>
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-widest">Architectural Spaces</p>
              <h2 className="font-serif text-3xl font-bold text-zinc-950 mt-1">Shop By Sanctuary</h2>
            </div>
            <Link
              href="/categories"
              className="mt-3 md:mt-0 text-xs font-semibold text-zinc-800 hover:text-orange-700 flex items-center gap-1.5 group"
            >
              <span>Explore All Categories</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {categories.map((cat) => (
              <Link
                key={cat.name}
                href={cat.href}
                className="group relative block aspect-3/4 rounded-xl overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300"
              >
                <Image
                  src={cat.imageUrl}
                  alt={cat.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 text-white">
                  <span className="text-[11px] uppercase tracking-wider text-orange-300 font-medium">
                    {cat.count}
                  </span>
                  <h3 className="font-serif text-xl font-bold mt-1 group-hover:text-orange-200 transition-colors">
                    {cat.name}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Curator's Picks (Product Showcase) */}
      <section className="bg-zinc-50/60 py-16 border-y border-zinc-200/60">
        <Container>
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 uppercase tracking-wider">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Trending Drops</span>
              </div>
              <h2 className="font-serif text-3xl font-bold text-zinc-950 mt-1">Curator&apos;s Fall Edit</h2>
              <p className="text-xs text-zinc-500 mt-1">Handpicked furnishings from our top-rated vendor ateliers.</p>
            </div>
            <Link
              href="/products"
              className="mt-3 md:mt-0 text-xs font-semibold text-zinc-800 hover:text-orange-700 flex items-center gap-1.5 group"
            >
              <span>View All Products</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {showcaseProducts.length > 0 ? showcaseProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            )) : (
              <div className="col-span-full rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center">
                <h3 className="font-serif text-lg font-semibold text-zinc-900">New pieces are on the way</h3>
                <p className="mt-2 text-sm text-zinc-500">Browse our catalogue to see the latest Casaio collections.</p>
                <Link href="/products" className="mt-4 inline-block text-sm font-semibold text-orange-700 hover:text-orange-800">
                  Browse all products
                </Link>
              </div>
            )}
          </div>
        </Container>
      </section>

      {/* Dropshipping Multi-Vendor Banner */}
      <section>
        <Container>
          <div className="rounded-2xl bg-zinc-950 text-white p-8 sm:p-12 lg:p-16 relative overflow-hidden shadow-2xl">
            {/* Background ambient glow */}
            <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-orange-600/20 blur-3xl pointer-events-none" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-4">
                <Badge variant="accent" size="sm">
                  Vendor & Artisan Network
                </Badge>
                <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                  Manufacture Or Curate Luxury Goods? Partner with Casaio.
                </h2>
                <p className="text-sm text-zinc-300 max-w-2xl leading-relaxed">
                  Join our curated dropshipping marketplace. We handle the storefront, secure payments via Razorpay, and direct customer acquisition. You maintain your inventory and ship directly with our pre-negotiated logistics partners.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-xs text-zinc-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-orange-400 shrink-0" />
                    <span>Dedicated Seller Dashboard</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-orange-400 shrink-0" />
                    <span>Direct Weekly Bank Payouts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-orange-400 shrink-0" />
                    <span>Real-time Inventory Sync</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-3 justify-center">
                <Link href="/seller/register" className="w-full">
                  <Button size="lg" variant="accent" className="w-full">
                    Apply as a Seller
                  </Button>
                </Link>
                <Link href="/seller/dashboard" className="w-full">
                  <Button size="lg" variant="outline" className="w-full text-white border-zinc-700 hover:bg-zinc-900">
                    Seller Portal Login
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>

    </div>
  );
}
