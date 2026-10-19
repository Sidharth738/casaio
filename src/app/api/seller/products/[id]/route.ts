import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';
import { getProductDeletionBlockReason } from '@/lib/products/deletion';
import { revalidatePath } from 'next/cache';
import { processSellerProductUpdate } from '@/lib/products/seller-update';
import { FieldValue } from 'firebase-admin/firestore';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireServerRole(req, ['seller', 'admin']);
    if (!user) return NextResponse.json({ error: 'Seller access required' }, { status: 403 });
    const { id } = await params;
    const body: unknown = await req.json();

    if (user.role !== 'admin') {
      const sellerSnap = await adminDb.collection('sellers').doc(user.uid).get();
      if (!sellerSnap.exists || sellerSnap.data()?.status !== 'approved') {
        return NextResponse.json({ error: 'An approved seller profile is required' }, { status: 403 });
      }

      const result = await processSellerProductUpdate(
        { ...user, sellerStatus: sellerSnap.data()?.status },
        id,
        body,
        {
        getProduct: async (productId) => {
          const snapshot = await adminDb.collection('products').doc(productId).get();
          return snapshot.exists ? snapshot.data() ?? null : null;
        },
        getCategory: async (categoryId) => {
          const snapshot = await adminDb.collection('categories').doc(categoryId).get();
          if (!snapshot.exists) return null;
          const category = snapshot.data();
          return category ? { slug: category.slug, isActive: category.isActive } : null;
        },
        findProductIdsBySlug: async (slug) => {
          const snapshot = await adminDb.collection('products').where('slug', '==', slug).get();
          return snapshot.docs.map((product) => product.id);
        },
        updateProduct: async (productId, updates) => {
          const { costPerItem, ...publicUpdates } = updates;
          const batch = adminDb.batch();
          batch.update(adminDb.collection('products').doc(productId), {
            ...publicUpdates,
            ...(costPerItem !== undefined ? { costPerItem: FieldValue.delete() } : {}),
          });
          if (costPerItem !== undefined) {
            batch.set(adminDb.collection('productPrivate').doc(productId), { costPerItem }, { merge: true });
          }
          await batch.commit();
        },
      });
      return NextResponse.json(result.body, { status: result.status });
    }

    const docRef = adminDb.collection('products').doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    const currentData = snap.data();
    if (user.role !== 'admin' && currentData?.sellerId !== user.uid) {
      return NextResponse.json(
        { error: 'Unauthorized: you do not own this product' },
        { status: 403 }
      );
    }

    // Admins retain the existing privileged update path.
    const updates = { ...(body as Record<string, unknown>) };
    delete updates.sellerId;

    const now = new Date().toISOString();
    const { costPerItem, ...publicUpdates } = updates;
    const sanitizedUpdates = {
      ...publicUpdates,
      ...(costPerItem !== undefined ? { costPerItem: FieldValue.delete() } : {}),
      ...(publicUpdates.price !== undefined ? { price: Number(publicUpdates.price) } : {}),
      ...(publicUpdates.stock !== undefined ? { stock: Number(publicUpdates.stock) } : {}),
      updatedAt: now,
    };

    const productBatch = adminDb.batch();
    productBatch.update(docRef, sanitizedUpdates);
    if (costPerItem !== undefined) {
      productBatch.set(adminDb.collection('productPrivate').doc(id), { costPerItem }, { merge: true });
    }
    await productBatch.commit();

    return NextResponse.json({
      success: true,
      message: 'Product updated successfully',
    });
  } catch (error: unknown) {
    console.error('Seller product update error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update product';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireServerRole(req, ['seller', 'admin']);
    if (!user) return NextResponse.json({ error: 'Seller access required' }, { status: 403 });
    const { id } = await params;

    const docRef = adminDb.collection('products').doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    const currentData = snap.data();
    if (user.role !== 'admin') {
      const sellerSnap = await adminDb.collection('sellers').doc(user.uid).get();
      if (!sellerSnap.exists || sellerSnap.data()?.status !== 'approved') {
        return NextResponse.json({ error: 'An approved seller profile is required' }, { status: 403 });
      }

      if (currentData?.sellerId !== user.uid) {
        return NextResponse.json(
          { error: 'Unauthorized: you do not own this product' },
          { status: 403 }
        );
      }
    }

    const deletionBlockReason = await getProductDeletionBlockReason(id);
    if (deletionBlockReason) {
      return NextResponse.json({ error: deletionBlockReason }, { status: 409 });
    }

    const productBatch = adminDb.batch();
    productBatch.delete(docRef);
    productBatch.delete(adminDb.collection('productPrivate').doc(id));
    await productBatch.commit();
    revalidatePath('/', 'page');
    revalidatePath('/products', 'page');
    if (currentData?.slug) revalidatePath(`/products/${currentData.slug}`);

    return NextResponse.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error: unknown) {
    console.error('Seller product deletion error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete product';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
