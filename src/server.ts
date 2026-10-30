import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { config } from './config.ts';
import { db } from './db.ts';
import { serveStatic } from './files.ts';
import { html } from './html.ts';
import {
  clientIp,
  HttpError,
  parseCookies,
  parseMultipart,
  parseUrlEncoded,
  readBody,
  sendBuffer,
  sendHtml,
  serializeCookie,
  type Ctx,
} from './http.ts';
import { adminRoutes } from './admin/routes.ts';
import { notFound, publicRoutes, serverError } from './pages/public.ts';
import { Router } from './router.ts';
import { csrfValid, lookupSession, newCsrfCookie, purgeExpiredSessions } from './security.ts';
import { alertBox, layout, pageHero } from './ui.ts';

export function buildServer() {
  db(); // يطبّق الترحيلات عند أول تشغيل
  purgeExpiredSessions();

  const router = new Router();
  router.add(publicRoutes);
  router.add(adminRoutes);

  function simplePage(ctx: Ctx, status: number, title: string, msg: string) {
    sendHtml(
      ctx,
      layout({
        ctx,
        title,
        body: html`${pageHero(title, msg, 'alert')}<div class="container content narrow"><div class="card">${alertBox('err', msg)}<a class="btn btn-primary" href="/">العودة إلى الرئيسية</a></div></div>`,
      }),
      status,
      true,
    );
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const cookies = parseCookies(req.headers.cookie);
    const ctx: Ctx = {
      req,
      res,
      url,
      method: req.method ?? 'GET',
      path: url.pathname,
      ip: clientIp(req),
      cookies,
      csrfCookie: cookies.csrf ?? '',
      setCookies: [],
      user: null,
      sessionExpired: false,
      params: {},
      fields: {},
      files: [],
      newCsrf: false,
    };

    try {
      if (!ctx.csrfCookie) {
        ctx.csrfCookie = newCsrfCookie();
        ctx.setCookies.push(serializeCookie('csrf', ctx.csrfCookie, { maxAge: 7 * 86400 }));
      }

      if (ctx.path === '/healthz') {
        return sendBuffer(ctx, Buffer.from('ok'), 'text/plain; charset=utf-8', { 'Cache-Control': 'no-store' });
      }
      if (ctx.path.startsWith('/static/')) {
        if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return simplePage(ctx, 405, 'طريقة غير مسموحة', 'الطلب غير مسموح.');
        if (!serveStatic(ctx, ctx.path.slice('/static/'.length))) notFound(ctx);
        return;
      }

      const sess = lookupSession(cookies.sid);
      if (sess && 'user' in sess) ctx.user = sess.user;
      else if (sess && 'expired' in sess) {
        ctx.sessionExpired = true;
        ctx.setCookies.push(serializeCookie('sid', '', { maxAge: 0 }));
      }

      const m = router.match(ctx.method, ctx.path);
      if (!m) {
        if (router.pathExists(ctx.path)) return simplePage(ctx, 405, 'طريقة غير مسموحة', 'الطلب غير مسموح لهذا العنوان.');
        return notFound(ctx);
      }
      ctx.params = m.params;

      if (ctx.method === 'POST') {
        const origin = req.headers.origin;
        if (origin) {
          let ok = false;
          try {
            ok = new URL(origin).host === req.headers.host;
          } catch {
            ok = false;
          }
          if (!ok) return simplePage(ctx, 403, 'طلب مرفوض', 'تم رفض الطلب لأن مصدره غير موثوق.');
        }
        const limit =
          m.route.bigBody === 'media'
            ? config.maxVideoBytes + 1024 * 1024
            : m.route.bigBody
              ? config.maxAttachmentBytes * config.maxAttachments + 512 * 1024
              : 128 * 1024;
        let body: Buffer;
        try {
          body = await readBody(req, limit);
        } catch (e) {
          if (e instanceof HttpError && e.status === 413) {
            res.setHeader('Connection', 'close');
            return simplePage(ctx, 413, 'حجم الطلب كبير', 'حجم البيانات أو المرفقات يتجاوز الحد المسموح. قلّلوا حجم الملفات وأعيدوا المحاولة.');
          }
          throw e;
        }
        const ct = String(req.headers['content-type'] ?? '');
        if (ct.startsWith('multipart/form-data')) {
          const b = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
          if (!b) throw new HttpError(400, 'bad multipart');
          const parsed = parseMultipart(body, b[1] ?? b[2]);
          ctx.fields = parsed.fields;
          ctx.files = parsed.files;
        } else {
          ctx.fields = parseUrlEncoded(body);
        }
        if (!csrfValid(cookies.csrf, ctx.fields._csrf)) {
          return simplePage(ctx, 403, 'انتهت صلاحية الصفحة', 'انتهت صلاحية الصفحة أو تعذّر التحقق من الطلب. يرجى إعادة تحميل الصفحة والمحاولة مرة أخرى.');
        }
      }

      await m.route.handler(ctx);
    } catch (e) {
      if (e instanceof HttpError) {
        if (!res.headersSent) simplePage(ctx, e.status, 'تعذّر تنفيذ الطلب', 'الطلب غير صالح.');
        return;
      }
      console.error(`[${new Date().toISOString()}] ${ctx.method} ${ctx.path} →`, (e as Error).stack ?? e);
      if (!res.headersSent) serverError(ctx);
      else res.end();
    }
  });
}

// تشغيل الخادم عند تنفيذ الملف مباشرة
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const server = buildServer();
  server.listen(config.port, config.host, () => {
    console.log(`منصة الانضباط والمواظبة السلوكية تعمل على http://${config.host}:${config.port}`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
