import { get, put } from '@vercel/blob';
import { buildImageProxyUrl, isAllowedImagePathname } from './imageUrls';

function getBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }
  return token;
}

export interface UploadedBlobImage {
  pathname: string;
  url: string;
}

export async function uploadImageToBlob(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<UploadedBlobImage> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const blob = await put(`benz-tech/${Date.now()}-${safeName}`, buffer, {
    access: 'private',
    contentType,
    token: getBlobToken(),
    addRandomSuffix: false,
  });

  return {
    pathname: blob.pathname,
    url: buildImageProxyUrl(blob.pathname),
  };
}

export async function fetchPrivateBlobAsDataUrl(pathname: string): Promise<string> {
  if (!isAllowedImagePathname(pathname)) {
    throw new Error('Invalid image pathname');
  }

  const result = await get(pathname, { access: 'private', token: getBlobToken() });
  if (!result) {
    throw new Error('Image not found in blob storage');
  }
  const bytes = await new Response(result.stream).arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');
  const contentType = result.blob.contentType || 'image/png';
  return `data:${contentType};base64,${base64}`;
}

export async function streamPrivateBlob(pathname: string) {
  if (!isAllowedImagePathname(pathname)) {
    return null;
  }

  const result = await get(pathname, { access: 'private', token: getBlobToken() });
  return result;
}