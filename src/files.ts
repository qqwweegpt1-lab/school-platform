import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { securityHeaders, type Ctx } from './http.ts';

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** يخدم ملفًا مع دعم Range (ضروري لتشغيل الفيديو) */
export function serveFile(
  ctx: Ctx,
  file: string,
  mime: string,
  opts: { cache?: string; download?: string } = {},
) {
  let st;
  try {
    st = statSync(file);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  const headers: Record<string, string | number | string[]> = {
    ...securityHeaders(),
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': opts.cache ?? 'no-store',
  };
  if (opts.download) {
    headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(opts.download)}`;
    headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
  }
  let start = 0;
  let end = st.size - 1;
  let status = 200;
  const range = ctx.req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1] || m[2])) {
      if (m[1]) {
        start = parseInt(m[1], 10);
        if (m[2]) end = Math.min(parseInt(m[2], 10), end);
      } else {
        start = Math.max(0, st.size - parseInt(m[2], 10));
      }
      if (start > end || start >= st.size) {
        ctx.res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        ctx.res.end();
        return true;
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
    }
  }
  headers['Content-Length'] = end - start + 1;
  ctx.res.writeHead(status, headers);
  if (ctx.method === 'HEAD') {
    ctx.res.end();
    return true;
  }
  createReadStream(file, { start, end }).pipe(ctx.res);
  return true;
}

export function serveStatic(ctx: Ctx, rel: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return false;
  }
  if (decoded.includes('\0') || decoded.split('/').some((p) => p.startsWith('.'))) return false;
  const full = path.resolve(config.publicDir, '.' + path.sep + decoded);
  if (!full.startsWith(config.publicDir + path.sep)) return false;
  const mime = MIME[path.extname(full).toLowerCase()];
  if (!mime) return false;
  return serveFile(ctx, full, mime, { cache: 'public, max-age=3600' });
}
