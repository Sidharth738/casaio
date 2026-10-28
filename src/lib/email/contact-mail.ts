import nodemailer from 'nodemailer';

export const CONTACT_EMAIL = 'casaio.official@gmail.com';

export function isValidEmail(value: string) {
  return value.length <= 254 && !/[\r\n]/.test(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function createTransporter() {
  const user = process.env.CONTACT_EMAIL_USER;
  const password = process.env.CONTACT_EMAIL_APP_PASSWORD;
  if (!user || !password) throw new Error('Contact email is not configured.');

  return {
    user,
    transporter: nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass: password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    }),
  };
}

export async function sendContactNotification({ name, email, message }: { name: string; email: string; message: string }) {
  const { user, transporter } = createTransporter();
  await transporter.sendMail({
    from: `Casaio Support <${user}>`,
    to: CONTACT_EMAIL,
    replyTo: email,
    subject: `Casaio customer inquiry${name ? ` from ${name}` : ''}`,
    text: `Hello Casaio Support,\n\nA customer sent a message through the Casaio website.\n\nName: ${name || 'Not provided'}\nCustomer email: ${email}\n\nMessage:\n${message}\n`,
    html: `<p>Hello Casaio Support,</p><p>A customer sent a message through the Casaio website.</p><p><strong>Name:</strong> ${escapeHtml(name || 'Not provided')}<br><strong>Customer email:</strong> ${escapeHtml(email)}</p><p><strong>Message:</strong></p><p>${escapeHtml(message).replaceAll('\n', '<br>')}</p>`,
  });
}

export async function sendContactReply({ name, email, originalMessage, reply }: { name: string; email: string; originalMessage: string; reply: string }) {
  const { user, transporter } = createTransporter();
  const subject = 'Re: Casaio customer inquiry';
  await transporter.sendMail({
    from: `Casaio Support <${user}>`,
    to: email,
    replyTo: user,
    subject,
    text: `Hi ${name || 'there'},\n\n${reply}\n\n--- Original message ---\n${originalMessage}\n`,
    html: `<p>Hi ${escapeHtml(name || 'there')},</p><p>${escapeHtml(reply).replaceAll('\n', '<br>')}</p><hr><p><strong>Original message</strong></p><blockquote>${escapeHtml(originalMessage).replaceAll('\n', '<br>')}</blockquote>`,
  });
}
