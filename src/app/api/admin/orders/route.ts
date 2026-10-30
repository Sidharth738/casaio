import { NextRequest, NextResponse } from 'next/server';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';

function timestampValue(value: unknown): number {
  if (typeof value === 'string' || value instanceof Date) return new Date(value).getTime() || 0;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  return 0;
}

export async function GET(req: NextRequest) {
  const user = await requireServerRole(req, ['admin']);
  if (!user) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const [snapshot, aggregate] = await Promise.all([
      adminDb.collection('orders').get(),
      adminDb.collection('orders').count().get(),
    ]);
    const orders = snapshot.docs
      .map((orderDoc: QueryDocumentSnapshot) => {
        const data = orderDoc.data();
        const createdAt = data.createdAt;
        return {
          ...data,
          id: orderDoc.id,
          ...(createdAt && typeof createdAt === 'object' && 'toDate' in createdAt && typeof createdAt.toDate === 'function'
            ? { createdAt: createdAt.toDate().toISOString() }
            : {}),
        };
      })
      .sort((a: { createdAt?: unknown }, b: { createdAt?: unknown }) => timestampValue(b.createdAt) - timestampValue(a.createdAt));

    return NextResponse.json({ orders, count: aggregate.data().count });
  } catch (error) {
    console.error('Admin orders read error:', error);
    return NextResponse.json({ error: 'Could not load orders' }, { status: 500 });
  }
}
