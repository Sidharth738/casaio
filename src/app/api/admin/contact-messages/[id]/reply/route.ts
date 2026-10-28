import { FieldValue } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';
import { isValidEmail, sendContactReply } from '@/lib/email/contact-mail';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireServerRole(request, ['admin']);
  if (!user) return Response.json({ error: 'Admin access required.' }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { message?: unknown };
  const reply = typeof body.message === 'string' ? body.message.trim() : '';

  if (!reply) return Response.json({ error: 'Reply message is required.' }, { status: 400 });
  if (reply.length > 10000) return Response.json({ error: 'Reply message is too long.' }, { status: 400 });

  const messageRef = adminDb.collection('contactMessages').doc(id);
  const messageSnapshot = await messageRef.get();
  if (!messageSnapshot.exists) return Response.json({ error: 'Contact message not found.' }, { status: 404 });

  const original = messageSnapshot.data() || {};
  const recipient = typeof original.email === 'string' ? original.email : '';
  if (!isValidEmail(recipient)) {
    return Response.json({ error: 'The customer email address is invalid.' }, { status: 400 });
  }

  if (!process.env.CONTACT_EMAIL_USER || !process.env.CONTACT_EMAIL_APP_PASSWORD) {
    return Response.json({ error: 'Email service is not configured yet.' }, { status: 503 });
  }

  try {
    await sendContactReply({
      name: typeof original.name === 'string' ? original.name : '',
      email: recipient,
      originalMessage: typeof original.message === 'string' ? original.message : '',
      reply,
    });
  } catch (error) {
    console.error('Contact reply SMTP delivery failed:', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({ error: 'Gmail could not send the reply. Check the Casaio Gmail app password.' }, { status: 502 });
  }

  try {
    await messageRef.collection('replies').add({
      message: reply,
      sentBy: user.email || user.uid,
      sentAt: FieldValue.serverTimestamp(),
    });
    await messageRef.update({
      status: 'replied',
      lastRepliedAt: FieldValue.serverTimestamp(),
      lastRepliedBy: user.email || user.uid,
    });
  } catch (error) {
    console.error('Contact reply record failed:', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({ error: 'Reply was sent, but the conversation could not be saved.' }, { status: 500 });
  }

  return Response.json({ success: true });
}
