import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';
import {
  getRoleUpdateErrorCode,
  logRoleUpdateFailure,
  syncUserRoleClaim,
  updateUserRoleWithAudit,
} from '@/lib/auth/role-update';
import type { UserRole } from '@/types';

const USER_ROLES: readonly UserRole[] = ['customer', 'seller', 'admin'];

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireServerRole(request, ['admin']);
    if (!actor) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { targetUid, role } = body as Record<string, unknown>;
    const hasUnexpectedFields = Object.keys(body).some((key) => key !== 'targetUid' && key !== 'role');
    if (hasUnexpectedFields || typeof targetUid !== 'string' || targetUid.length < 1 ||
        targetUid.length > 128 || targetUid.trim() !== targetUid || targetUid.includes('/') || !isUserRole(role)) {
      return NextResponse.json({ error: 'Invalid target UID or role' }, { status: 400 });
    }

    // Confirm the Auth account exists before committing the profile and audit.
    const authUser = await adminAuth.getUser(targetUid);
    const result = await updateUserRoleWithAudit({
      actorUid: actor.uid,
      targetUid,
      newRole: role,
      touchUnchangedRole: false,
    });
    if (!result.found) return NextResponse.json({ error: 'Target user not found' }, { status: 404 });

    try {
      await syncUserRoleClaim(targetUid, role, authUser.customClaims);
    } catch (error: unknown) {
      logRoleUpdateFailure('Role profile updated but custom claims synchronization failed', error);
      return NextResponse.json({ error: 'Role updated; authentication settings require retry' }, { status: 503 });
    }

    return NextResponse.json({ success: true, message: 'User role updated successfully' });
  } catch (error: unknown) {
    if (getRoleUpdateErrorCode(error) === 'auth/user-not-found') {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }
    logRoleUpdateFailure('Role update failed', error);
    return NextResponse.json({ error: 'Unable to update user role' }, { status: 500 });
  }
}
