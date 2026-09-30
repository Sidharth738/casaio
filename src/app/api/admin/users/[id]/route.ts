import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import type { UserRole, UserStatus } from '@/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const userRef = adminDb.collection('users').doc(id);
    const snap = await userRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

    if (role) {
      updates.role = role;
    }
    if (status) {
      updates.status = status;
    }

    await userRef.update(updates);

    // Sync Auth claims and disabled status
    try {
      if (role) {
        await adminAuth.setCustomUserClaims(id, { role });
      }
      if (status) {
        await adminAuth.updateUser(id, { disabled: status === 'suspended' });
      }
    } catch (authErr) {
      console.warn('Failed updating Firebase Auth settings for user:', authErr);
    }

    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
      updates,
    });
  } catch (error: unknown) {
    console.error('Admin user update error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update user';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
