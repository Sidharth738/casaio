import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';

export async function GET(req: NextRequest) {
  const user = await requireServerRole(req, ['admin']);
  if (!user) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const snapshot = await adminDb.collection('orders').count().get();
    return NextResponse.json({ count: snapshot.data().count });
  } catch (error) {
    console.error('Admin order count error:', error);
    return NextResponse.json({ error: 'Could not load order count' }, { status: 500 });
  }
}
