import { KINDS, type Kind } from '../config.ts';
import { esc, html, raw, Safe } from '../html.ts';
import { redirect, sendHtml, type Ctx } from '../http.ts';
import type { Handler } from '../router.ts';
import { alertBox, csrfInput, icon, layout } from '../ui.ts';

export const ADMIN_KINDS: Kind[] = ['absence', 'late', 'permission', 'suggestion', 'complaint', 'student_voice', 'parent_opinion'];
/** الأنواع التي يراها الموظف المخوّل (غير المشرفة) */
export const STAFF_KINDS: Kind[] = ['absence', 'late', 'permission', 'suggestion'];
export const allowedKinds = (ctx: Ctx): Kind[] => (ctx.user?.role === 'admin' ? ADMIN_KINDS : STAFF_KINDS);

export const FLASH: Record<string, string> = {
  saved: 'تم الحفظ بنجاح.',
  created: 'تمت الإضافة بنجاح.',
  deleted: 'تم الحذف.',
  status: 'تم تحديث الحالة.',
  note: 'تمت إضافة الملاحظة.',
  pw: 'تم تغيير كلمة المرور.',
  demo: 'تم حذف البيانات التجريبية.',
  needconsent: 'لا يمكن نشر الوسائط قبل تأكيد الموافقة على النشر.',
  pwreset: 'تمت إعادة تعيين كلمة المرور وإنهاء جلسات المستخدم.',
};

export function forbidden(ctx: Ctx) {
  sendHtml(
    ctx,
    layout({
      ctx,
      title: 'غير مصرّح',
      body: html`<div class="container content narrow"><div class="card">${alertBox('err', 'ليست لديك صلاحية للوصول إلى هذه الصفحة.')}<a class="btn btn-primary" href="/admin">العودة إلى لوحة الإدارة</a></div></div>`,
    }),
    403,
    true,
  );
}

/** يحمي المسار: تسجيل دخول إلزامي، وصلاحية المشرفة اختيارية. التحقق على الخادم دائمًا. */
export function guard(handler: Handler, opts: { admin?: boolean } = {}): Handler {
  return (ctx) => {
    if (!ctx.user) {
      const next = ctx.method === 'GET' ? `&next=${encodeURIComponent(ctx.path + ctx.url.search)}` : '';
      return redirect(ctx, `/admin/login?${ctx.sessionExpired ? 'expired=1' : 'need=1'}${next}`);
    }
    if (opts.admin && ctx.user.role !== 'admin') return forbidden(ctx);
    return handler(ctx);
  };
}

export type AdminKey = 'dash' | 'requests' | 'announcements' | 'initiatives' | 'surveys' | 'media' | 'settings' | 'users' | 'password' | string;

export function adminPage(ctx: Ctx, o: { title: string; active: AdminKey; body: Safe; status?: number }) {
  const u = ctx.user!;
  const isAdmin = u.role === 'admin';
  const link = (href: string, key: string, ic: string, label: string) =>
    html`<a href="${href}" class="${o.active === key ? 'on' : ''}"${o.active === key ? raw(' aria-current="page"') : ''}>${icon(ic)}<span>${label}</span></a>`;
  const kinds = allowedKinds(ctx);
  const sub = (k: Kind) => link(`/admin/requests?kind=${k}`, `req:${k}`, 'inbox', KINDS[k].label);

  const body = html`<div class="container admin-wrap">
    <aside class="side" aria-label="قائمة الإدارة">
      <div class="who"><strong>${u.display_name}</strong><small>${isAdmin ? 'مشرفة / مديرة النظام' : 'موظف مخوّل'}</small></div>
      ${link('/admin', 'dash', 'home', 'لوحة المتابعة')}
      ${link('/admin/requests', 'requests', 'inbox', 'جميع الطلبات')}
      ${kinds.map(sub)}
      ${link('/admin/announcements', 'announcements', 'news', 'الإعلانات')}
      ${isAdmin ? html`${link('/admin/initiatives', 'initiatives', 'trophy', 'وسائل التحفيز')}${link('/admin/surveys', 'surveys', 'chart', 'نتائج الاستبانات')}${link('/admin/media', 'media', 'image', 'صور وفيديو الفعاليات')}${link('/admin/settings', 'settings', 'settings', 'محتوى الصفحة الرئيسية')}${link('/admin/users', 'users', 'users', 'المستخدمون')}` : ''}
      ${link('/admin/password', 'password', 'lock', 'تغيير كلمة المرور')}
      <form method="post" action="/admin/logout">${csrfInput(ctx)}<button class="linklike" type="submit">${icon('logout')}<span>تسجيل الخروج</span></button></form>
    </aside>
    <section class="admin-main">${flashBox(ctx)}${o.body}</section>
  </div>`;
  sendHtml(ctx, layout({ ctx, title: o.title, body, bodyClass: 'admin' }), o.status ?? 200, true);
}

