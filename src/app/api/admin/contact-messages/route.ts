import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';

export const runtime = 'nodejs';

function serializeTimestamp(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return value ?? null;
}

export async function GET(request: NextRequest) {
  const user = await requireServerRole(request, ['admin']);
  if (!user) return Response.json({ error: 'Admin access required.' }, { status: 403 });

  if (request.nextUrl.searchParams.get('summary') === 'true') {
    const unreadSnapshot = await adminDb
      .collection('contactMessages')
      .where('status', '==', 'unread')
      .count()
      .get();
    return Response.json({ unreadCount: unreadSnapshot.data().count });
  }

  const snapshot = await adminDb.collection('contactMessages').orderBy('createdAt', 'desc').limit(100).get();
  const messages = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || 'Not provided',
      email: data.email || '',
      message: data.message || '',
      status: data.status || 'unread',
      emailStatus: data.emailStatus || 'unknown',
      createdAt: serializeTimestamp(data.createdAt),
      emailedAt: serializeTimestamp(data.emailedAt),
    };
  });

  return Response.json({ messages });
}
