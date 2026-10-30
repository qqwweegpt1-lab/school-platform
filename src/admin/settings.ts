import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { brand, config } from '../config.ts';
import { all, audit, get, getSetting, nowIso, run, tx } from '../db.ts';
import { fmtDateTime, html } from '../html.ts';
import type { Ctx } from '../http.ts';
import { notFound } from '../pages/public.ts';
import { destroyUserSessions, hashPassword, validatePasswordStrength } from '../security.ts';
import { alertBox, csrfInput, icon } from '../ui.ts';
import { adminPage, back, fArea, fSelect, fText } from './ui.ts';
import { idParam, str } from './util.ts';

// ───────── محتوى الصفحة الرئيسية ─────────
export function settingsForm(ctx: Ctx, err?: string) {
  adminPage(ctx, {
    title: 'محتوى الصفحة الرئيسية',
    active: 'settings',
    status: err ? 422 : 200,
    body: html`<h2>محتوى الصفحة الرئيسية</h2>
    <form class="card form" method="post" action="/admin/settings" data-guard>${err ? alertBox('err', err) : ''}${csrfInput(ctx)}
      <div class="grid-form">
        ${fText('عنوان الواجهة الترحيبية', 'welcome_title', getSetting('welcome_title', brand.defaultWelcomeTitle), { required: true, max: 120 })}
        ${fArea('نص الواجهة الترحيبية', 'welcome_text', getSetting('welcome_text', brand.defaultWelcomeText), { required: true, max: 600, rows: 3 })}
        ${fArea('النص التعريفي بالمنصة', 'intro_text', getSetting('intro_text', brand.defaultIntro), { required: true, max: 1500, rows: 7 })}
      </div>
      <p class="hint">لتغيير اسم المنصة أو اسم المشرفة أو اسم المدرسة عدّلوا الملف <code dir="ltr">src/config.ts</code> (راجعوا README).</p>
      <button class="btn btn-primary mt16" type="submit">حفظ</button>
    </form>`,
  });
}