export function flashBox(ctx: Ctx): Safe {
  const code = ctx.url.searchParams.get('m');
  return code && FLASH[code] ? alertBox(code === 'needconsent' ? 'warn' : 'ok', FLASH[code]) : html``;
}

export const back = (ctx: Ctx, to: string, flash?: string) => redirect(ctx, flash ? `${to}${to.includes('?') ? '&' : '?'}m=${flash}` : to);

// ───────── عناصر نماذج الإدارة ─────────
export interface Opt {
  value: string;
  label: string;
}
export function fText(label: string, name: string, value: unknown, o: { type?: string; required?: boolean; max?: number; hint?: string; dir?: string } = {}): Safe {
  return html`<div class="field full"><label for="a_${name}">${label}${o.required ? html` <span class="req">*</span>` : ''}</label>
    <input id="a_${name}" name="${name}" type="${o.type ?? 'text'}" value="${String(value ?? '')}"${o.required ? raw(' required') : ''}${o.max ? raw(` maxlength="${o.max}"`) : ''}${o.dir ? raw(` dir="${o.dir}"`) : ''}>
    ${o.hint ? html`<p class="hint">${o.hint}</p>` : ''}</div>`;
}
export function fArea(label: string, name: string, value: unknown, o: { required?: boolean; max?: number; rows?: number; hint?: string } = {}): Safe {
  return html`<div class="field full"><label for="a_${name}">${label}${o.required ? html` <span class="req">*</span>` : ''}</label>
    <textarea id="a_${name}" name="${name}" rows="${o.rows ?? 6}"${o.required ? raw(' required') : ''}${o.max ? raw(` maxlength="${o.max}"`) : ''}>${String(value ?? '')}</textarea>
    ${o.hint ? html`<p class="hint">${o.hint}</p>` : ''}</div>`;
}
export function fSelect(label: string, name: string, value: unknown, opts: Opt[], o: { required?: boolean; blank?: string } = {}): Safe {
  return html`<div class="field full"><label for="a_${name}">${label}</label>
    <select id="a_${name}" name="${name}"${o.required ? raw(' required') : ''}>
      ${o.blank !== undefined ? html`<option value="">${o.blank}</option>` : ''}
      ${opts.map((x) => html`<option value="${x.value}"${String(value ?? '') === x.value ? raw(' selected') : ''}>${x.label}</option>`)}
    </select></div>`;
}
export function fCheck(label: string, name: string, checked: boolean): Safe {
  return html`<div class="field full"><label class="check"><input type="checkbox" name="${name}" value="1"${checked ? raw(' checked') : ''}><span>${label}</span></label></div>`;
}

export function pager(base: string, page: number, pages: number): Safe {
  if (pages <= 1) return html``;
  const sep = base.includes('?') ? '&' : '?';
  const nums: number[] = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i);
  return html`<nav class="pager" aria-label="الصفحات">${nums.map((n, i) => {
    const gap = i > 0 && n - nums[i - 1] > 1 ? html`<span>…</span>` : '';
    return html`${gap}${n === page ? html`<span class="on" aria-current="page">${n}</span>` : html`<a href="${base}${sep}page=${n}">${n}</a>`}`;
  })}</nav>`;
}

export const esc2 = esc;
export { csrfInput, alertBox, icon };
