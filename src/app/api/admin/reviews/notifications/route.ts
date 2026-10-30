import type { NextRequest } from 'next/server';
import { FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await requireServerRole(request, ['admin']);
  if (!user) return Response.json({ error: 'Admin access required.' }, { status: 403 });

  const snapshot = await adminDb.collection('reviews').limit(5000).get();
  const unreadCount = snapshot.docs.filter((review: QueryDocumentSnapshot) => !review.data().adminReadAt).length;
  return Response.json({ unreadCount });
}

export async function POST(request: NextRequest) {
  const user = await requireServerRole(request, ['admin']);
  if (!user) return Response.json({ error: 'Admin access required.' }, { status: 403 });

  const snapshot = await adminDb.collection('reviews').limit(5000).get();
  const unreadReviews = snapshot.docs.filter((review: QueryDocumentSnapshot) => !review.data().adminReadAt);
  for (let index = 0; index < unreadReviews.length; index += 450) {
    const batch = adminDb.batch();
    unreadReviews.slice(index, index + 450).forEach((review: QueryDocumentSnapshot) => {
      batch.update(review.ref, { adminReadAt: FieldValue.serverTimestamp() });
    });
    await batch.commit();
  }

  return Response.json({ success: true, markedRead: unreadReviews.length });
}
