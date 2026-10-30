import { ANNOUNCEMENT_CATEGORIES } from '../config.ts';
import { all, audit, get, nowIso, run } from '../db.ts';
import { fmtDate, html, raw, type Safe } from '../html.ts';
import type { Ctx } from '../http.ts';
import { notFound } from '../pages/public.ts';
import { alertBox, csrfInput, demoBadge, empty, icon } from '../ui.ts';
import { adminPage, back, fArea, fCheck, fSelect, fText, forbidden, pager, type Opt } from './ui.ts';
import { checked, idParam, str, validDate } from './util.ts';

const STATUS: Opt[] = [
  { value: 'draft', label: 'مسودة (غير منشور)' },
  { value: 'published', label: 'منشور' },
  { value: 'hidden', label: 'مخفي' },
];
const STATUS_AR: Record<string, string> = { draft: 'مسودة', published: 'منشور', hidden: 'مخفي' };
const PAGE = 20;

export function announcementsList(ctx: Ctx) {
  const page = Math.max(1, parseInt(ctx.url.searchParams.get('page') ?? '1', 10) || 1);
  const total = Number(get('SELECT COUNT(*) AS c FROM announcements')!.c);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const rows = all('SELECT * FROM announcements ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?', PAGE, (Math.min(page, pages) - 1) * PAGE);
  const isAdmin = ctx.user!.role === 'admin';
  adminPage(ctx, {
    title: 'الإعلانات',
    active: 'announcements',
    body: html`<h2>إعلانات المدرسة</h2>
    <p><a class="btn btn-primary" href="/admin/announcements/new">${icon('plus')} إعلان جديد</a></p>
    ${rows.length
      ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>العنوان</th><th>التصنيف</th><th>الحالة</th><th>موعد الفعالية</th><th>إجراءات</th></tr></thead><tbody>
      ${rows.map(
        (a) => html`<tr><td>${a.title} ${a.pinned ? html`<span class="badge b-info">مثبّت</span>` : ''} ${demoBadge(a.is_demo)}</td><td>${a.category}</td>
        <td><span class="badge ${a.status === 'published' ? 'b-ok' : 'b-mute'}">${STATUS_AR[a.status as string]}</span></td>
        <td>${a.event_date ? fmtDate(a.event_date as string) : '—'}</td>
        <td class="actions">
          <a class="btn btn-soft btn-sm" href="/admin/announcements/${a.id}/edit">تعديل</a>
          <form method="post" action="/admin/announcements/${a.id}/status" style="display:inline">${csrfInput(ctx)}
            <input type="hidden" name="status" value="${a.status === 'published' ? 'hidden' : 'published'}">
            <button class="btn btn-ghost btn-sm" type="submit">${a.status === 'published' ? 'إخفاء' : 'نشر'}</button></form>
          ${isAdmin
            ? html`<form method="post" action="/admin/announcements/${a.id}/delete" data-confirm="حذف الإعلان نهائيًا؟" style="display:inline">${csrfInput(ctx)}<button class="btn btn-danger btn-sm" type="submit">حذف</button></form>`
            : ''}
        </td></tr>`,
      )}</tbody></table></div>${pager('/admin/announcements', Math.min(page, pages), pages)}`
      : empty('لا توجد إعلانات. أضيفوا أول إعلان.', 'news')}`,
  });
}

function imageOptions(): Opt[] {
  return all("SELECT id, title FROM media WHERE kind='image' AND status='published' AND consent_confirmed=1 ORDER BY id DESC").map((m) => ({
    value: String(m.id),
    label: String(m.title),
  }));
}

function formBody(ctx: Ctx, action: string, v: Record<string, any>, err?: string): Safe {
  return html`<form class="card form" method="post" action="${action}" data-guard>
    ${err ? alertBox('err', err) : ''}${csrfInput(ctx)}
    <div class="grid-form">
      ${fText('عنوان الإعلان', 'title', v.title, { required: true, max: 150 })}
      ${fArea('نص الإعلان', 'body', v.body, { required: true, max: 5000, rows: 9 })}
      ${fSelect('التصنيف', 'category', v.category, ANNOUNCEMENT_CATEGORIES.map((c) => ({ value: c, label: c })), { required: true })}
      ${fText('تاريخ الفعالية (اختياري)', 'event_date', v.event_date, { type: 'date' })}
      ${fSelect('صورة الإعلان (اختياري)', 'image_media_id', v.image_media_id, imageOptions(), { blank: 'بدون صورة' })}
      <p class="hint">تظهر هنا الصور المنشورة فقط من قسم «صور وفيديو الفعاليات».</p>
      ${fSelect('الحالة', 'status', v.status ?? 'draft', STATUS, { required: true })}
      ${fCheck('تثبيت الإعلان في أعلى القائمة', 'pinned', !!v.pinned)}
    </div>
    <button class="btn btn-primary mt16" type="submit">حفظ</button> <a class="btn btn-ghost mt16" href="/admin/announcements">إلغاء</a>
  </form>`;
}

export function announcementNew(ctx: Ctx, err?: string, v: Record<string, any> = {}) {
  adminPage(ctx, { title: 'إعلان جديد', active: 'announcements', status: err ? 422 : 200, body: html`<h2>إعلان جديد</h2>${formBody(ctx, '/admin/announcements/new', v, err)}` });
}

function read(ctx: Ctx) {
  const v = {
    title: str(ctx, 'title', 150),
    body: str(ctx, 'body', 5000),
    category: str(ctx, 'category', 60),
    event_date: str(ctx, 'event_date', 10),
    image_media_id: str(ctx, 'image_media_id', 10),
    status: str(ctx, 'status', 12),
    pinned: checked(ctx, 'pinned') ? 1 : 0,
  };
  let err = '';
  if (!v.title) err = 'عنوان الإعلان مطلوب.';
  else if (!v.body) err = 'نص الإعلان مطلوب.';
  else if (!(ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(v.category)) err = 'اختاروا تصنيفًا صحيحًا.';
  else if (!['draft', 'published', 'hidden'].includes(v.status)) err = 'حالة غير صحيحة.';
  else if (v.event_date && !validDate(v.event_date)) err = 'تاريخ الفعالية غير صحيح.';
  let img: number | null = null;
  if (!err && v.image_media_id) {
    const m = get("SELECT id FROM media WHERE id = ? AND kind='image' AND status='published' AND consent_confirmed=1", Number(v.image_media_id) || 0);
    if (!m) err = 'الصورة المختارة غير متاحة.';
    else img = Number(m.id);
  }
  return { v, err, img };
}

export function announcementCreate(ctx: Ctx) {
  const { v, err, img } = read(ctx);
  if (err) return announcementNew(ctx, err, v);
  const now = nowIso();
  const r = run(
    'INSERT INTO announcements(title, body, category, event_date, image_media_id, status, pinned, published_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    v.title, v.body, v.category, v.event_date || null, img, v.status, v.pinned, v.status === 'published' ? now : null, now, now,
  );
  audit(ctx.user!.id, 'announcement.create', String(r.lastInsertRowid), ctx.ip);
  back(ctx, '/admin/announcements', 'created');
}

export function announcementEdit(ctx: Ctx, err?: string, v?: Record<string, any>) {
  const a = get('SELECT * FROM announcements WHERE id = ?', idParam(ctx));
  if (!a) return notFound(ctx);
  adminPage(ctx, {
    title: 'تعديل إعلان',
    active: 'announcements',
    status: err ? 422 : 200,
    body: html`<h2>تعديل الإعلان</h2>${formBody(ctx, `/admin/announcements/${a.id}/edit`, v ?? a, err)}`,
  });
}

export function announcementUpdate(ctx: Ctx) {
  const a = get('SELECT * FROM announcements WHERE id = ?', idParam(ctx));
  if (!a) return notFound(ctx);
  const { v, err, img } = read(ctx);
  if (err) return announcementEdit(ctx, err, v);
  const now = nowIso();
  const pub = v.status === 'published' ? ((a.published_at as string) ?? now) : (a.published_at as string | null);
  run(
    'UPDATE announcements SET title=?, body=?, category=?, event_date=?, image_media_id=?, status=?, pinned=?, published_at=?, updated_at=? WHERE id=?',
    v.title, v.body, v.category, v.event_date || null, img, v.status, v.pinned, pub, now, a.id as number,
  );
  audit(ctx.user!.id, 'announcement.update', String(a.id), ctx.ip);
  back(ctx, '/admin/announcements', 'saved');
}

export function announcementStatus(ctx: Ctx) {
  const a = get('SELECT * FROM announcements WHERE id = ?', idParam(ctx));
  if (!a) return notFound(ctx);
  const s = str(ctx, 'status', 12);
  if (!['draft', 'published', 'hidden'].includes(s)) return back(ctx, '/admin/announcements');
  const now = nowIso();
  run('UPDATE announcements SET status=?, published_at=?, updated_at=? WHERE id=?', s, s === 'published' ? ((a.published_at as string) ?? now) : (a.published_at as string | null), now, a.id as number);
  audit(ctx.user!.id, 'announcement.status', `${a.id}:${s}`, ctx.ip);
  back(ctx, '/admin/announcements', 'status');
}

export function announcementDelete(ctx: Ctx) {
  if (ctx.user!.role !== 'admin') return forbidden(ctx);
  const a = get('SELECT id FROM announcements WHERE id = ?', idParam(ctx));
  if (!a) return notFound(ctx);
  run('DELETE FROM announcements WHERE id = ?', a.id as number);
  audit(ctx.user!.id, 'announcement.delete', String(a.id), ctx.ip);
  back(ctx, '/admin/announcements', 'deleted');
}

export const _raw = raw;
