import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { Product } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sellerId, sellerStoreName, ...productData } = body;

    if (!sellerId) {
      return NextResponse.json(
        { error: 'Seller identification is required' },
        { status: 400 }
      );
    }

    if (!productData.title || !productData.price || !productData.categoryId) {
      return NextResponse.json(
        { error: 'Title, price, and category are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const newDocRef = adminDb.collection('products').doc();

    const newProduct: Product = {
      id: newDocRef.id,
      sellerId,
      sellerStoreName: sellerStoreName || 'Artisan Atelier',
      title: productData.title,
      slug: productData.slug || productData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: productData.description || '',
      shortDescription: productData.shortDescription || '',
      price: Number(productData.price),
      compareAtPrice: productData.compareAtPrice ? Number(productData.compareAtPrice) : undefined,
      costPerItem: productData.costPerItem ? Number(productData.costPerItem) : undefined,
      sku: productData.sku || `SKU-${Date.now().toString().slice(-6)}`,
      stock: Number(productData.stock) || 0,
      lowStockThreshold: Number(productData.lowStockThreshold) || 3,
      categoryId: productData.categoryId,
      categorySlug: productData.categorySlug || 'decor',
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
