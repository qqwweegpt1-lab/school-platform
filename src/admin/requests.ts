import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { config, KINDS, STATUS_LABELS, type Kind } from '../config.ts';
import { all, audit, get, nowIso, run, tx } from '../db.ts';
import { serveFile } from '../files.ts';
import { esc, fmtDate, fmtDateTime, html, raw } from '../html.ts';
import { redirect } from '../http.ts';
import type { Ctx } from '../http.ts';
import { csrfInput, icon, statusBadge, alertBox, empty } from '../ui.ts';
import { adminPage, allowedKinds, back, forbidden, pager } from './ui.ts';
import { notFound } from '../pages/public.ts';

const PAGE_SIZE = 25;
const likeEsc = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m);

export function requestsList(ctx: Ctx) {
  const allowed = allowedKinds(ctx);
  const q = ctx.url.searchParams;
  const kind = q.get('kind') ?? '';
  const status = q.get('status') ?? '';
  const term = (q.get('q') ?? '').trim().slice(0, 60);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.get('from') ?? '') ? q.get('from')! : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.get('to') ?? '') ? q.get('to')! : '';
  const page = Math.max(1, parseInt(q.get('page') ?? '1', 10) || 1);

  const kinds: Kind[] = kind && (allowed as string[]).includes(kind) ? [kind as Kind] : allowed;
  const where: string[] = [`kind IN (${kinds.map(() => '?').join(',')})`];
  const params: (string | number)[] = [...kinds];
  const statusOk = status && Object.keys(STATUS_LABELS).includes(status);
  if (statusOk) {
    where.push('status = ?');
    params.push(status);
  }
  if (term) {
    const l = `%${likeEsc(term)}%`;
    where.push("(ticket_no LIKE ? ESCAPE '\\' OR student_name LIKE ? ESCAPE '\\' OR subject LIKE ? ESCAPE '\\' OR submitter_name LIKE ? ESCAPE '\\')");
    params.push(l, l, l, l);
  }
  if (from) {
    where.push("date(created_at, '+3 hours') >= ?");
    params.push(from);
  }
  if (to) {
    where.push("date(created_at, '+3 hours') <= ?");
    params.push(to);
  }
  const W = where.join(' AND ');
  const total = Number(get(`SELECT COUNT(*) AS c FROM requests WHERE ${W}`, ...params)!.c);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = all(
    `SELECT id, ticket_no, kind, status, student_name, subject, submitter_name, event_date, created_at, updated_at, is_demo
       FROM requests WHERE ${W} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    ...params,
    PAGE_SIZE,
    (Math.min(page, pages) - 1) * PAGE_SIZE,
  );

  const keep = new URLSearchParams();
  if (kind) keep.set('kind', kind);
  if (statusOk) keep.set('status', status);
  if (term) keep.set('q', term);
  if (from) keep.set('from', from);
  if (to) keep.set('to', to);
  const base = '/admin/requests' + (keep.toString() ? '?' + keep.toString() : '');

  const statusOpts = [...new Set(kinds.flatMap((k) => KINDS[k].statuses))];
  const body = html`<h2>${kind && KINDS[kind as Kind] ? KINDS[kind as Kind].label : 'جميع الطلبات'}</h2>
    <form class="toolbar" method="get" action="/admin/requests">
      <div class="field"><label for="fk">النوع</label><select id="fk" name="kind"><option value="">الكل</option>${allowed.map((k) => html`<option value="${k}"${k === kind ? raw(' selected') : ''}>${KINDS[k].label}</option>`)}</select></div>
      <div class="field"><label for="fs">الحالة</label><select id="fs" name="status"><option value="">الكل</option>${statusOpts.map((s) => html`<option value="${s}"${s === status ? raw(' selected') : ''}>${STATUS_LABELS[s]}</option>`)}</select></div>
      <div class="field"><label for="ff">من تاريخ</label><input id="ff" type="date" name="from" value="${from}"></div>
      <div class="field"><label for="ft">إلى تاريخ</label><input id="ft" type="date" name="to" value="${to}"></div>
      <div class="field"><label for="fq">بحث</label><input id="fq" type="search" name="q" value="${term}" placeholder="رقم/اسم/موضوع"></div>
      <button class="btn btn-primary btn-sm" type="submit">تصفية</button>
      <a class="btn btn-ghost btn-sm" href="/admin/requests">إعادة ضبط</a>
    </form>
    <p class="hint">النتائج: ${total}</p>
    ${rows.length
      ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>الرقم</th><th>النوع</th><th>الاسم / الموضوع</th><th>التاريخ المعني</th><th>الحالة</th><th>أُنشئ</th><th>آخر تحديث</th><th></th></tr></thead><tbody>
        ${rows.map(
          (r) => html`<tr>
          <td dir="ltr" class="ltr-start">${r.ticket_no}${r.is_demo ? html` <span class="badge b-demo">تجريبي</span>` : ''}</td>
          <td>${KINDS[r.kind as Kind].label}</td>
          <td>${r.student_name || r.subject || r.submitter_name || '—'}</td>
          <td>${r.event_date ? fmtDate(r.event_date) : '—'}</td>
          <td>${statusBadge(r.status)}</td>
          <td>${fmtDateTime(r.created_at)}</td>
          <td>${fmtDateTime(r.updated_at)}</td>
          <td><a class="btn btn-soft btn-sm" href="/admin/requests/${r.id}">فتح</a></td></tr>`,
        )}</tbody></table></div>${pager(base, Math.min(page, pages), pages)}`
      : empty('لا توجد طلبات مطابقة.', 'inbox')}`;
  adminPage(ctx, { title: 'الطلبات', active: kind ? `req:${kind}` : 'requests', body });
}

function loadAllowed(ctx: Ctx) {
  const r = get('SELECT * FROM requests WHERE id = ?', Number(ctx.params.id) || 0);
  if (!r) return { r: null, deny: false };
  if (!(allowedKinds(ctx) as string[]).includes(r.kind as string)) return { r: null, deny: true };
  return { r, deny: false };
}

const FIELD_LABELS: [string, string][] = [
  ['student_name', 'اسم الطالبة'],
  ['grade', 'الصف'],
  ['class_name', 'الفصل / الشعبة'],
  ['submitter_type', 'مقدّم الطلب'],
  ['submitter_name', 'الاسم'],
  ['contact', 'وسيلة التواصل'],
  ['category', 'التصنيف'],
  ['event_date', 'التاريخ'],
  ['event_time', 'الوقت'],
  ['rating', 'التقييم'],
];

export function requestDetail(ctx: Ctx) {
  const { r, deny } = loadAllowed(ctx);
  if (deny) return forbidden(ctx);
  if (!r) return notFound(ctx);
  const id = r.id as number;
  const kind = r.kind as Kind;
  const atts = all('SELECT * FROM attachments WHERE request_id = ? ORDER BY id', id);
  const notes = all('SELECT n.*, u.display_name FROM request_notes n LEFT JOIN users u ON u.id = n.user_id WHERE request_id = ? ORDER BY n.id DESC', id);
  const hist = all('SELECT h.*, u.display_name FROM status_history h LEFT JOIN users u ON u.id = h.user_id WHERE request_id = ? ORDER BY h.id DESC', id);
  const isAdmin = ctx.user!.role === 'admin';

  const body = html`<p><a href="/admin/requests?kind=${kind}">← العودة إلى القائمة</a></p>
  <h2>${KINDS[kind].label} <span dir="ltr" class="chip">${r.ticket_no}</span> ${statusBadge(r.status as string)}</h2>
  <div class="two-col">
    <div class="stack">
      <div class="card">
        <dl class="kv">
          ${FIELD_LABELS.filter(([k]) => r[k] !== null && r[k] !== '').map(([k, label]) => html`<dt>${label}</dt><dd>${k === 'event_date' ? fmtDate(r[k] as string) : String(r[k])}</dd>`)}
          ${r.subject ? html`<dt>الموضوع</dt><dd>${r.subject}</dd>` : ''}
          ${kind === 'student_voice' ? html`<dt>رسالة خاصة فقط</dt><dd>${r.is_private ? 'نعم' : 'لا'}</dd>` : ''}
          <dt>تاريخ الإنشاء</dt><dd>${fmtDateTime(r.created_at as string)}</dd>
          <dt>آخر تحديث</dt><dd>${fmtDateTime(r.updated_at as string)}</dd>
        </dl>
        ${r.body ? html`<h3 class="mt18">${kind === 'absence' ? 'سبب الغياب' : kind === 'late' ? 'سبب التأخر' : kind === 'permission' ? 'سبب الاستئذان' : 'النص'}</h3><div class="pre">${r.body}</div>` : ''}
        ${r.notes ? html`<h3 class="mt18">ملاحظات إضافية</h3><div class="pre">${r.notes}</div>` : ''}
      </div>
      <div class="card"><h3>${icon('clip')} المرفقات</h3>
        ${atts.length
          ? html`<ul>${atts.map((a) => html`<li><a href="/admin/attachments/${a.id}">${a.orig_name}</a> <small>(${(Number(a.size) / 1024).toFixed(0)} ك.ب)</small></li>`)}</ul>`
          : html`<p class="hint">لا توجد مرفقات.</p>`}
      </div>
      <div class="card"><h3>سجل تغيير الحالة</h3>
        <ol class="timeline">${hist.map((h) => html`<li><strong>${STATUS_LABELS[h.to_status as string] ?? h.to_status}</strong>
          <div class="meta">${fmtDateTime(h.created_at as string)}${h.display_name ? html` — ${h.display_name}` : ' — النظام'}</div>${h.note ? html`<div>${h.note}</div>` : ''}</li>`)}</ol>
      </div>
    </div>
    <div class="stack">
      <form class="card" method="post" action="/admin/requests/${id}/status">${csrfInput(ctx)}
        <h3>تغيير الحالة</h3>
        <div class="field full"><label for="st">الحالة</label><select id="st" name="status">${KINDS[kind].statuses.map((s) => html`<option value="${s}"${s === r.status ? raw(' selected') : ''}>${STATUS_LABELS[s]}</option>`)}</select></div>
        <div class="field full mt16"><label for="pn">ملاحظة تظهر لمقدّم الطلب عند المتابعة (اختياري)</label><textarea id="pn" name="public_note" rows="3" maxlength="500">${r.public_note ?? ''}</textarea>
          <p class="hint">لا تكتبوا هنا معلومات حساسة؛ هذه الملاحظة يراها من يملك الرقم والرمز.</p></div>
        <button class="btn btn-primary mt16" type="submit">حفظ الحالة</button>
      </form>
      <div class="card"><h3>ملاحظات إدارية داخلية</h3>
        <form method="post" action="/admin/requests/${id}/note">${csrfInput(ctx)}
          <div class="field full"><label for="nn" class="hint">لا تظهر لمقدّم الطلب</label><textarea id="nn" name="note" rows="3" maxlength="1000" required></textarea></div>
          <button class="btn btn-soft btn-sm mt16" type="submit">إضافة ملاحظة</button></form>
        <div class="mt16">${notes.length ? notes.map((n) => html`<div class="note">${n.note}<small>${n.display_name ?? '—'} — ${fmtDateTime(n.created_at as string)}</small></div>`) : html`<p class="hint">لا توجد ملاحظات.</p>`}</div>
      </div>
      ${isAdmin
        ? html`<form class="card" method="post" action="/admin/requests/${id}/delete" data-confirm="سيتم حذف الطلب ومرفقاته نهائيًا. هل أنتم متأكدون؟">${csrfInput(ctx)}
            <h3>حذف الطلب</h3><p class="hint">حذف نهائي للطلب وسجله ومرفقاته.</p><button class="btn btn-danger btn-sm" type="submit">${icon('trash')} حذف نهائيًا</button></form>`
        : ''}
    </div>
  </div>`;
  adminPage(ctx, { title: `طلب ${r.ticket_no}`, active: `req:${kind}`, body });
}

export function changeStatus(ctx: Ctx) {
  const { r, deny } = loadAllowed(ctx);
  if (deny) return forbidden(ctx);
  if (!r) return notFound(ctx);
  const kind = r.kind as Kind;
  const status = ctx.fields.status ?? '';
  if (!KINDS[kind].statuses.includes(status)) return redirect(ctx, `/admin/requests/${r.id}`);
  const note = (ctx.fields.public_note ?? '').trim().slice(0, 500);
  const now = nowIso();
  tx(() => {
    run('UPDATE requests SET status = ?, public_note = ?, updated_at = ? WHERE id = ?', status, note || null, now, r.id as number);
    if (status !== r.status || note !== (r.public_note ?? '')) {
      run('INSERT INTO status_history(request_id, from_status, to_status, user_id, note, created_at) VALUES (?,?,?,?,?,?)', r.id as number, r.status as string, status, ctx.user!.id, note || null, now);
    }
  });
  audit(ctx.user!.id, 'request.status', `${r.ticket_no}:${status}`, ctx.ip);
  back(ctx, `/admin/requests/${r.id}`, 'status');
}

export function addNote(ctx: Ctx) {
  const { r, deny } = loadAllowed(ctx);
  if (deny) return forbidden(ctx);
  if (!r) return notFound(ctx);
  const note = (ctx.fields.note ?? '').trim().slice(0, 1000);
  if (note) {
    run('INSERT INTO request_notes(request_id, user_id, note, created_at) VALUES (?,?,?,?)', r.id as number, ctx.user!.id, note, nowIso());
    run('UPDATE requests SET updated_at = ? WHERE id = ?', nowIso(), r.id as number);
  }
  back(ctx, `/admin/requests/${r.id}`, 'note');
}

export function deleteRequest(ctx: Ctx) {
  const { r, deny } = loadAllowed(ctx);
  if (deny) return forbidden(ctx);
  if (!r) return notFound(ctx);
  const atts = all('SELECT stored_name FROM attachments WHERE request_id = ?', r.id as number);
  run('DELETE FROM requests WHERE id = ?', r.id as number);
  for (const a of atts) {
    try {
      unlinkSync(path.join(config.attachmentsDir, a.stored_name as string));
    } catch {
      /* الملف غير موجود */
    }
  }
  audit(ctx.user!.id, 'request.delete', r.ticket_no as string, ctx.ip);
  back(ctx, '/admin/requests', 'deleted');
}

/** تنزيل مرفق: يتطلب تسجيل دخول وصلاحية على نوع الطلب المرتبط */
export function downloadAttachment(ctx: Ctx) {
  const a = get(
    'SELECT a.*, r.kind FROM attachments a JOIN requests r ON r.id = a.request_id WHERE a.id = ?',
    Number(ctx.params.id) || 0,
  );
  if (!a) return notFound(ctx);
  if (!(allowedKinds(ctx) as string[]).includes(a.kind as string)) return forbidden(ctx);
  const ok = serveFile(ctx, path.join(config.attachmentsDir, a.stored_name as string), a.mime as string, { download: a.orig_name as string });
  if (!ok) return notFound(ctx);
  audit(ctx.user!.id, 'attachment.download', String(a.id), ctx.ip);
}

export { esc, alertBox };
