import 'server-only';

import { FieldValue, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { UserRole } from '@/types';

type RelatedUpdate = {
  ref: DocumentReference;
  buildUpdates: (current: Record<string, unknown>) => Record<string, unknown>;
};

type UpdateUserRoleOptions = {
  actorUid: string;
  targetUid: string;
  newRole?: UserRole;
  profileUpdates?: Record<string, unknown>;
  relatedUpdates?: RelatedUpdate[];
  touchUnchangedRole?: boolean;
  updatedAt?: string;
};

export async function updateUserRoleWithAudit({
  actorUid,
  targetUid,
  newRole,
  profileUpdates = {},
  relatedUpdates = [],
  touchUnchangedRole = true,
  updatedAt,
}: UpdateUserRoleOptions) {
  const userRef = adminDb.collection('users').doc(targetUid);
  const auditRef = adminDb.collection('roleChangeAudit').doc();
  const transactionTimestamp = updatedAt ?? new Date().toISOString();

  return adminDb.runTransaction(async (transaction: Transaction) => {
    const [userSnapshot, ...relatedSnapshots] = await Promise.all([
      transaction.get(userRef),
      ...relatedUpdates.map(({ ref }) => transaction.get(ref)),
    ]);
    if (!userSnapshot.exists) return { found: false as const, changed: false as const };
    if (relatedSnapshots.some((snapshot) => !snapshot.exists)) {
      return { found: false as const, changed: false as const };
    }

    const userData = (userSnapshot.data() || {}) as Record<string, unknown>;
    const previousRole = typeof userData.role === 'string' ? userData.role : null;
    const roleChanged = newRole !== undefined && previousRole !== newRole;
    const shouldUpdateProfile = roleChanged || Object.keys(profileUpdates).length > 0 ||
      (newRole !== undefined && touchUnchangedRole);

    if (shouldUpdateProfile) {
      transaction.update(userRef, {
        ...profileUpdates,
        ...(newRole !== undefined ? { role: newRole } : {}),
        updatedAt: transactionTimestamp,
      });
    }

    if (roleChanged && newRole !== undefined) {
      transaction.create(auditRef, {
        actorUid,
        targetUid,
        previousRole,
        newRole,
        timestamp: FieldValue.serverTimestamp(),
      });
    }

    for (let index = 0; index < relatedUpdates.length; index++) {
      const { ref, buildUpdates } = relatedUpdates[index];
      const relatedData = (relatedSnapshots[index].data() || {}) as Record<string, unknown>;
      transaction.update(ref, buildUpdates(relatedData));
    }

    return { found: true as const, changed: roleChanged };
  });
}

export async function syncUserRoleClaim(
  targetUid: string,
  role: UserRole,
  existingClaims?: Record<string, unknown>,
) {
  const claims = existingClaims ?? (await adminAuth.getUser(targetUid)).customClaims;
  await adminAuth.setCustomUserClaims(targetUid, { ...claims, role });
}

export function getRoleUpdateErrorCode(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[a-zA-Z0-9_/-]{1,80}$/.test(code) ? code : undefined;
}

export function logRoleUpdateFailure(operation: string, error: unknown) {
  console.error(operation, { code: getRoleUpdateErrorCode(error) });
}
