import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!await requireServerRole(req, ['admin'])) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    const { id } = await params;
    const body = await req.json();

    const productRef = adminDb.collection('products').doc(id);
    const snap = await productRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.isFeatured !== undefined) {
      updates.isFeatured = Boolean(body.isFeatured);
    }
    if (body.status !== undefined) {
      updates.status = body.status;
    }

    await productRef.update(updates);

    return NextResponse.json({
      success: true,
      message: 'Product updated successfully by admin',
    });
  } catch (error: unknown) {
    console.error('Admin product update error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update product';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
