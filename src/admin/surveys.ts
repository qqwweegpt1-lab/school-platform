import { all, audit, get, nowIso, run } from '../db.ts';
import { fmtDate, html, type Safe } from '../html.ts';
import type { Ctx } from '../http.ts';
import { notFound } from '../pages/public.ts';
import { alertBox, csrfInput, empty, icon } from '../ui.ts';
import { adminPage, back, fArea, fSelect, fText } from './ui.ts';
import { idParam, str } from './util.ts';

export function surveysList(ctx: Ctx) {
  const rows = all('SELECT s.*, (SELECT COUNT(*) FROM survey_items i WHERE i.survey_id = s.id) AS n FROM surveys s ORDER BY s.id DESC');
  adminPage(ctx, {
    title: 'نتائج الاستبانات',
    active: 'surveys',
    body: html`<h2>نتائج الاستبانات المنشورة</h2>
    ${alertBox('info', 'تُدخل هنا نتائج مجمّعة فقط (عدد الأصوات لكل خيار) بعد إعدادها من الاستبانات الفعلية للمدرسة. لا تُدخلوا أسماء أو إجابات فردية. ولا تُعرض الاستبانة للعامة إلا بعد اختيار «منشورة».')}
    <p><a class="btn btn-primary" href="/admin/surveys/new">${icon('plus')} استبانة جديدة</a></p>
    ${rows.length
      ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>العنوان</th><th>الحالة</th><th>المشاركات</th><th>الخيارات</th><th>إجراءات</th></tr></thead><tbody>
      ${rows.map(
        (s) => html`<tr><td>${s.title}</td><td><span class="badge ${s.status === 'published' ? 'b-ok' : 'b-mute'}">${s.status === 'published' ? 'منشورة' : 'مسودة'}</span></td>
        <td>${s.participants ?? '—'}</td><td>${s.n}</td>
        <td class="actions"><a class="btn btn-soft btn-sm" href="/admin/surveys/${s.id}/edit">تعديل وإدخال النتائج</a>
        <form method="post" action="/admin/surveys/${s.id}/delete" data-confirm="حذف الاستبانة ونتائجها نهائيًا؟" style="display:inline">${csrfInput(ctx)}<button class="btn btn-danger btn-sm" type="submit">حذف</button></form></td></tr>`,
      )}</tbody></table></div>`
      : empty('لا توجد استبانات منشورة حاليًا.', 'chart')}`,
  });
}

function formBody(ctx: Ctx, action: string, v: Record<string, any>, err?: string): Safe {
  return html`<form class="card form" method="post" action="${action}" data-guard>
    ${err ? alertBox('err', err) : ''}${csrfInput(ctx)}
    <div class="grid-form">
      ${fText('عنوان الاستبانة', 'title', v.title, { required: true, max: 150 })}
      ${fArea('وصف مختصر (اختياري)', 'description', v.description, { max: 800, rows: 3 })}
      ${fText('عدد المشاركات (اختياري)', 'participants', v.participants, { type: 'number' })}
      ${fSelect('الحالة', 'status', v.status ?? 'draft', [{ value: 'draft', label: 'مسودة (غير منشورة)' }, { value: 'published', label: 'منشورة' }], { required: true })}
    </div>
    <button class="btn btn-primary mt16" type="submit">حفظ</button> <a class="btn btn-ghost mt16" href="/admin/surveys">إلغاء</a>
  </form>`;
}

export function surveyNew(ctx: Ctx, err?: string, v: Record<string, any> = {}) {
  adminPage(ctx, { title: 'استبانة جديدة', active: 'surveys', status: err ? 422 : 200, body: html`<h2>استبانة جديدة</h2>${formBody(ctx, '/admin/surveys/new', v, err)}` });
}

function read(ctx: Ctx) {
  const pRaw = str(ctx, 'participants', 7);
  const v = { title: str(ctx, 'title', 150), description: str(ctx, 'description', 800), participants: pRaw, status: str(ctx, 'status', 10) };
  let err = '';
  if (!v.title) err = 'عنوان الاستبانة مطلوب.';
  else if (!['draft', 'published'].includes(v.status)) err = 'حالة غير صحيحة.';
  else if (pRaw && !/^\d{1,7}$/.test(pRaw)) err = 'عدد المشاركات يجب أن يكون رقمًا صحيحًا.';
  return { v, err, participants: pRaw ? Number(pRaw) : null };
}

export function surveyCreate(ctx: Ctx) {
  const { v, err, participants } = read(ctx);
  if (err) return surveyNew(ctx, err, v);
  const now = nowIso();
  const r = run('INSERT INTO surveys(title, description, participants, status, published_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', v.title, v.description || null, participants, v.status, v.status === 'published' ? now : null, now, now);
  audit(ctx.user!.id, 'survey.create', String(r.lastInsertRowid), ctx.ip);
  back(ctx, `/admin/surveys/${r.lastInsertRowid}/edit`, 'created');
}

export function surveyEdit(ctx: Ctx, err?: string, v?: Record<string, any>) {
  const s = get('SELECT * FROM surveys WHERE id = ?', idParam(ctx));
  if (!s) return notFound(ctx);
  const items = all('SELECT * FROM survey_items WHERE survey_id = ? ORDER BY sort_order, id', s.id as number);
  const questions = [...new Set(items.map((i) => String(i.question)))];
  adminPage(ctx, {
    title: 'تعديل استبانة',
    active: 'surveys',
    status: err ? 422 : 200,
    body: html`<h2>تعديل الاستبانة</h2>${formBody(ctx, `/admin/surveys/${s.id}/edit`, v ?? s, err)}
    <div class="card mt22"><h3>نتائج الاستبانة (مجمّعة)</h3>
      ${items.length
        ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>السؤال</th><th>الخيار</th><th>عدد الأصوات</th><th></th></tr></thead><tbody>
        ${items.map(
          (i) => html`<tr><td>${i.question}</td><td>${i.option_label}</td><td>${i.votes}</td>
          <td><form method="post" action="/admin/surveys/${s.id}/items/${i.id}/delete" style="display:inline">${csrfInput(ctx)}<button class="btn btn-danger btn-sm" type="submit">حذف</button></form></td></tr>`,
        )}</tbody></table></div>`
        : html`<p class="hint">لم تُضف نتائج بعد. أضيفوا الخيارات وعدد الأصوات الفعلي لكل سؤال.</p>`}
      <form class="form mt16" method="post" action="/admin/surveys/${s.id}/items" data-guard>${csrfInput(ctx)}
        <div class="grid-form">
          <div class="field full"><label for="a_question">السؤال</label><input id="a_question" name="question" list="qs" required maxlength="200"><datalist id="qs">${questions.map((q) => html`<option value="${q}"></option>`)}</datalist></div>
          <div class="field half"><label for="a_option_label">الخيار</label><input id="a_option_label" name="option_label" required maxlength="150"></div>
          <div class="field half"><label for="a_votes">عدد الأصوات</label><input id="a_votes" name="votes" type="number" min="0" max="1000000" required></div>
        </div>
        <button class="btn btn-soft mt16" type="submit">${icon('plus')} إضافة نتيجة</button>
      </form>
      <p class="hint">يظهر نشر الاستبانة للعامة حين تكون حالتها «منشورة». ${s.published_at ? `نُشرت بتاريخ ${fmtDate(s.published_at as string)}.` : ''}</p>
    </div>`,
  });
}

