import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';
import { validateCouponDefinition } from '@/lib/coupons/definition.mjs';

export const runtime = 'nodejs';

function registryId(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export async function POST(req: NextRequest) {
  if (!await requireServerRole(req, ['admin'])) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const checked = validateCouponDefinition(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return NextResponse.json({ error: 'Active state must be true or false.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const couponRef = adminDb.collection('coupons').doc();
  const codeRef = adminDb.collection('couponCodes').doc(registryId(checked.definition.code));
  const couponsQuery = adminDb.collection('coupons');
  const activate = body.isActive !== false;

  try {
    await adminDb.runTransaction(async (transaction) => {
      // The registry serializes creation of a normalized code. The collection
      // scan also detects legacy records that predate the registry.
      const [registrySnap, existingCoupons] = await Promise.all([
        transaction.get(codeRef),
        transaction.get(couponsQuery),
      ]);
      const normalizedMatches = existingCoupons.docs.filter((snapshot) => {
        const existingCode = snapshot.data().code;
        return typeof existingCode === 'string' && existingCode.trim().toUpperCase() === checked.definition.code;
      });
      if (registrySnap.exists || normalizedMatches.length > 0) {
        throw new Error('COUPON_CODE_TAKEN');
      }

      const coupon = {
        id: couponRef.id,
        ...checked.definition,
        isActive: activate,
        usageCount: 0,
        createdAt: now,
        ...(activate ? { termsLockedAt: now } : {}),
      };
      transaction.create(codeRef, {
        code: checked.definition.code,
        couponId: couponRef.id,
        createdAt: now,
      });
      transaction.create(couponRef, coupon);
    });

    return NextResponse.json({ success: true, couponId: couponRef.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'COUPON_CODE_TAKEN') {
      return NextResponse.json({ error: 'This normalized coupon code has already been used.' }, { status: 409 });
    }
    console.error('Admin coupon creation failed:', error);
    return NextResponse.json({ error: 'Failed to create coupon.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!await requireServerRole(req, ['admin'])) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body: { id?: unknown; isActive?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (typeof body.id !== 'string' || !body.id || typeof body.isActive !== 'boolean') {
    return NextResponse.json({ error: 'Coupon ID and active state are required.' }, { status: 400 });
  }
  if (Object.keys(body).some((key) => key !== 'id' && key !== 'isActive')) {
    return NextResponse.json({ error: 'Coupon terms and accounting fields cannot be updated.' }, { status: 400 });
  }

  try {
    const couponRef = adminDb.collection('coupons').doc(body.id);
    await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(couponRef);
      if (!snapshot.exists) throw new Error('COUPON_NOT_FOUND');
      const current = snapshot.data() || {};
      const now = new Date().toISOString();
      if (body.isActive && current.isActive !== true) {
        const checked = validateCouponDefinition({ ...current, isActive: true });
        if (!checked.ok) throw new Error('COUPON_INVALID');
        if (current.termsLockedAt === undefined) {
          transaction.update(couponRef, { isActive: true, termsLockedAt: now, updatedAt: now });
          return;
        }
      }
      transaction.update(couponRef, { isActive: body.isActive, updatedAt: now });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'COUPON_NOT_FOUND') return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 });
    if (error instanceof Error && error.message === 'COUPON_INVALID') return NextResponse.json({ error: 'Coupon terms are invalid and cannot be activated.' }, { status: 400 });
    console.error('Admin coupon status update failed:', error);
    return NextResponse.json({ error: 'Failed to update coupon status.' }, { status: 500 });
  }
}
