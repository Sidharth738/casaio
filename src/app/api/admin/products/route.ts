import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';
import type { Product, ProductImage, ProductStatus } from '@/types';
import { revalidatePath } from 'next/cache';

export async function POST(req: NextRequest) {
  try {
    const user = await requireServerRole(req, ['admin']);
    if (!user) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const slug = typeof body.slug === 'string'
      ? body.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : '';
    const price = Number(body.price);
    const stock = Number(body.stock);
    const allowedStatuses: ProductStatus[] = ['active', 'draft', 'out_of_stock', 'archived'];
    const images = Array.isArray(body.images) ? body.images as ProductImage[] : [];

    if (!title || !slug || !Number.isFinite(price) || price <= 0 || !body.categoryId || images.length === 0) {
      return NextResponse.json({ error: 'Title, URL slug, valid price, category, and at least one image are required' }, { status: 400 });
    }
    if (!Number.isInteger(stock) || stock < 0) {
      return NextResponse.json({ error: 'Stock must be a non-negative whole number' }, { status: 400 });
    }
    const [categorySnap, duplicateSlug] = await Promise.all([
      adminDb.collection('categories').doc(String(body.categoryId)).get(),
      adminDb.collection('products').where('slug', '==', slug).limit(1).get(),
    ]);
    if (!categorySnap.exists || categorySnap.data()?.isActive !== true) {
      return NextResponse.json({ error: 'Choose an active category' }, { status: 400 });
    }
    if (!duplicateSlug.empty) {
      return NextResponse.json({ error: 'A product with this URL slug already exists' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const ref = adminDb.collection('products').doc();
    const product: Product = {
      id: ref.id,
      sellerId: user.uid,
      sellerStoreName: 'Casaio Official',
      title,
      slug,
      description: typeof body.description === 'string' ? body.description : '',
      shortDescription: typeof body.shortDescription === 'string' ? body.shortDescription : '',
      price,
      ...(Number(body.compareAtPrice) > 0 ? { compareAtPrice: Number(body.compareAtPrice) } : {}),
      ...(Number(body.costPerItem) >= 0 && body.costPerItem !== '' ? { costPerItem: Number(body.costPerItem) } : {}),
      sku: typeof body.sku === 'string' && body.sku.trim() ? body.sku.trim() : `SKU-${Date.now().toString().slice(-6)}`,
      stock,
      lowStockThreshold: Number.isInteger(Number(body.lowStockThreshold)) && Number(body.lowStockThreshold) > 0 ? Number(body.lowStockThreshold) : 3,
      categoryId: String(body.categoryId),
      categorySlug: categorySnap.data()?.slug || 'decor',
      tags: Array.isArray(body.tags) ? body.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
      images,
      hasVariants: false,
      status: allowedStatuses.includes(body.status) ? body.status : 'active',
      ratings: { average: 0, count: 0 },
      salesCount: 0,
      isFeatured: false,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(product);
    revalidatePath('/', 'page');
    revalidatePath(`/products/${slug}`);
    return NextResponse.json({ success: true, product }, { status: 201 });
  } catch (error: unknown) {
    console.error('Admin product creation error:', error);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
