import { NextRequest, NextResponse } from 'next/server';
import { requireServerRole } from '@/lib/firebase/server-auth';
import { consumeProductionRateLimit, getClientAddress } from '@/lib/security/rate-limit';
import { readBoundedBody } from '@/lib/security/bounded-body';

export const runtime = 'nodejs';
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const user = await requireServerRole(request, ['seller', 'admin']);
    if (!user) return NextResponse.json({ error: 'Seller access required' }, { status: 403 });
    const rate = await consumeProductionRateLimit(`telegram:${user.uid}:${getClientAddress(request)}`, 10, 3600);
    if (!rate.available) return NextResponse.json({ error: 'Upload service is temporarily unavailable.' }, { status: 503, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
    if (!rate.allowed) return NextResponse.json({ error: 'Upload rate limit exceeded.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > VIDEO_MAX_BYTES + 512 * 1024) return NextResponse.json({ error: 'Upload is too large.' }, { status: 413 });
    const body = await readBoundedBody(request, VIDEO_MAX_BYTES + 512 * 1024);
    if (!body) return NextResponse.json({ error: 'Upload is too large.' }, { status: 413 });

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return NextResponse.json({ error: 'Telegram is not configured on the server.' }, { status: 503 });

    const boundedHeaders = new Headers(request.headers);
    boundedHeaders.delete('content-length');
    const boundedRequest = new Request(request.url, { method: 'POST', headers: boundedHeaders, body: Buffer.from(body) });
    const form = await boundedRequest.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Select an image or video file.' }, { status: 400 });
    const isImage = /^image\/(jpeg|png|gif|webp)$/.test(file.type);
    const isVideo = /^video\/(mp4|webm|quicktime)$/.test(file.type);
    if (!isImage && !isVideo) {
      return NextResponse.json({ error: 'Only image and video files are supported.' }, { status: 400 });
    }
    if (file.size > (isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES)) return NextResponse.json({ error: 'File exceeds the allowed size.' }, { status: 413 });
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const validSignature = isImage
      ? (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) || (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) || (String.fromCharCode(...bytes.slice(0, 4)) === 'GIF8') || (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP')
      : (String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp' || String.fromCharCode(...bytes.slice(0, 4)) === '\u001aE\u00df\u00a3');
    if (!validSignature) return NextResponse.json({ error: 'File content does not match its declared type.' }, { status: 400 });

    const telegramForm = new FormData();
    telegramForm.append('chat_id', chatId);
    telegramForm.append(isVideo ? 'video' : 'photo', file, file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120));
    const method = isVideo ? 'sendVideo' : 'sendPhoto';
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      body: telegramForm,
      signal: AbortSignal.timeout(20_000),
    });
    const telegram = await telegramResponse.json();
    if (!telegramResponse.ok || !telegram.ok) {
      return NextResponse.json({ error: telegram.description || 'Telegram upload failed.' }, { status: 502 });
    }

    const message = telegram.result;
    const media = isVideo ? message.video : message.photo?.at(-1);
    const fileId = media?.file_id;
    if (!fileId) return NextResponse.json({ error: 'Telegram did not return a file ID.' }, { status: 502 });

    return NextResponse.json({
      fileId,
      mediaType: isVideo ? 'video' : 'image',
      url: `/api/telegram/media?fileId=${encodeURIComponent(fileId)}`,
    });
  } catch (error) {
    console.error('Telegram media upload error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Telegram upload failed.' }, { status: 500 });
  }
}
