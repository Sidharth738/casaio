import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { isValidEmail, sendContactNotification } from '@/lib/email/contact-mail';
import { consumeProductionRateLimit, getClientAddress } from '@/lib/security/rate-limit';
import { readBoundedBody } from '@/lib/security/bounded-body';

export const runtime = 'nodejs';

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
};

export async function POST(request: Request) {
  const body = await readBoundedBody(request, 12_000);
  if (!body) return Response.json({ error: 'Request is too large.' }, { status: 413 });
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 12_000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return Response.json({ error: 'JSON request required.' }, { status: 415 });
  }
  const rate = await consumeProductionRateLimit(`contact:${getClientAddress(request)}`, 5, 3600);
  if (!rate.available) return Response.json({ error: 'Contact service is temporarily unavailable.' }, { status: 503, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
  if (!rate.allowed) return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(rate.retryAfterSeconds) } });
  let payload: ContactPayload;

  try {
    payload = JSON.parse(new TextDecoder().decode(body)) as ContactPayload;
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';

  if (!isValidEmail(email) || !message) {
    return Response.json({ error: 'Enter a valid email address and message.' }, { status: 400 });
  }

  if (name.length > 120 || email.length > 254 || message.length > 5000) {
    return Response.json({ error: 'Your message is too long.' }, { status: 400 });
  }

  const messageRef = adminDb.collection('contactMessages').doc();
  await messageRef.set({
    name: name || 'Not provided',
    email,
    message,
    status: 'unread',
    emailStatus: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  });

  if (!process.env.CONTACT_EMAIL_USER || !process.env.CONTACT_EMAIL_APP_PASSWORD) {
    console.error('Contact email is not configured. Set CONTACT_EMAIL_USER and CONTACT_EMAIL_APP_PASSWORD.');
    await messageRef.update({ emailStatus: 'failed' });
    return Response.json({ error: 'Email service is not configured yet.' }, { status: 503 });
  }

  try {
    await sendContactNotification({ name, email, message });

    await messageRef.update({
      emailStatus: 'sent',
      emailedAt: FieldValue.serverTimestamp(),
    });

    return Response.json({ success: true });
  } catch (error) {
    await messageRef.update({ emailStatus: 'failed' }).catch(() => {});
    console.error('Contact email delivery failed:', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({ error: 'We could not send your message. Please try again.' }, { status: 502 });
  }
}
