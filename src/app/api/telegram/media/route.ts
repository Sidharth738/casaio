import { NextRequest } from 'next/server';
import { authorizeTelegramMedia } from '@/lib/security/telegram-media';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const fileId = request.nextUrl.searchParams.get('fileId');
  if (!token || !fileId) return new Response('Media unavailable', { status: 404 });
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(fileId)) return new Response('Media unavailable', { status: 404 });

  try {
    const access = await authorizeTelegramMedia(request, fileId);
    if (!access.authorized) return new Response('Media unavailable', { status: 404 });

    const fileResponse = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, { signal: AbortSignal.timeout(10_000) });
  const fileResult = await fileResponse.json();
  const filePath = fileResult.result?.file_path;
  if (!fileResponse.ok || !fileResult.ok || !filePath) return new Response('Media unavailable', { status: 404 });

    const mediaResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, { signal: AbortSignal.timeout(20_000) });
  if (!mediaResponse.ok || !mediaResponse.body) return new Response('Media unavailable', { status: 404 });
  return new Response(mediaResponse.body, {
      headers: { 'Content-Type': mediaResponse.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return new Response('Media unavailable', { status: 404 });
  }
}
