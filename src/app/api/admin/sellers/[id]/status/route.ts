import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { SellerStatus } from '@/types';
import { requireServerRole } from '@/lib/firebase/server-auth';
import {
  logRoleUpdateFailure,
  syncUserRoleClaim,
  updateUserRoleWithAudit,
} from '@/lib/auth/role-update';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireServerRole(req, ['admin']);
    if (!actor) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const { status, statusReason } = body as {
      status: SellerStatus;
      statusReason?: string;
    };

    if (!status || !['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
      return NextResponse.json({ error: 'Valid seller status is required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const sellerRef = adminDb.collection('sellers').doc(id);
    const nextRole = status === 'approved' ? 'seller' : 'customer';
    const result = await updateUserRoleWithAudit({
      actorUid: actor.uid,
      targetUid: id,
      newRole: nextRole,
      updatedAt: now,
      relatedUpdates: [{
        ref: sellerRef,
        buildUpdates: (sellerData) => ({
          status,
          statusReason: statusReason || null,
          updatedAt: now,
          ...(status === 'approved' && sellerData.status !== 'approved' ? {
            commissionRatePercent: 10,
            metrics: {
              totalSalesAmount: 0,
              totalOrdersCount: 0,
              ratingAverage: 5,
              ratingCount: 0,
            },
          } : {}),
        }),
      }],
    });
    if (!result.found) {
      return NextResponse.json({ error: 'Seller application or user profile not found' }, { status: 404 });
    }

    let authSyncFailed = false;
    const recordAuthSyncFailure = (operation: string, error: unknown) => {
      authSyncFailed = true;
      logRoleUpdateFailure(operation, error);
    };

    try {
      await syncUserRoleClaim(id, nextRole);
    } catch (error: unknown) {
      recordAuthSyncFailure('Seller role claim synchronization failed', error);
    }
    if (status !== 'approved') {
      try {
        await adminAuth.revokeRefreshTokens(id);
      } catch (error: unknown) {
        recordAuthSyncFailure('Seller refresh-token revocation failed', error);
      }
    }

    try {
      const title = status === 'approved'
        ? 'Seller Application Approved!'
        : status === 'rejected'
          ? 'Seller Application Not Approved'
          : status === 'suspended'
            ? 'Seller Account Suspended'
            : 'Seller Application Status Updated';
      const message = status === 'approved'
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
    } catch (error: unknown) {
      logRoleUpdateFailure('Seller status notification dispatch failed', error);
    }

    if (authSyncFailed) {
      return NextResponse.json(
        { error: 'Seller status was updated; authentication settings require retry' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Seller status updated to "${status}"`,
      status,
    });
  } catch (error: unknown) {
    logRoleUpdateFailure('Admin seller status update failed', error);
    return NextResponse.json({ error: 'Unable to update seller status' }, { status: 500 });
  }
}
