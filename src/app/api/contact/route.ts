import nodemailer from 'nodemailer';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';

const CONTACT_EMAIL = 'casaio.official@gmail.com';

export const runtime = 'nodejs';

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
};

export async function POST(request: Request) {
  let payload: ContactPayload;

  try {
    payload = await request.json() as ContactPayload;
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';

  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !message) {
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

  const smtpUser = process.env.CONTACT_EMAIL_USER;
  const smtpPassword = process.env.CONTACT_EMAIL_APP_PASSWORD;

  if (!smtpUser || !smtpPassword) {
    console.error('Contact email is not configured. Set CONTACT_EMAIL_USER and CONTACT_EMAIL_APP_PASSWORD.');
    await messageRef.update({ emailStatus: 'failed' });
    return Response.json({ error: 'Email service is not configured yet.' }, { status: 503 });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });

    await transporter.sendMail({
      from: smtpUser,
      to: CONTACT_EMAIL,
      replyTo: email,
      subject: `Casaio contact${name ? ` from ${name}` : ''}`,
      text: `Name: ${name || 'Not provided'}\nEmail: ${email}\n\nMessage:\n${message}`,
    });

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
