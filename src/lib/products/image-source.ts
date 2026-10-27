/** Hosts that Next Image is configured to optimize for product photos. */
export const PRODUCT_IMAGE_REMOTE_HOSTS = [
  'images.unsplash.com',
  'firebasestorage.googleapis.com',
] as const;

/**
 * Product records may outlive image-host configuration changes or contain URLs
 * supplied by sellers. Validate before rendering so bad records use the UI
 * fallback instead of making next/image throw during render.
 */
export function getSafeProductImageSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const source = value.trim();
  if (!source || /[\\\u0000-\u001f]/.test(source)) return null;

  // Root-relative files are served from this application and need no remote
  // image configuration. Protocol-relative URLs are deliberately excluded.
  if (source.startsWith('/') && !source.startsWith('//')) return source;

  // Telegram uploads are stored as file IDs. Keep the bot token server-side
  // and render the media through our proxy route instead of exposing it in a
  // public URL.
  if (!source.startsWith('http://') && !source.startsWith('https://')) {
    return `/api/telegram/media?fileId=${encodeURIComponent(source)}`;
  }

  try {
    const url = new URL(source);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !PRODUCT_IMAGE_REMOTE_HOSTS.includes(url.hostname as (typeof PRODUCT_IMAGE_REMOTE_HOSTS)[number])
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}