export function settingsSave(ctx: Ctx) {
  const t = str(ctx, 'welcome_title', 120);
  const w = str(ctx, 'welcome_text', 600);
  const i = str(ctx, 'intro_text', 1500);
  if (!t || !w || !i) return settingsForm(ctx, 'جميع الحقول مطلوبة.');
  tx(() => {
    run('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'welcome_title', t);
    run('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'welcome_text', w);
    run('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'intro_text', i);
  });
  audit(ctx.user!.id, 'settings.save', null, ctx.ip);
  back(ctx, '/admin/settings', 'saved');
}

// ───────── حذف البيانات التجريبية ─────────
export function clearDemo(ctx: Ctx) {
  const atts = all('SELECT a.stored_name FROM attachments a JOIN requests r ON r.id = a.request_id WHERE r.is_demo = 1');
  tx(() => {
    run('DELETE FROM requests WHERE is_demo = 1');
    run('DELETE FROM announcements WHERE is_demo = 1');
    run('DELETE FROM initiatives WHERE is_demo = 1');
  });
  for (const a of atts) {
    try {
      unlinkSync(path.join(config.attachmentsDir, a.stored_name as string));
    } catch {
      /* ignore */
    }
  }
  audit(ctx.user!.id, 'demo.clear', null, ctx.ip);
  back(ctx, '/admin', 'demo');
}

// ───────── المستخدمون ─────────
const ROLES = [
  { value: 'staff', label: 'موظف مخوّل (غياب/تأخر/استئذان/مقترحات)' },
  { value: 'admin', label: 'مشرفة / مديرة النظام (جميع الصلاحيات)' },
];

export function usersList(ctx: Ctx, err?: string) {
  const rows = all('SELECT id, username, display_name, role, active, last_login_at, locked_until FROM users ORDER BY id');
  adminPage(ctx, {
    title: 'المستخدمون',
    active: 'users',
    status: err ? 422 : 200,
    body: html`<h2>المستخدمون والصلاحيات</h2>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>الدور</th><th>الحالة</th><th>آخر دخول</th><th>إجراءات</th></tr></thead><tbody>
    ${rows.map(
      (u) => html`<tr><td>${u.display_name}</td><td dir="ltr" class="ltr-start">${u.username}</td><td>${u.role === 'admin' ? 'مشرفة' : 'موظف'}</td>
      <td><span class="badge ${u.active ? 'b-ok' : 'b-mute'}">${u.active ? 'فعّال' : 'موقوف'}</span></td><td>${u.last_login_at ? fmtDateTime(u.last_login_at as string) : '—'}</td>
      <td class="actions">${u.id === ctx.user!.id
        ? html`<small>حسابكم</small>`
        : html`<form method="post" action="/admin/users/${u.id}/toggle" style="display:inline">${csrfInput(ctx)}<button class="btn btn-ghost btn-sm" type="submit">${u.active ? 'إيقاف' : 'تفعيل'}</button></form>
        <form method="post" action="/admin/users/${u.id}/reset" style="display:inline-flex;gap:6px">${csrfInput(ctx)}<input type="password" name="password" placeholder="كلمة مرور جديدة" dir="ltr" minlength="10" required autocomplete="new-password" aria-label="كلمة مرور جديدة لـ ${u.display_name}"><button class="btn btn-soft btn-sm" type="submit">إعادة تعيين</button></form>`}</td></tr>`,
    )}</tbody></table></div>
    <form class="card form mt22" method="post" action="/admin/users" data-guard>${err ? alertBox('err', err) : ''}${csrfInput(ctx)}
      <h3>${icon('plus')} مستخدم جديد</h3>
      <div class="grid-form">
        ${fText('الاسم المعروض', 'display_name', '', { required: true, max: 60 })}
        ${fText('اسم المستخدم (أحرف إنجليزية وأرقام)', 'username', '', { required: true, max: 40, dir: 'ltr' })}
        ${fSelect('الدور', 'role', 'staff', ROLES, { required: true })}
        ${fText('كلمة المرور (10 أحرف على الأقل، أحرف وأرقام)', 'password', '', { type: 'password', required: true, max: 200, dir: 'ltr' })}
      </div>
      <button class="btn btn-primary mt16" type="submit">إنشاء</button>
    </form>`,
  });
}

export function userCreate(ctx: Ctx) {
  const display = str(ctx, 'display_name', 60);
  const username = str(ctx, 'username', 40);
  const role = str(ctx, 'role', 10);
  const password = (ctx.fields.password ?? '').slice(0, 200);
  if (!display) return usersList(ctx, 'الاسم المعروض مطلوب.');
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) return usersList(ctx, 'اسم المستخدم: 3 إلى 40 حرفًا إنجليزيًا أو رقمًا أو (_ . -).');
  if (!['admin', 'staff'].includes(role)) return usersList(ctx, 'دور غير صحيح.');
  const weak = validatePasswordStrength(password);
  if (weak) return usersList(ctx, weak);
  if (get('SELECT id FROM users WHERE username = ?', username)) return usersList(ctx, 'اسم المستخدم مستخدم مسبقًا.');
  const r = run('INSERT INTO users(username, display_name, password_hash, role, created_at) VALUES (?,?,?,?,?)', username, display, hashPassword(password), role, nowIso());
  audit(ctx.user!.id, 'user.create', String(r.lastInsertRowid), ctx.ip);
  back(ctx, '/admin/users', 'created');
}

export function userToggle(ctx: Ctx) {
  const u = get('SELECT * FROM users WHERE id = ?', idParam(ctx));
  if (!u) return notFound(ctx);
  if (u.id === ctx.user!.id) return back(ctx, '/admin/users');
  const next = u.active ? 0 : 1;
  run('UPDATE users SET active = ? WHERE id = ?', next, u.id as number);
  if (!next) destroyUserSessions(u.id as number);
  audit(ctx.user!.id, 'user.toggle', `${u.id}:${next}`, ctx.ip);
  back(ctx, '/admin/users', 'saved');
}

export function userReset(ctx: Ctx) {
  const u = get('SELECT * FROM users WHERE id = ?', idParam(ctx));
  if (!u) return notFound(ctx);
  const pw = (ctx.fields.password ?? '').slice(0, 200);
  const weak = validatePasswordStrength(pw);
  if (weak) return usersList(ctx, weak);
  run('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?', hashPassword(pw), u.id as number);
  destroyUserSessions(u.id as number);
  audit(ctx.user!.id, 'user.reset', String(u.id), ctx.ip);
  back(ctx, '/admin/users', 'pwreset');
}
