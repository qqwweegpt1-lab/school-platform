import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { config, MEDIA_CATEGORIES } from '../config.ts';
import { all, audit, get, nowIso, run } from '../db.ts';
import { serveFile } from '../files.ts';
import { fmtDate, html, raw } from '../html.ts';
import type { Ctx } from '../http.ts';
import { notFound } from '../pages/public.ts';
import { checkMedia, storeFile } from '../uploads.ts';
import { alertBox, csrfInput, empty, icon } from '../ui.ts';
import { adminPage, back, fCheck, fSelect, fText } from './ui.ts';
import { checked, idParam, str, validDate } from './util.ts';

const CATS = MEDIA_CATEGORIES.map((c) => ({ value: c, label: c }));

export function mediaList(ctx: Ctx, err?: string) {
  const rows = all('SELECT * FROM media ORDER BY id DESC');
  adminPage(ctx, {
    title: 'صور وفيديو الفعاليات',
    active: 'media',
    status: err ? 422 : 200,
    body: html`<h2>صور ومقاطع الفعاليات</h2>
    ${alertBox('warn', 'لا تُنشر أي صورة أو مقطع للعامة إلا بعد تأكيد الحصول على موافقة النشر (المدرسة وأولياء أمور الطالبات الظاهرات). الوسائط المرفوعة تُحفظ في مجلد غير عام.')}
    <form class="card form" method="post" action="/admin/media" enctype="multipart/form-data" data-guard>
      ${err ? alertBox('err', err) : ''}${csrfInput(ctx)}
      <h3>رفع جديد</h3>
      <div class="grid-form">
        ${fText('عنوان الصورة/المقطع', 'title', '', { required: true, max: 120 })}
        ${fSelect('التصنيف', 'category', '', CATS, { required: true, blank: 'اختر…' })}
        ${fText('تاريخ الفعالية (اختياري)', 'event_date', '', { type: 'date' })}
        <div class="field full"><label for="a_file">الملف (JPG/PNG/WEBP حتى 8 م.ب، MP4/WEBM حتى 60 م.ب)</label><input id="a_file" type="file" name="file" required accept=".jpg,.jpeg,.png,.webp,.mp4,.webm"></div>
        ${fCheck('أؤكد الحصول على موافقة النشر لهذا المحتوى', 'consent', false)}
        ${fCheck('نشر فور الرفع (يتطلب تأكيد الموافقة)', 'publish', false)}
      </div>
      <button class="btn btn-primary mt16" type="submit">${icon('plus')} رفع</button>
    </form>
    <h3 class="mt22">المكتبة</h3>
    ${rows.length
      ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>المعاينة</th><th>العنوان</th><th>التصنيف</th><th>الموافقة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>
      ${rows.map(
        (m) => html`<tr><td>${m.kind === 'image' ? html`<img src="/admin/media/${m.id}/file" alt="" width="72" height="54" style="object-fit:cover;border-radius:8px">` : html`<span class="chip">فيديو</span>`}</td>
        <td>${m.title}<div class="hint">${m.event_date ? fmtDate(m.event_date as string) : ''}</div></td><td>${m.category}</td>
        <td>${m.consent_confirmed ? html`<span class="badge b-ok">مؤكدة</span>` : html`<span class="badge b-warn">غير مؤكدة</span>`}</td>
        <td><span class="badge ${m.status === 'published' ? 'b-ok' : 'b-mute'}">${m.status === 'published' ? 'منشور' : 'مسودة'}</span></td>
        <td class="actions"><a class="btn btn-soft btn-sm" href="/admin/media/${m.id}/edit">تعديل</a>
        <form method="post" action="/admin/media/${m.id}/status" style="display:inline">${csrfInput(ctx)}<input type="hidden" name="status" value="${m.status === 'published' ? 'draft' : 'published'}"><button class="btn btn-ghost btn-sm" type="submit">${m.status === 'published' ? 'إلغاء النشر' : 'نشر'}</button></form>
        <form method="post" action="/admin/media/${m.id}/delete" data-confirm="حذف الملف نهائيًا؟" style="display:inline">${csrfInput(ctx)}<button class="btn btn-danger btn-sm" type="submit">حذف</button></form></td></tr>`,
      )}</tbody></table></div>`
      : empty('لا توجد وسائط. ارفعوا صورًا أو مقاطع من الفعاليات بعد التأكد من الموافقات.', 'image')}`,
  });
}

export function mediaUpload(ctx: Ctx) {
  const title = str(ctx, 'title', 120);
  const category = str(ctx, 'category', 40);
  const date = str(ctx, 'event_date', 10);
  const consent = checked(ctx, 'consent');
  const wantPublish = checked(ctx, 'publish');
  const file = ctx.files.find((f) => f.field === 'file');
  if (!title) return mediaList(ctx, 'العنوان مطلوب.');
  if (!(MEDIA_CATEGORIES as readonly string[]).includes(category)) return mediaList(ctx, 'اختاروا تصنيفًا صحيحًا.');
  if (date && !validDate(date)) return mediaList(ctx, 'تاريخ غير صحيح.');
  if (!file) return mediaList(ctx, 'اختاروا ملفًا للرفع.');
  const r = checkMedia(file);
  if ('error' in r) return mediaList(ctx, r.error);
  const { stored } = storeFile(config.mediaDir, r.ok);
  const publish = wantPublish && consent;
  const now = nowIso();
  const ins = run(
    'INSERT INTO media(title, kind, category, event_date, stored_name, mime, size, status, consent_confirmed, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    title, r.ok.det.kind, category, date || null, stored, r.ok.det.mime, r.ok.data.length, publish ? 'published' : 'draft', consent ? 1 : 0, now, now,
  );
  audit(ctx.user!.id, 'media.upload', String(ins.lastInsertRowid), ctx.ip);
  back(ctx, '/admin/media', wantPublish && !consent ? 'needconsent' : 'created');
}

export function mediaEdit(ctx: Ctx, err?: string) {
  const m = get('SELECT * FROM media WHERE id = ?', idParam(ctx));
  if (!m) return notFound(ctx);
  adminPage(ctx, {
    title: 'تعديل وسائط',
    active: 'media',
    status: err ? 422 : 200,
    body: html`<h2>تعديل بيانات الملف</h2>
    <form class="card form" method="post" action="/admin/media/${m.id}/edit" data-guard>${err ? alertBox('err', err) : ''}${csrfInput(ctx)}
      <div class="grid-form">
        ${fText('العنوان', 'title', m.title, { required: true, max: 120 })}
        ${fSelect('التصنيف', 'category', m.category, CATS, { required: true })}
        ${fText('تاريخ الفعالية', 'event_date', m.event_date, { type: 'date' })}
        ${fCheck('أؤكد الحصول على موافقة النشر لهذا المحتوى', 'consent', !!m.consent_confirmed)}
      </div>
      <p class="hint">إزالة تأكيد الموافقة تُلغي نشر الملف تلقائيًا.</p>
      <button class="btn btn-primary mt16" type="submit">حفظ</button> <a class="btn btn-ghost mt16" href="/admin/media">إلغاء</a>
    </form>`,
  });
}

export function mediaUpdate(ctx: Ctx) {
  const m = get('SELECT * FROM media WHERE id = ?', idParam(ctx));
  if (!m) return notFound(ctx);
  const title = str(ctx, 'title', 120);
  const category = str(ctx, 'category', 40);
  const date = str(ctx, 'event_date', 10);
  const consent = checked(ctx, 'consent');
  if (!title || !(MEDIA_CATEGORIES as readonly string[]).includes(category) || (date && !validDate(date))) return mediaEdit(ctx, 'تحققوا من العنوان والتصنيف والتاريخ.');
  run('UPDATE media SET title=?, category=?, event_date=?, consent_confirmed=?, status=?, updated_at=? WHERE id=?', title, category, date || null, consent ? 1 : 0, consent ? (m.status as string) : 'draft', nowIso(), m.id as number);
  audit(ctx.user!.id, 'media.update', String(m.id), ctx.ip);
  back(ctx, '/admin/media', 'saved');
}

export function mediaStatus(ctx: Ctx) {
  const m = get('SELECT * FROM media WHERE id = ?', idParam(ctx));
  if (!m) return notFound(ctx);
  const s = str(ctx, 'status', 10);
  if (!['draft', 'published'].includes(s)) return back(ctx, '/admin/media');
  if (s === 'published' && !m.consent_confirmed) return back(ctx, '/admin/media', 'needconsent');
  run('UPDATE media SET status=?, updated_at=? WHERE id=?', s, nowIso(), m.id as number);
  audit(ctx.user!.id, 'media.status', `${m.id}:${s}`, ctx.ip);
  back(ctx, '/admin/media', 'status');
}

export function mediaDelete(ctx: Ctx) {
  const m = get('SELECT * FROM media WHERE id = ?', idParam(ctx));
  if (!m) return notFound(ctx);
  run('DELETE FROM media WHERE id = ?', m.id as number);
  try {
    unlinkSync(path.join(config.mediaDir, m.stored_name as string));
  } catch {
    /* الملف غير موجود */
  }
  audit(ctx.user!.id, 'media.delete', String(m.id), ctx.ip);
  back(ctx, '/admin/media', 'deleted');
}

/** معاينة للإدارة فقط (حتى لو لم تُنشر الوسيطة) */
export function mediaPreview(ctx: Ctx) {
  const m = get('SELECT * FROM media WHERE id = ?', idParam(ctx));
  if (!m) return notFound(ctx);
  if (!serveFile(ctx, path.join(config.mediaDir, m.stored_name as string), m.mime as string)) notFound(ctx);
}

export const _r = raw;
