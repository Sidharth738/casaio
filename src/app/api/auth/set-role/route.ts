import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  try {
    const { targetUid, role, bootstrapSecret } = await request.json();

    if (!targetUid || !role) {
      return NextResponse.json({ error: 'Missing targetUid or role' }, { status: 400 });
    }

    if (!['customer', 'seller', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role specified' }, { status: 400 });
    }

    // Authorization check: Either valid bootstrap secret or requester is an admin
    const authHeader = request.headers.get('Authorization');
    const secretMatches =
      bootstrapSecret &&
      bootstrapSecret === (process.env.ADMIN_BOOTSTRAP_SECRET || 'casaio_dev_secret_2026');

    let isAuthorizedAdmin = false;

    if (!secretMatches && authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = await adminAuth.verifyIdToken(token);
      if (decoded.role === 'admin') {
        isAuthorizedAdmin = true;
      }
    }

    if (!secretMatches && !isAuthorizedAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin privileges or bootstrap secret required' },
        { status: 403 }
      );
    }

    // Set Custom Claims on Firebase Authentication
    await adminAuth.setCustomUserClaims(targetUid, { role });

    // Update user document in Firestore
    const userRef = adminDb.collection('users').doc(targetUid);
    await userRef.set(
      {
        role,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      message: `Role successfully updated to ${role} for user ${targetUid}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update role';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