export function surveyUpdate(ctx: Ctx) {
  const s = get('SELECT * FROM surveys WHERE id = ?', idParam(ctx));
  if (!s) return notFound(ctx);
  const { v, err, participants } = read(ctx);
  if (err) return surveyEdit(ctx, err, v);
  const now = nowIso();
  const pub = v.status === 'published' ? ((s.published_at as string) ?? now) : (s.published_at as string | null);
  run('UPDATE surveys SET title=?, description=?, participants=?, status=?, published_at=?, updated_at=? WHERE id=?', v.title, v.description || null, participants, v.status, pub, now, s.id as number);
  audit(ctx.user!.id, 'survey.update', String(s.id), ctx.ip);
  back(ctx, `/admin/surveys/${s.id}/edit`, 'saved');
}

export function surveyItemAdd(ctx: Ctx) {
  const s = get('SELECT id FROM surveys WHERE id = ?', idParam(ctx));
  if (!s) return notFound(ctx);
  const q = str(ctx, 'question', 200);
  const o = str(ctx, 'option_label', 150);
  const votes = str(ctx, 'votes', 8);
  if (!q || !o || !/^\d{1,7}$/.test(votes)) return surveyEdit(ctx, 'السؤال والخيار وعدد الأصوات (رقم صحيح) مطلوبة.');
  const order = Number(get('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM survey_items WHERE survey_id = ?', s.id as number)!.n);
  run('INSERT INTO survey_items(survey_id, question, option_label, votes, sort_order) VALUES (?,?,?,?,?)', s.id as number, q, o, Number(votes), order);
  run('UPDATE surveys SET updated_at=? WHERE id=?', nowIso(), s.id as number);
  back(ctx, `/admin/surveys/${s.id}/edit`, 'created');
}

export function surveyItemDelete(ctx: Ctx) {
  const sid = idParam(ctx);
  run('DELETE FROM survey_items WHERE id = ? AND survey_id = ?', Number(ctx.params.item) || 0, sid);
  back(ctx, `/admin/surveys/${sid}/edit`, 'deleted');
}

export function surveyDelete(ctx: Ctx) {
  const s = get('SELECT id FROM surveys WHERE id = ?', idParam(ctx));
  if (!s) return notFound(ctx);
  run('DELETE FROM surveys WHERE id = ?', s.id as number);
  audit(ctx.user!.id, 'survey.delete', String(s.id), ctx.ip);
  back(ctx, '/admin/surveys', 'deleted');
}
