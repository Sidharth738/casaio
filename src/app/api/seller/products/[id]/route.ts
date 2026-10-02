import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireServerRole(req, ['seller', 'admin']);
    if (!user) return NextResponse.json({ error: 'Seller access required' }, { status: 403 });
    const { id } = await params;
    const body = await req.json();
    const updates = { ...body };
    delete updates.sellerId;

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

    const now = new Date().toISOString();
    const sanitizedUpdates = {
      ...updates,
      price: updates.price !== undefined ? Number(updates.price) : currentData?.price,
      stock: updates.stock !== undefined ? Number(updates.stock) : currentData?.stock,
      updatedAt: now,
    };

    await docRef.update(sanitizedUpdates);

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
    if (user.role !== 'admin' && currentData?.sellerId !== user.uid) {
      return NextResponse.json(
        { error: 'Unauthorized: you do not own this product' },
        { status: 403 }
      );
    }

    await docRef.delete();

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
