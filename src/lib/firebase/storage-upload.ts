import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/lib/firebase/client';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export async function uploadCasaioImage(
  file: File,
  path: string,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file.');
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('Images must be 5 MB or smaller.');
  }

  const imageRef = ref(storage, path);
  await uploadBytes(imageRef, file, { contentType: file.type });
  return getDownloadURL(imageRef);
}

export function getSafeStorageFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-');
}
