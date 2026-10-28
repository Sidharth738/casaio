import type { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await requireServerRole(request, ['admin']);
  if (!user) return Response.json({ error: 'Admin access required.' }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { status?: unknown };
  if (body.status !== 'read' && body.status !== 'unread' && body.status !== 'replied') {
    return Response.json({ error: 'Invalid message status.' }, { status: 400 });
  }

  await adminDb.collection('contactMessages').doc(id).update({
    status: body.status,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await requireServerRole(request, ['admin']);
  if (!user) return Response.json({ error: 'Admin access required.' }, { status: 403 });

  const { id } = await context.params;
  await adminDb.collection('contactMessages').doc(id).delete();
  return Response.json({ success: true });
}
