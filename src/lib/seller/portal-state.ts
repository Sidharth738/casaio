import type { SellerProfile } from '@/types';

export type SellerPortalAccessState =
  | 'loading'
  | 'unauthenticated'
  | 'unregistered'
  | 'pending'
  | 'rejected'
  | 'suspended'
  | 'authorized';

export interface ResolvePortalAccessOptions {
  user: { uid: string } | null;
  role?: string | null;
  sellerProfile: SellerProfile | null;
  authLoading?: boolean;
  profileLoading?: boolean;
}

/**
 * Determines whether a user may enter the active seller portal or must be
 * presented with a specific gate screen (pending review, suspended, rejected, or unregistered).
 * 
 * Critical invariants:
 * - Administrators always bypass profile gating to inspect/manage seller views.
 * - Non-admins require an explicitly `approved` seller profile.
 * - Even if a user's client token still carries a stale `role: 'seller'`, demotion or
 *   suspension in the Firestore profile immediately gates them out of the seller UI.
 */
export function resolveSellerPortalAccessState({
  user,
  role,
  sellerProfile,
  authLoading = false,
  profileLoading = false,
}: ResolvePortalAccessOptions): SellerPortalAccessState {
  if (authLoading || profileLoading) {
    return 'loading';
  }

  if (!user) {
    return 'unauthenticated';
  }

  // Admins always have access to inspect and manage the seller portal
  if (role === 'admin') {
    return 'authorized';
  }

  // If no profile exists for the user
  if (!sellerProfile) {
    return 'unregistered';
  }

  // Strict profile status check
  switch (sellerProfile.status) {
    case 'approved':
      return 'authorized';
    case 'pending':
      return 'pending';
    case 'suspended':
      return 'suspended';
    case 'rejected':
      return 'rejected';
    default:
      return 'unregistered';
  }
}
