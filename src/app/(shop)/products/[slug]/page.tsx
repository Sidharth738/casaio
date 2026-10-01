import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, Star, Store, ShieldCheck } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ProductImageGallery } from '@/components/product/ProductImageGallery';
import { ProductActions } from '@/components/product/ProductActions';
import { ProductCard } from '@/components/product/ProductCard';
import { ReviewsSection } from '@/components/review/ReviewsSection';
import { getProductBySlug, getRelatedProducts } from '@/lib/firebase/firestore';
import type { Product } from '@/types';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  let product: Product | null = null;
  try {
    product = await getProductBySlug(slug);
  } catch {
    // Graceful fallback during build
  }

  if (!product) {
    return {
      title: 'Product Not Found | Casaio',
    };
  }

  const primaryImage = product.images.find((img) => img.isPrimary) ?? product.images[0];

  return {
    title: `${product.title} | Casaio`,
    description: product.shortDescription ?? product.description.slice(0, 160),
    openGraph: {
      title: `${product.title} | Casaio`,
      description: product.shortDescription ?? product.description.slice(0, 160),
      images: primaryImage ? [{ url: primaryImage.url }] : [],
    },
  };
}

export const revalidate = 600; // 10 minutes ISR

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { slug } = await params;

  let product: Product | null = null;
  try {
    product = await getProductBySlug(slug);
  } catch {
    // Firestore error
  }

  if (!product) {
    notFound();
  }

  let relatedProducts: Product[] = [];
  try {
    relatedProducts = await getRelatedProducts(product.categorySlug, product.id, 4);
  } catch {
    relatedProducts = [];
  }

  return (
    <div className="py-8 sm:py-12">
      <Container>
        {/* Breadcrumb navigation */}
        <nav className="flex items-center gap-1.5 text-xs text-zinc-500 mb-8 overflow-x-auto whitespace-nowrap">
          <Link href="/" className="hover:text-zinc-900 transition-colors">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          <Link href="/products" className="hover:text-zinc-900 transition-colors">
            Products
          </Link>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          <Link
            href={`/categories/${product.categorySlug}`}
            className="hover:text-zinc-900 transition-colors"
          >
            {product.categorySlug.replace(/-/g, ' ')}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          <span className="text-zinc-900 font-medium truncate max-w-xs">{product.title}</span>
        </nav>

        {/* Main Product Showcase (2-column layout) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 xl:gap-14 items-start">
          {/* Left Column: Image Gallery */}
          <div className="lg:col-span-7">
            <ProductImageGallery images={product.images} title={product.title} />
          </div>

          {/* Right Column: Details & Purchasing Actions */}
          <div className="lg:col-span-5 space-y-6">
            {/* Seller & Verification badge */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-zinc-600">
                <Store className="w-3.5 h-3.5 text-amber-600" />
                <span>Curated by</span>
                <span className="font-semibold text-zinc-900">{product.sellerStoreName}</span>
              </div>
              <Badge variant="outline" size="sm" className="text-[10px]">
                Verified Partner
              </Badge>
            </div>

            {/* Product Title */}
            <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-zinc-950 leading-tight">
              {product.title}
            </h1>

            {/* Rating & Review summary */}
            <div className="flex items-center gap-2">
              <div className="flex items-center text-amber-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      i < Math.floor(product.ratings.average || 5)
                        ? 'fill-amber-500 text-amber-500'
                        : 'text-zinc-300'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs font-semibold text-zinc-800">
                {product.ratings.average ? product.ratings.average.toFixed(1) : '5.0'}
              </span>
              <span className="text-xs text-zinc-400">
                ({product.ratings.count || 12} customer reviews)
              </span>
            </div>

            {/* Short overview */}
            {product.shortDescription && (
              <p className="text-sm text-zinc-600 leading-relaxed">
                {product.shortDescription}
              </p>
            )}

            {/* Purchasing, Variants, Quantity & Guarantees */}
            <ProductActions product={product} />

            {/* Product Specifications & Details */}
            <div className="pt-6 border-t border-zinc-200/80 space-y-4">
              <h2 className="font-serif text-base font-bold text-zinc-900">
                Artisan Specifications
              </h2>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                <div>
                  <dt className="text-zinc-400 uppercase tracking-wider">Item SKU</dt>
                  <dd className="font-medium text-zinc-800 font-mono mt-0.5">{product.sku}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400 uppercase tracking-wider">Category</dt>
                  <dd className="font-medium text-zinc-800 capitalize mt-0.5">
                    {product.categorySlug.replace(/-/g, ' ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-400 uppercase tracking-wider">Fulfillment Model</dt>
                  <dd className="font-medium text-zinc-800 mt-0.5">Direct Dropship (Workshop)</dd>
                </div>
                <div>
                  <dt className="text-zinc-400 uppercase tracking-wider">Available Stock</dt>
                  <dd className="font-medium text-zinc-800 mt-0.5">{product.stock} units</dd>
                </div>
              </dl>

              {product.tags && product.tags.length > 0 && (
                <div className="pt-2">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {product.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detailed Description & Craftsmanship Section */}
        <section className="mt-16 sm:mt-24 pt-12 border-t border-zinc-200/80">
          <div className="max-w-3xl space-y-6">
            <h2 className="font-serif text-2xl font-bold text-zinc-950">
              The Story & Craftsmanship
            </h2>
            <div className="prose prose-zinc max-w-none text-sm text-zinc-700 leading-relaxed whitespace-pre-line">
              {product.description}
            </div>
          </div>
        </section>

        {/* Verified Workshop / Seller Spotlight Card */}
        <section className="mt-12">
          <Card className="p-6 sm:p-8 bg-[#F5F2EB]/60 border-zinc-200/80">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-600/10 border border-amber-600/20 flex items-center justify-center text-amber-700">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif font-bold text-base text-zinc-950">
                      {product.sellerStoreName}
                    </h3>
                    <Badge variant="accent" size="sm">
                      Certified Workshop
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Ships directly to your doorstep with certified multi-point quality assurance.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <div className="flex items-center justify-end gap-1 text-xs font-semibold text-zinc-900">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>100% Quality Vetted</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">On-time fulfillment rate: 98.4%</p>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Live Customer Reviews Section */}
        <ReviewsSection
          productId={product.id}
          initialRating={product.ratings?.average ?? 5}
          initialCount={product.ratings?.count ?? 0}
        />

        {/* Related Products Section */}
        {relatedProducts.length > 0 && (
          <section className="mt-16 sm:mt-24 pt-12 border-t border-zinc-200/80">
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-widest">
                  Complementary Creations
                </p>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950 mt-1">
                  You May Also Admire
                </h2>
              </div>
              <Link
                href={`/categories/${product.categorySlug}`}
                className="text-xs font-semibold text-zinc-800 hover:text-amber-700 flex items-center gap-1"
              >
                <span>View Full Sanctuary</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.map((rel) => (
                <ProductCard key={rel.id} product={rel} />
              ))}
            </div>
          </section>
        )}
      </Container>
    </div>
  );
}
