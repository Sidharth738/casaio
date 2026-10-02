import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { Product } from '@/types';
import { requireServerRole } from '@/lib/firebase/server-auth';
import { revalidatePath } from 'next/cache';

export async function POST(req: NextRequest) {
  try {
    const user = await requireServerRole(req, ['seller', 'admin']);
    if (!user) return NextResponse.json({ error: 'Seller access required' }, { status: 403 });
    const body = await req.json();
    const productData = body;
    const sellerId = user.uid;

    const title = typeof productData.title === 'string' ? productData.title.trim() : '';
    const slug = typeof productData.slug === 'string'
      ? productData.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : '';
    const price = Number(productData.price);
    const stock = Number(productData.stock);
    if (!title || !slug || !Number.isFinite(price) || price <= 0 || !productData.categoryId || !Array.isArray(productData.images) || productData.images.length === 0) {
      return NextResponse.json(
        { error: 'Title, a unique URL slug, valid price, category, and at least one image are required' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(stock) || stock < 0) {
      return NextResponse.json({ error: 'Stock must be a non-negative whole number' }, { status: 400 });
    }
    const categorySnap = await adminDb.collection('categories').doc(String(productData.categoryId)).get();
    if (!categorySnap.exists || categorySnap.data()?.isActive !== true) {
      return NextResponse.json({ error: 'Choose an active category' }, { status: 400 });
    }
    const duplicateSlug = await adminDb.collection('products').where('slug', '==', slug).limit(1).get();
    if (!duplicateSlug.empty) return NextResponse.json({ error: 'A product with this URL slug already exists' }, { status: 409 });

    const sellerSnap = await adminDb.collection('sellers').doc(sellerId).get();
    if (!sellerSnap.exists || (user.role === 'seller' && sellerSnap.data()?.status !== 'approved')) {
      return NextResponse.json({ error: 'An approved seller profile is required to add products' }, { status: 403 });
    }
    const sellerStoreName = sellerSnap.data()?.storeName || 'Casaio';
    const category = categorySnap.data();

    const now = new Date().toISOString();
    const newDocRef = adminDb.collection('products').doc();

    const newProduct: Product = {
      id: newDocRef.id,
      sellerId,
      sellerStoreName,
      title,
      slug,
      description: productData.description || '',
      shortDescription: productData.shortDescription || '',
      price,
      ...(Number(productData.compareAtPrice) > 0 ? { compareAtPrice: Number(productData.compareAtPrice) } : {}),
      ...(productData.costPerItem !== undefined && productData.costPerItem !== '' && Number.isFinite(Number(productData.costPerItem))
        ? { costPerItem: Number(productData.costPerItem) }
        : {}),
      sku: productData.sku || `SKU-${Date.now().toString().slice(-6)}`,
      stock,
      lowStockThreshold: Number(productData.lowStockThreshold) || 3,
      categoryId: productData.categoryId,
      categorySlug: category?.slug || 'decor',
      tags: Array.isArray(productData.tags) ? productData.tags : [],
      images: Array.isArray(productData.images) ? productData.images : [],
      hasVariants: false,
      status: productData.status || 'active',
      ratings: {
        average: 5.0,
        count: 0,
      },
      salesCount: 0,
      isFeatured: false,
      createdAt: now,
      updatedAt: now,
    };

    await newDocRef.set(newProduct);
    revalidatePath('/', 'page');
    revalidatePath(`/products/${slug}`);

    return NextResponse.json({
      success: true,
      productId: newDocRef.id,
      product: newProduct,
    });
  } catch (error: unknown) {
    console.error('Seller product creation error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create product';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
