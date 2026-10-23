import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import type { UserRole, UserStatus } from '@/types';
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
    const { role, status } = body as {
      role?: UserRole;
      status?: UserStatus;
    };

    if (!role && !status) {
      return NextResponse.json(
        { error: 'At least one of role or status must be provided' },
        { status: 400 }
      );
    }
    if (role && !['customer', 'seller', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid user role' }, { status: 400 });
    }
    if (status && !['active', 'suspended'].includes(status)) {
      return NextResponse.json({ error: 'Invalid user status' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (role) updates.role = role;
    if (status) updates.status = status;

    const result = await updateUserRoleWithAudit({
      actorUid: actor.uid,
      targetUid: id,
      newRole: role,
      profileUpdates: status ? { status } : {},
      updatedAt: now,
    });
    if (!result.found) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let authSyncFailed = false;
    const recordAuthSyncFailure = (operation: string, error: unknown) => {
      authSyncFailed = true;
      logRoleUpdateFailure(operation, error);
    };

    if (role) {
      try {
        await syncUserRoleClaim(id, role);
      } catch (error: unknown) {
        recordAuthSyncFailure('Admin user role claim synchronization failed', error);
      }
    }
    if (status) {
      try {
        await adminAuth.updateUser(id, { disabled: status === 'suspended' });
      } catch (error: unknown) {
        recordAuthSyncFailure('Admin user disabled-state synchronization failed', error);
      }
      if (status === 'suspended') {
        try {
          await adminAuth.revokeRefreshTokens(id);
        } catch (error: unknown) {
          recordAuthSyncFailure('Admin user token revocation failed', error);
        }
      }
    }

    if (authSyncFailed) {
      return NextResponse.json(
        { error: 'User profile was updated; authentication settings require retry' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
      updates,
    });
  } catch (error: unknown) {
    logRoleUpdateFailure('Admin user update failed', error);
    return NextResponse.json({ error: 'Unable to update user' }, { status: 500 });
  }
}
