import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole, type ServerUser } from '@/lib/firebase/server-auth';
import type { SellerProfile, SellerStatus } from '@/types';

export interface SellerPermissionCheck {
  allowed: boolean;
  reason?: string;
  status: number;
}

/**
 * Pure function: Determines whether a seller record holds active approved status.
 */
export function isSellerApproved(
  sellerData: { status?: string | SellerStatus } | null | undefined
): boolean {
  return sellerData?.status === 'approved';
}

/**
 * Pure function: Authoritatively validates whether an authenticated user is permitted
 * to perform seller actions.
 *
 * Rules:
 * - Admin users bypass seller status checks, preserving platform administrative control.
 * - Non-admin users must possess the 'seller' role AND have an authoritative
 *   'approved' status in their seller profile document.
 * - Stale session roles with pending, suspended, or rejected status are denied immediately.
 */
export function checkSellerOperationPermission(
  user: { uid: string; role: string } | null | undefined,
  sellerData: { status?: string | SellerStatus } | null | undefined
): SellerPermissionCheck {
  if (!user) {
    return {
      allowed: false,
      reason: 'Authentication required',
      status: 401,
    };
  }

  // Admins always retain full authority
  if (user.role === 'admin') {
    return { allowed: true, status: 200 };
  }

  if (user.role !== 'seller') {
    return {
      allowed: false,
      reason: 'Seller access required',
      status: 403,
    };
  }

  if (!sellerData) {
    return {
      allowed: false,
      reason: 'Seller profile not found. Please submit a seller application.',
      status: 403,
    };
  }

  if (sellerData.status !== 'approved') {
    let reason = 'An approved seller account is required.';
    if (sellerData.status === 'pending') {
      reason = 'Your seller application is currently pending admin review.';
    } else if (sellerData.status === 'suspended') {
      reason = 'Your seller privileges have been suspended. Please contact concierge support.';
    } else if (sellerData.status === 'rejected') {
      reason = 'Your seller application was not approved.';
    }

    return {
      allowed: false,
      reason,
      status: 403,
    };
  }

  return { allowed: true, status: 200 };
}

/**
 * Server endpoint middleware: Verifies that the request comes from an authenticated
 * user with an authoritative 'approved' seller status (or an administrator).
 */
export async function requireApprovedSeller(
  req: NextRequest
): Promise<
  | { user: ServerUser; seller?: SellerProfile }
  | NextResponse
> {
  const user = await requireServerRole(req, ['seller', 'admin']);
  if (!user) {
    return NextResponse.json({ error: 'Seller access required' }, { status: 403 });
  }

  if (user.role === 'admin') {
    return { user };
  }

  const sellerSnap = await adminDb.collection('sellers').doc(user.uid).get();
  const sellerData = sellerSnap.exists ? (sellerSnap.data() as SellerProfile) : null;

  const permission = checkSellerOperationPermission(user, sellerData);
  if (!permission.allowed) {
    return NextResponse.json({ error: permission.reason }, { status: permission.status });
  }

  return { user, seller: sellerData! };
}
