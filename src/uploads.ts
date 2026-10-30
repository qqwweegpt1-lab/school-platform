import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import type { UploadedFile } from './http.ts';

export interface Detected {
  ext: string;
  mime: string;
  kind: 'pdf' | 'image' | 'video';
}

/** يتعرّف على النوع الفعلي من محتوى الملف (وليس من امتداده أو ترويسته) */
export function detectType(b: Buffer): Detected | null {
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf', kind: 'pdf' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg', kind: 'image' };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { ext: 'png', mime: 'image/png', kind: 'image' };
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP')
    return { ext: 'webp', mime: 'image/webp', kind: 'image' };
  if (b.length >= 12 && b.subarray(4, 8).toString('latin1') === 'ftyp') return { ext: 'mp4', mime: 'video/mp4', kind: 'video' };
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: 'webm', mime: 'video/webm', kind: 'video' };
  return null;
}

const EXT_OK: Record<string, string[]> = {
  pdf: ['pdf'],
  jpg: ['jpg', 'jpeg'],
  png: ['png'],
  webp: ['webp'],
  mp4: ['mp4', 'm4v'],
  webm: ['webm'],
};

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return (
    base
      .replace(/[\u0000-\u001F\u007F<>:"|?*‪-‮]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(-100) || 'file'
  );
}

export interface CheckedFile {
  orig: string;
  det: Detected;
  data: Buffer;
}

/** يتحقق من مرفقات الطلبات: PDF/JPG/PNG فقط وبحد أقصى للحجم */
export function checkAttachment(f: UploadedFile): { ok: CheckedFile } | { error: string } {
  const name = safeFileName(f.filename);
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (f.data.length === 0) return { error: `الملف «${name}» فارغ.` };
  if (f.data.length > config.maxAttachmentBytes)
    return { error: `حجم الملف «${name}» يتجاوز الحد الأقصى (${Math.round(config.maxAttachmentBytes / 1024 / 1024)} ميغابايت).` };
  const det = detectType(f.data);
  if (!det || !['pdf', 'jpg', 'png'].includes(det.ext)) return { error: `نوع الملف «${name}» غير مدعوم. الأنواع المسموحة: PDF وJPG وPNG.` };
  if (!EXT_OK[det.ext].includes(ext)) return { error: `امتداد الملف «${name}» لا يطابق محتواه.` };
  if (det.ext === 'pdf') {
    const head = f.data.toString('latin1');
    if (/\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(head)) return { error: `الملف «${name}» يحتوي على عناصر غير مسموحة.` };
  }
  return { ok: { orig: name, det, data: f.data } };
}

/** يتحقق من وسائط الفعاليات (صور/فيديو) المرفوعة من الإدارة */
export function checkMedia(f: UploadedFile): { ok: CheckedFile } | { error: string } {
  const name = safeFileName(f.filename);
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  const det = detectType(f.data);
  if (!det || det.kind === 'pdf') return { error: 'يُسمح بالصور (JPG/PNG/WEBP) ومقاطع الفيديو (MP4/WEBM) فقط.' };
  if (!EXT_OK[det.ext].includes(ext)) return { error: 'امتداد الملف لا يطابق محتواه.' };
  const limit = det.kind === 'video' ? config.maxVideoBytes : config.maxImageBytes;
  if (f.data.length > limit) return { error: `حجم الملف يتجاوز الحد الأقصى (${Math.round(limit / 1024 / 1024)} ميغابايت).` };
  return { ok: { orig: name, det, data: f.data } };
}

/** يحفظ الملف باسم عشوائي داخل مجلد غير عام */
export function storeFile(dir: string, file: CheckedFile): { stored: string; sha256: string } {
  const stored = `${randomUUID()}.${file.det.ext}`;
  writeFileSync(path.join(dir, stored), file.data, { flag: 'wx', mode: 0o640 });
  return { stored, sha256: createHash('sha256').update(file.data).digest('hex') };
}
