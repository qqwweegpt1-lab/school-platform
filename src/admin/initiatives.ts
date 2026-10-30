import { all, audit, get, nowIso, run } from '../db.ts';
import { fmtDate, html, type Safe } from '../html.ts';
import type { Ctx } from '../http.ts';
import { notFound } from '../pages/public.ts';
import { alertBox, csrfInput, demoBadge, empty, icon } from '../ui.ts';
import { adminPage, back, fArea, fSelect, fText, type Opt } from './ui.ts';
import { idParam, INITIATIVE_ICONS, str, validDate } from './util.ts';

const STATUS: Opt[] = [
  { value: 'draft', label: 'مسودة (غير منشورة)' },
  { value: 'active', label: 'نشطة' },
  { value: 'ended', label: 'منتهية' },
];
const STATUS_AR: Record<string, string> = { draft: 'مسودة', active: 'نشطة', ended: 'منتهية' };

export function initiativesList(ctx: Ctx) {
  const rows = all('SELECT * FROM initiatives ORDER BY sort_order, id DESC');
  adminPage(ctx, {
    title: 'وسائل التحفيز',
    active: 'initiatives',
    body: html`<h2>وسائل التحفيز والمبادرات</h2>
    <p><a class="btn btn-primary" href="/admin/initiatives/new">${icon('plus')} مبادرة جديدة</a></p>
    ${rows.length
      ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>الاسم</th><th>الفئة المستهدفة</th><th>الحالة</th><th>المدة</th><th>الترتيب</th><th>إجراءات</th></tr></thead><tbody>
      ${rows.map(
        (i) => html`<tr><td>${i.name} ${demoBadge(i.is_demo)}</td><td>${i.audience}</td>
        <td><span class="badge ${i.status === 'active' ? 'b-ok' : 'b-mute'}">${STATUS_AR[i.status as string]}</span></td>
        <td>${i.start_date ? fmtDate(i.start_date as string) : '—'} ← ${i.end_date ? fmtDate(i.end_date as string) : '—'}</td><td>${i.sort_order}</td>
        <td class="actions"><a class="btn btn-soft btn-sm" href="/admin/initiatives/${i.id}/edit">تعديل</a>
        <form method="post" action="/admin/initiatives/${i.id}/delete" data-confirm="حذف المبادرة نهائيًا؟" style="display:inline">${csrfInput(ctx)}<button class="btn btn-danger btn-sm" type="submit">حذف</button></form></td></tr>`,
      )}</tbody></table></div>`
      : empty('لا توجد مبادرات. أضيفوا أول مبادرة.', 'trophy')}`,
  });
}

function formBody(ctx: Ctx, action: string, v: Record<string, any>, err?: string): Safe {
  return html`<form class="card form" method="post" action="${action}" data-guard>
    ${err ? alertBox('err', err) : ''}${csrfInput(ctx)}
    <div class="grid-form">
      ${fText('اسم المبادرة', 'name', v.name, { required: true, max: 120 })}
      ${fArea('وصف المبادرة', 'description', v.description, { required: true, max: 1500, rows: 5 })}
      ${fText('الفئة المستهدفة', 'audience', v.audience, { required: true, max: 100, hint: 'مثال: جميع الطالبات، الصفوف الأولية، أولياء الأمور.' })}
      ${fSelect('الأيقونة', 'icon', v.icon ?? 'star', INITIATIVE_ICONS)}
      ${fText('تاريخ البداية (اختياري)', 'start_date', v.start_date, { type: 'date' })}
      ${fText('تاريخ النهاية (اختياري)', 'end_date', v.end_date, { type: 'date' })}
      ${fSelect('الحالة', 'status', v.status ?? 'draft', STATUS, { required: true })}
      ${fText('ترتيب العرض (رقم أصغر = أولًا)', 'sort_order', v.sort_order ?? 0, { type: 'number' })}
    </div>
    <button class="btn btn-primary mt16" type="submit">حفظ</button> <a class="btn btn-ghost mt16" href="/admin/initiatives">إلغاء</a>
  </form>`;
}

export function initiativeNew(ctx: Ctx, err?: string, v: Record<string, any> = {}) {
  adminPage(ctx, { title: 'مبادرة جديدة', active: 'initiatives', status: err ? 422 : 200, body: html`<h2>مبادرة جديدة</h2>${formBody(ctx, '/admin/initiatives/new', v, err)}` });
}

function read(ctx: Ctx) {
  const v = {
    name: str(ctx, 'name', 120),
    description: str(ctx, 'description', 1500),
    audience: str(ctx, 'audience', 100),
    icon: str(ctx, 'icon', 20),
    start_date: str(ctx, 'start_date', 10),
    end_date: str(ctx, 'end_date', 10),
    status: str(ctx, 'status', 10),
    sort_order: Math.max(-9999, Math.min(9999, parseInt(str(ctx, 'sort_order', 6), 10) || 0)),
  };
  let err = '';
  if (!v.name) err = 'اسم المبادرة مطلوب.';
  else if (!v.description) err = 'وصف المبادرة مطلوب.';
  else if (!v.audience) err = 'الفئة المستهدفة مطلوبة.';
  else if (!INITIATIVE_ICONS.some((i) => i.value === v.icon)) err = 'أيقونة غير صحيحة.';
  else if (!['draft', 'active', 'ended'].includes(v.status)) err = 'حالة غير صحيحة.';
  else if ((v.start_date && !validDate(v.start_date)) || (v.end_date && !validDate(v.end_date))) err = 'تاريخ غير صحيح.';
  else if (v.start_date && v.end_date && v.end_date < v.start_date) err = 'تاريخ النهاية يجب ألا يسبق تاريخ البداية.';
  return { v, err };
}

export function initiativeCreate(ctx: Ctx) {
  const { v, err } = read(ctx);
  if (err) return initiativeNew(ctx, err, v);
  const now = nowIso();
  const r = run(
    'INSERT INTO initiatives(name, description, icon, audience, start_date, end_date, status, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    v.name, v.description, v.icon, v.audience, v.start_date || null, v.end_date || null, v.status, v.sort_order, now, now,
  );
  audit(ctx.user!.id, 'initiative.create', String(r.lastInsertRowid), ctx.ip);
  back(ctx, '/admin/initiatives', 'created');
}

export function initiativeEdit(ctx: Ctx, err?: string, v?: Record<string, any>) {
  const i = get('SELECT * FROM initiatives WHERE id = ?', idParam(ctx));
  if (!i) return notFound(ctx);
  adminPage(ctx, { title: 'تعديل مبادرة', active: 'initiatives', status: err ? 422 : 200, body: html`<h2>تعديل المبادرة</h2>${formBody(ctx, `/admin/initiatives/${i.id}/edit`, v ?? i, err)}` });
}

export function initiativeUpdate(ctx: Ctx) {
  const i = get('SELECT id FROM initiatives WHERE id = ?', idParam(ctx));
  if (!i) return notFound(ctx);
  const { v, err } = read(ctx);
  if (err) return initiativeEdit(ctx, err, v);
  run(
    'UPDATE initiatives SET name=?, description=?, icon=?, audience=?, start_date=?, end_date=?, status=?, sort_order=?, updated_at=? WHERE id=?',
    v.name, v.description, v.icon, v.audience, v.start_date || null, v.end_date || null, v.status, v.sort_order, nowIso(), i.id as number,
  );
  audit(ctx.user!.id, 'initiative.update', String(i.id), ctx.ip);
  back(ctx, '/admin/initiatives', 'saved');
}

export function initiativeDelete(ctx: Ctx) {
  const i = get('SELECT id FROM initiatives WHERE id = ?', idParam(ctx));
  if (!i) return notFound(ctx);
  run('DELETE FROM initiatives WHERE id = ?', i.id as number);
  audit(ctx.user!.id, 'initiative.delete', String(i.id), ctx.ip);
  back(ctx, '/admin/initiatives', 'deleted');
}
