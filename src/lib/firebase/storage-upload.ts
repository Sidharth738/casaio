import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/lib/firebase/client';

export async function uploadCasaioImage(
  file: File,
  path: string,
): Promise<string> {
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    throw new Error('Please select an image or video file.');
  }

  const imageRef = ref(storage, path);
  await uploadBytes(imageRef, file, { contentType: file.type });
  return getDownloadURL(imageRef);
}

export function getSafeStorageFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-');
}
