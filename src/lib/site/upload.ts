/**
 * Image uploads for the website, through Vercel Blob when BLOB_READ_WRITE_TOKEN is set. Without it the
 * editor takes image addresses only. Only PNG, JPEG, WebP and GIF are accepted (no SVG: it can carry
 * script), checked by their first bytes as well as the declared type, up to 4 MB.
 */

export const UPLOAD_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as const;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** The image type the bytes really are, or null. */
export function sniffImage(bytes: Uint8Array): keyof typeof UPLOAD_TYPES | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  if (b.length >= 6 && String.fromCharCode(...b.slice(0, 4)) === "GIF8") return "image/gif";
  return null;
}

export function checkUpload(file: { type: string; size: number }, bytes: Uint8Array): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return "That image is larger than 4 MB. Make it smaller and try again.";
  if (!(file.type in UPLOAD_TYPES)) return "Use a PNG, JPEG, WebP or GIF image.";
  const real = sniffImage(bytes);
  if (!real || real !== file.type) return "That file isn't the image type it says it is.";
  return null;
}
