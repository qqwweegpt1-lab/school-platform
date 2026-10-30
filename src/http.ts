import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config.ts';
import type { Safe } from './html.ts';
import type { SessionUser } from './security.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message = '') {
    super(message);
    this.status = status;
  }
}

export interface UploadedFile {
  field: string;
  filename: string;
  mime: string;
  data: Buffer;
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  method: string;
  path: string;
  ip: string;
  cookies: Record<string, string>;
  csrfCookie: string;
  setCookies: string[];
  user: SessionUser | null;
  sessionExpired: boolean;
  params: Record<string, string>;
  fields: Record<string, string>;
  files: UploadedFile[];
  /** هل جُلب ما يلزم لإنشاء رمز CSRF في هذا الطلب؟ */
  newCsrf: boolean;
}

// ───────── ملفات تعريف الارتباط ─────────
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAge?: number; expires?: Date; httpOnly?: boolean; path?: string } = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? '/'}`, 'SameSite=Lax'];
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (config.cookieSecure) parts.push('Secure');
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  return parts.join('; ');
}

// ───────── قراءة الجسم مع حد أقصى ─────────
export function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > limit) {
      reject(new HttpError(413, 'too large'));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        done = true;
        reject(new HttpError(413, 'too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('error', (e) => {
      if (!done) {
        done = true;
        reject(e);
      }
    });
  });
}

// ───────── multipart/form-data ─────────
export function parseMultipart(
  buf: Buffer,
  boundary: string,
): { fields: Record<string, string>; files: UploadedFile[] } {
  const fields: Record<string, string> = {};
  const files: UploadedFile[] = [];
  const delim = Buffer.from('--' + boundary);
  let pos = buf.indexOf(delim);
  if (pos < 0) throw new HttpError(400, 'bad multipart');
  let parts = 0;
  while (pos >= 0) {
    pos += delim.length;
    if (buf[pos] === 0x2d && buf[pos + 1] === 0x2d) break; // الجزء الختامي --
    if (buf[pos] === 0x0d && buf[pos + 1] === 0x0a) pos += 2;
    const headerEnd = buf.indexOf('\r\n\r\n', pos);
    if (headerEnd < 0) throw new HttpError(400, 'bad multipart');
    const headerText = buf.subarray(pos, headerEnd).toString('utf8');
    const next = buf.indexOf(delim, headerEnd + 4);
    if (next < 0) throw new HttpError(400, 'bad multipart');
    const data = buf.subarray(headerEnd + 4, next - 2); // نزيل CRLF قبل الفاصل
    if (++parts > 60) throw new HttpError(400, 'too many parts');

    let name = '';
    let filename: string | null = null;
    let mime = 'application/octet-stream';
    for (const line of headerText.split('\r\n')) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const h = line.slice(0, idx).trim().toLowerCase();
      const v = line.slice(idx + 1).trim();
      if (h === 'content-disposition') {
        const n = /name="([^"]*)"/.exec(v);
        const f = /filename="([^"]*)"/.exec(v);
        if (n) name = n[1];
        if (f) filename = f[1];
      } else if (h === 'content-type') {
        mime = v.toLowerCase();
      }
    }
    if (name) {
      if (filename !== null) {
        if (filename !== '' || data.length > 0) files.push({ field: name, filename, mime, data: Buffer.from(data) });
      } else {
        fields[name] = data.toString('utf8');
      }
    }
    pos = next;
  }
  return { fields, files };
}

export function parseUrlEncoded(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  const sp = new URLSearchParams(buf.toString('utf8'));
  for (const [k, v] of sp) out[k] = v;
  return out;
}

// ───────── الاستجابات ─────────
export function securityHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; media-src 'self'; " +
      "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  if (config.cookieSecure) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return h;
}

function baseHeaders(ctx: Ctx, extra: Record<string, string | string[]> = {}) {
  const headers: Record<string, string | string[]> = { ...securityHeaders(), ...extra };
  if (ctx.setCookies.length) headers['Set-Cookie'] = ctx.setCookies;
  return headers;
}

export function sendHtml(ctx: Ctx, body: Safe | string, status = 200, noStore = false) {
  const text = typeof body === 'string' ? body : body.value;
  ctx.res.writeHead(
    status,
    baseHeaders(ctx, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': noStore || ctx.user ? 'no-store' : 'private, no-cache',
    }),
  );
  ctx.res.end(text);
}

export function sendJson(ctx: Ctx, data: unknown, status = 200) {
  ctx.res.writeHead(status, baseHeaders(ctx, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }));
  ctx.res.end(JSON.stringify(data));
}

export function redirect(ctx: Ctx, location: string, status = 303) {
  ctx.res.writeHead(status, baseHeaders(ctx, { Location: location, 'Cache-Control': 'no-store' }));
  ctx.res.end();
}

export function sendBuffer(
  ctx: Ctx,
  data: Buffer,
  contentType: string,
  extra: Record<string, string> = {},
  status = 200,
) {
  ctx.res.writeHead(
    status,
    baseHeaders(ctx, { 'Content-Type': contentType, 'Content-Length': String(data.length), ...extra }),
  );
  ctx.res.end(data);
}

export function clientIp(req: IncomingMessage): string {
  if (config.trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
