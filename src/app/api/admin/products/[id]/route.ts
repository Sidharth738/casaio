import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';
import { UpdateProductSchema } from '@/lib/validators/product';
import type { ProductStatus } from '@/types';
import { getProductDeletionBlockReason } from '@/lib/products/deletion';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    if (!await requireServerRole(req, ['admin'])) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const productRef = adminDb.collection('products').doc(id);
    const productSnap = await productRef.get();
    if (!productSnap.exists) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const parsed = UpdateProductSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid product details' }, { status: 400 });
    }

    const updates = parsed.data;
    const currentProduct = productSnap.data()!;

    if (updates.slug && updates.slug !== currentProduct.slug) {
      const duplicate = await adminDb.collection('products').where('slug', '==', updates.slug).limit(2).get();
      if (duplicate.docs.some((doc) => doc.id !== id)) {
        return NextResponse.json({ error: 'A product with this URL slug already exists' }, { status: 409 });
      }
    }

    if (updates.categoryId) {
      const categorySnap = await adminDb.collection('categories').doc(updates.categoryId).get();
      if (!categorySnap.exists || categorySnap.data()?.isActive !== true) {
        return NextResponse.json({ error: 'Choose an active category' }, { status: 400 });
      }
      updates.categorySlug = categorySnap.data()?.slug || updates.categorySlug;
    }

    await productRef.update({ ...updates, updatedAt: new Date().toISOString() });
    revalidatePath('/', 'page');
    revalidatePath('/products', 'page');
    if (currentProduct.slug) revalidatePath(`/products/${currentProduct.slug}`);
    if (updates.slug && updates.slug !== currentProduct.slug) revalidatePath(`/products/${updates.slug}`);

    return NextResponse.json({ success: true, message: 'Product updated successfully' });
  } catch (error: unknown) {
    console.error('Admin product update error:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    if (!await requireServerRole(req, ['admin'])) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const productRef = adminDb.collection('products').doc(id);
    const productSnap = await productRef.get();
    if (!productSnap.exists) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (body.isFeatured !== undefined) {
      if (typeof body.isFeatured !== 'boolean') {
        return NextResponse.json({ error: 'isFeatured must be a boolean' }, { status: 400 });
      }
      updates.isFeatured = body.isFeatured;
    }
    if (body.status !== undefined) {
      const allowedStatuses: ProductStatus[] = ['active', 'draft', 'out_of_stock', 'archived'];
      if (!allowedStatuses.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid product status' }, { status: 400 });
      }
      updates.status = body.status;
    }
    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: 'No valid product changes provided' }, { status: 400 });
    }

    await productRef.update(updates);
    const slug = productSnap.data()?.slug;
    revalidatePath('/', 'page');
    revalidatePath('/products', 'page');
    if (slug) revalidatePath(`/products/${slug}`);

    return NextResponse.json({ success: true, message: 'Product updated successfully by admin' });
  } catch (error: unknown) {
    console.error('Admin product update error:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    if (!await requireServerRole(req, ['admin'])) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const productRef = adminDb.collection('products').doc(id);
    const productSnap = await productRef.get();
    if (!productSnap.exists) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const deletionBlockReason = await getProductDeletionBlockReason(id);
    if (deletionBlockReason) {
      return NextResponse.json({ error: deletionBlockReason }, { status: 409 });
    }

    const slug = productSnap.data()?.slug;
    await productRef.delete();
    revalidatePath('/', 'page');
    revalidatePath('/products', 'page');
    if (slug) revalidatePath(`/products/${slug}`);

    return NextResponse.json({ success: true, message: 'Product permanently deleted' });
  } catch (error: unknown) {
    console.error('Admin product deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
