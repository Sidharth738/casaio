import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const fileId = request.nextUrl.searchParams.get('fileId');
  if (!token || !fileId) return new Response('Media unavailable', { status: 404 });

  const fileResponse = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const fileResult = await fileResponse.json();
  const filePath = fileResult.result?.file_path;
  if (!fileResponse.ok || !fileResult.ok || !filePath) return new Response('Media unavailable', { status: 404 });

  const mediaResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!mediaResponse.ok || !mediaResponse.body) return new Response('Media unavailable', { status: 404 });
  return new Response(mediaResponse.body, {
    headers: { 'Content-Type': mediaResponse.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
