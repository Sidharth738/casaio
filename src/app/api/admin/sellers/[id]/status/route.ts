import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import type { SellerStatus } from '@/types';
import { requireServerRole } from '@/lib/firebase/server-auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!await requireServerRole(req, ['admin'])) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    const { id } = await params;
    const body = await req.json();
    const { status, statusReason } = body as {
      status: SellerStatus;
      statusReason?: string;
    };

    if (!status || !['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
      return NextResponse.json(
        { error: 'Valid seller status is required' },
        { status: 400 }
      );
    }

    const sellerRef = adminDb.collection('sellers').doc(id);
    const snap = await sellerRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Seller application not found' }, { status: 404 });
    }

    const now = new Date().toISOString();

    // 1. Update the seller document
    await sellerRef.update({
      status,
      statusReason: statusReason || null,
      updatedAt: now,
    });

    // 2. If approved, promote user role in both Firestore and Firebase Auth Custom Claims
    const userRef = adminDb.collection('users').doc(id);
    if (status === 'approved') {
      await userRef.update({
        role: 'seller',
        updatedAt: now,
      });

      try {
        await adminAuth.setCustomUserClaims(id, { role: 'seller' });
      } catch (authErr) {
        console.warn('Failed setting custom claim for seller, continuing with doc role:', authErr);
      }
    } else if (status === 'suspended' || status === 'rejected') {
      // Revert role back to customer if rejected or suspended
      await userRef.update({
        role: 'customer',
        updatedAt: now,
      });

      try {
        await adminAuth.setCustomUserClaims(id, { role: 'customer' });
      } catch (authErr) {
        console.warn('Failed reverting custom claim for seller:', authErr);
      }
    }

    // Dispatch in-app notification to the seller user
    try {
      const title =
        status === 'approved'
          ? 'Seller Application Approved!'
          : status === 'rejected'
          ? 'Seller Application Not Approved'
          : status === 'suspended'
          ? 'Seller Account Suspended'
          : 'Seller Application Status Updated';

      const message =
        status === 'approved'
          ? 'Congratulations! Your workshop has been approved. You now have access to your Seller Portal.'
          : status === 'rejected'
          ? `Your seller application could not be approved at this time.${statusReason ? ` Reason: ${statusReason}` : ''}`
          : `Your seller account status has been updated to "${status}".`;

      const link = status === 'approved' ? '/seller/dashboard' : '/account/profile';

      await adminDb.collection('notifications').add({
        userId: id,
        title,
        message,
        type: 'seller_application',
        link,
        read: false,
        createdAt: now,
      });
    } catch (notifErr) {
      console.warn('Failed dispatching seller status notification:', notifErr);
    }

    return NextResponse.json({
      success: true,
      message: `Seller status updated to "${status}"`,
      status,
    });
  } catch (error: unknown) {
    console.error('Admin seller status update error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update seller status';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
