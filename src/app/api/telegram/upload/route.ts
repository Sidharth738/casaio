import { NextRequest, NextResponse } from 'next/server';
import { requireServerRole } from '@/lib/firebase/server-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await requireServerRole(request, ['seller', 'admin']);
    if (!user) return NextResponse.json({ error: 'Seller access required' }, { status: 403 });

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return NextResponse.json({ error: 'Telegram is not configured on the server.' }, { status: 503 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Select an image or video file.' }, { status: 400 });
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      return NextResponse.json({ error: 'Only image and video files are supported.' }, { status: 400 });
    }

    const telegramForm = new FormData();
    telegramForm.append('chat_id', chatId);
    telegramForm.append(file.type.startsWith('video/') ? 'video' : 'photo', file, file.name);
    const method = file.type.startsWith('video/') ? 'sendVideo' : 'sendPhoto';
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      body: telegramForm,
    });
    const telegram = await telegramResponse.json();
    if (!telegramResponse.ok || !telegram.ok) {
      return NextResponse.json({ error: telegram.description || 'Telegram upload failed.' }, { status: 502 });
    }

    const message = telegram.result;
    const media = file.type.startsWith('video/') ? message.video : message.photo?.at(-1);
    const fileId = media?.file_id;
    if (!fileId) return NextResponse.json({ error: 'Telegram did not return a file ID.' }, { status: 502 });

    return NextResponse.json({
      fileId,
      mediaType: file.type.startsWith('video/') ? 'video' : 'image',
      url: `/api/telegram/media?fileId=${encodeURIComponent(fileId)}`,
    });
  } catch (error) {
    console.error('Telegram media upload error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Telegram upload failed.' }, { status: 500 });
  }
}
