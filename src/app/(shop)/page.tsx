import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Container } from '@/components/ui/Container';
import { formatCurrency } from '@/lib/utils';
import {
  ArrowRight,
  Sparkles,
  Star,
  ShieldCheck,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';

export default function HomePage() {
  // Curated showcase items demonstrating the design system
  const showcaseProducts = [
    {
      id: 'demo-1',
      title: 'Scandi Fluted Oak Credenza',
      category: 'Living Room',
      seller: 'Nordic Oak Studios',
      price: 24999,
      compareAtPrice: 32000,
      rating: 4.9,
      reviewsCount: 38,
      badge: 'Bestseller',
      imageUrl: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&q=80&w=800',
    },
    {
      id: 'demo-2',
      title: 'Komorebi Ribbed Glass Pendant Lamp',
      category: 'Lighting',
      seller: 'Lumière Atelier',
      price: 4499,
      compareAtPrice: 5999,
      rating: 4.8,
      reviewsCount: 52,
      badge: 'Artisan Crafted',
      imageUrl: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&q=80&w=800',
    },
    {
      id: 'demo-3',
      title: 'Minimalist Travertine Marble Coffee Table',
      category: 'Living Room',
      seller: 'Stoneworks Heritage',
      price: 18500,
      compareAtPrice: 22000,
      rating: 5.0,
      reviewsCount: 19,
      badge: 'Limited Drop',
      imageUrl: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=800',
    },
    {
      id: 'demo-4',
      title: 'Organic Stoneware Dinnerware Set (16 Pc)',
      category: 'Kitchen & Dining',
      seller: 'Clay & Kiln Collective',
      price: 6890,
      compareAtPrice: 8500,
      rating: 4.7,
      reviewsCount: 44,
      badge: 'Curator Pick',
      imageUrl: 'https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?auto=format&fit=crop&q=80&w=800',
    },
  ];

  const categories = [
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

  return (
    <div className="flex flex-col space-y-16 sm:space-y-24 pb-20">
      
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-[#F4F1EB] pt-12 pb-20 lg:pt-20 lg:pb-32 border-b border-zinc-200/60">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 border border-zinc-200 text-xs font-medium text-zinc-800 shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Modern Dropshipping Elevated &bull; Fall/Winter 2026</span>
              </div>

              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-zinc-950 leading-[1.1]">
                Architectural Elegance For The <span className="italic font-normal text-amber-700">Modern</span> Sanctuary.
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
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
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
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-widest">Architectural Spaces</p>
              <h2 className="font-serif text-3xl font-bold text-zinc-950 mt-1">Shop By Sanctuary</h2>
            </div>
            <Link
              href="/categories"
              className="mt-3 md:mt-0 text-xs font-semibold text-zinc-800 hover:text-amber-700 flex items-center gap-1.5 group"
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
                  <span className="text-[11px] uppercase tracking-wider text-amber-300 font-medium">
                    {cat.count}
                  </span>
                  <h3 className="font-serif text-xl font-bold mt-1 group-hover:text-amber-200 transition-colors">
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
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 uppercase tracking-wider">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Trending Drops</span>
              </div>
              <h2 className="font-serif text-3xl font-bold text-zinc-950 mt-1">Curator&apos;s Fall Edit</h2>
              <p className="text-xs text-zinc-500 mt-1">Handpicked furnishings from our top-rated vendor ateliers.</p>
            </div>
            <Link
              href="/products"
              className="mt-3 md:mt-0 text-xs font-semibold text-zinc-800 hover:text-amber-700 flex items-center gap-1.5 group"
            >
              <span>View All 240+ Products</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {showcaseProducts.map((product) => (
              <Card key={product.id} hoverEffect className="flex flex-col overflow-hidden group">
                <div className="relative aspect-4/3 overflow-hidden bg-zinc-100">
                  <Image
                    src={product.imageUrl}
                    alt={product.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-3 left-3 z-10">
                    <Badge variant="accent" size="sm">
                      {product.badge}
                    </Badge>
                  </div>
                </div>

                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1">
                    <span className="uppercase tracking-wider">{product.category}</span>
                    <span className="text-zinc-600 font-medium">By {product.seller}</span>
                  </div>

                  <h3 className="font-serif font-bold text-base text-zinc-900 group-hover:text-amber-700 transition-colors line-clamp-1">
                    {product.title}
                  </h3>

                  <div className="flex items-center gap-1.5 my-2">
                    <div className="flex items-center text-amber-500">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    </div>
                    <span className="text-xs font-semibold text-zinc-800">{product.rating}</span>
                    <span className="text-[11px] text-zinc-400">({product.reviewsCount})</span>
                  </div>

                  <div className="mt-auto pt-3 border-t border-zinc-100 flex items-center justify-between">
                    <div>
                      <span className="font-serif font-bold text-base text-zinc-950">
                        {formatCurrency(product.price)}
                      </span>
                      {product.compareAtPrice && (
                        <span className="ml-2 text-xs text-zinc-400 line-through">
                          {formatCurrency(product.compareAtPrice)}
                        </span>
                      )}
                    </div>
                    <Link href={`/products/${product.id}`}>
                      <Button size="sm" variant="secondary" className="text-xs">
                        View Piece
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* Dropshipping Multi-Vendor Banner */}
      <section>
        <Container>
          <div className="rounded-2xl bg-zinc-950 text-white p-8 sm:p-12 lg:p-16 relative overflow-hidden shadow-2xl">
            {/* Background ambient glow */}
            <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-amber-600/20 blur-3xl pointer-events-none" />

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
                    <CheckCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Dedicated Seller Dashboard</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Direct Weekly Bank Payouts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-amber-400 shrink-0" />
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
