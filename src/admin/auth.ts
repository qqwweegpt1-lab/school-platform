import { audit, get, nowIso, run } from '../db.ts';
import { html, esc } from '../html.ts';
import { redirect, sendHtml, serializeCookie, type Ctx } from '../http.ts';
import {
  createSession,
  destroySession,
  destroyUserSessions,
  dummyVerify,
  hashPassword,
  rateLimit,
  rateLimitPeek,
  rateLimitReset,
  validatePasswordStrength,
  verifyPassword,
} from '../security.ts';
import { alertBox, csrfInput, layout, pageHero } from '../ui.ts';
import { adminPage, back } from './ui.ts';

const MAX_FAILS = 5;
const LOCK_MIN = 15;

function safeNext(n: string | null | undefined): string {
  return n && /^\/admin(\/[A-Za-z0-9_\-/?=&%.]*)?$/.test(n) && !n.includes('//') ? n : '/admin';
}

export function loginForm(ctx: Ctx, err?: string, status = 200) {
  const q = ctx.url.searchParams;
  const next = safeNext(ctx.fields.next ?? q.get('next'));
  const info = q.get('expired') ? 'انتهت جلستكم. يرجى تسجيل الدخول من جديد.' : q.get('need') ? 'يرجى تسجيل الدخول للوصول إلى لوحة الإدارة.' : q.get('out') ? 'تم تسجيل الخروج.' : '';
  sendHtml(
    ctx,
    layout({
      ctx,
      title: 'دخول الإدارة',
      body: html`${pageHero('دخول الإدارة', 'لوحة خاصة بالمشرفة والموظفين المخوّلين.', 'lock')}
      <div class="container content"><form class="card form login-card" method="post" action="/admin/login" novalidate data-guard>
        ${err ? alertBox('err', err) : info ? alertBox('info', info) : ''}
        ${csrfInput(ctx)}<input type="hidden" name="next" value="${next}">
        <div class="grid-form">
          <div class="field full"><label for="u">اسم المستخدم</label><input id="u" name="username" type="text" dir="ltr" class="ltr-input" required autocomplete="username" maxlength="40" autocapitalize="off"></div>
          <div class="field full"><label for="p">كلمة المرور</label><input id="p" name="password" type="password" dir="ltr" class="ltr-input" required autocomplete="current-password" maxlength="200"></div>
        </div>
        <button class="btn btn-primary btn-lg mt16" type="submit">تسجيل الدخول</button>
      </form></div>`,
    }),
    status,
    true,
  );
}

export function loginSubmit(ctx: Ctx) {
  const username = (ctx.fields.username ?? '').trim().slice(0, 40);
  const password = (ctx.fields.password ?? '').slice(0, 200);
  const ipKey = `login:ip:${ctx.ip}`;
  const generic = 'اسم المستخدم أو كلمة المرور غير صحيحة.';

  if (!rateLimitPeek(ipKey, 20)) return loginForm(ctx, 'محاولات كثيرة. يرجى المحاولة بعد 15 دقيقة.', 429);

  const u = username ? get('SELECT * FROM users WHERE username = ?', username) : undefined;
  if (u && u.locked_until && new Date(u.locked_until as string).getTime() > Date.now()) {
    dummyVerify(password);
    rateLimit(ipKey, 20, LOCK_MIN * 60_000);
    return loginForm(ctx, 'تم إيقاف الدخول مؤقتًا بسبب محاولات متكررة. حاولوا لاحقًا.', 429);
  }
  const ok = u && u.active ? verifyPassword(password, u.password_hash as string) : (dummyVerify(password), false);
  if (!u || !ok) {
    rateLimit(ipKey, 20, LOCK_MIN * 60_000);
    if (u) {
      const fails = Number(u.failed_logins) + 1;
      if (fails >= MAX_FAILS) {
        run('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?', new Date(Date.now() + LOCK_MIN * 60_000).toISOString(), u.id as number);
        audit(u.id as number, 'login.locked', null, ctx.ip);
      } else run('UPDATE users SET failed_logins = ? WHERE id = ?', fails, u.id as number);
    }
    return loginForm(ctx, generic, 401);
  }
  rateLimitReset(ipKey);
  run('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', nowIso(), u.id as number);
  // تدوير الجلسة: إنهاء الجلسة القديمة إن وُجدت
  destroySession(ctx.cookies.sid);
  const { token, expires } = createSession(u.id as number, ctx.ip, String(ctx.req.headers['user-agent'] ?? ''));
  ctx.setCookies.push(serializeCookie('sid', token, { expires }));
  audit(u.id as number, 'login', null, ctx.ip);
  redirect(ctx, safeNext(ctx.fields.next));
}

export function logout(ctx: Ctx) {
  if (ctx.user) audit(ctx.user.id, 'logout', null, ctx.ip);
  destroySession(ctx.cookies.sid);
  ctx.setCookies.push(serializeCookie('sid', '', { maxAge: 0 }));
  redirect(ctx, '/admin/login?out=1');
}

export function passwordForm(ctx: Ctx, err?: string) {
  adminPage(ctx, {
    title: 'تغيير كلمة المرور',
    active: 'password',
    status: err ? 422 : 200,
    body: html`<h2>تغيير كلمة المرور</h2>
    <form class="card form narrow-left" method="post" action="/admin/password" data-guard>
      ${err ? alertBox('err', err) : ''}${csrfInput(ctx)}
      <div class="grid-form">
        <div class="field full"><label for="o">كلمة المرور الحالية</label><input id="o" name="old" type="password" dir="ltr" class="ltr-input" required autocomplete="current-password"></div>
        <div class="field full"><label for="n">كلمة المرور الجديدة</label><input id="n" name="new" type="password" dir="ltr" class="ltr-input" required autocomplete="new-password" minlength="10"><p class="hint">10 أحرف على الأقل، وتحتوي على أحرف وأرقام.</p></div>
        <div class="field full"><label for="c">تأكيد كلمة المرور الجديدة</label><input id="c" name="confirm" type="password" dir="ltr" class="ltr-input" required autocomplete="new-password"></div>
      </div>
      <button class="btn btn-primary mt16" type="submit">حفظ</button>
    </form>`,
  });
}

export function passwordSubmit(ctx: Ctx) {
  const { old = '', new: nw = '', confirm = '' } = ctx.fields;
  const u = get('SELECT * FROM users WHERE id = ?', ctx.user!.id)!;
  if (!verifyPassword(old, u.password_hash as string)) return passwordForm(ctx, 'كلمة المرور الحالية غير صحيحة.');
  const weak = validatePasswordStrength(nw);
  if (weak) return passwordForm(ctx, weak);
  if (nw !== confirm) return passwordForm(ctx, 'كلمتا المرور الجديدتان غير متطابقتين.');
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(nw), ctx.user!.id);
  destroyUserSessions(ctx.user!.id);
  const { token, expires } = createSession(ctx.user!.id, ctx.ip, String(ctx.req.headers['user-agent'] ?? ''));
  ctx.setCookies.push(serializeCookie('sid', token, { expires }));
  audit(ctx.user!.id, 'password.change', null, ctx.ip);
  back(ctx, '/admin', 'pw');
}

export const _e = esc;
