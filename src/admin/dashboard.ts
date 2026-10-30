import { KINDS, type Kind } from '../config.ts';
import { all, get } from '../db.ts';
import { fmtDateTime, html } from '../html.ts';
import type { Ctx } from '../http.ts';
import { alertBox, csrfInput, empty, icon, statusBadge } from '../ui.ts';
import { adminPage, allowedKinds } from './ui.ts';

const OPEN = ['received', 'new', 'in_review', 'needs_info', 'under_study'];

export function dashboard(ctx: Ctx) {
  const kinds = allowedKinds(ctx);
  const ph = kinds.map(() => '?').join(',');
  const counts = all(
    `SELECT kind, COUNT(*) AS total, SUM(CASE WHEN status IN (${OPEN.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS open
       FROM requests WHERE kind IN (${ph}) GROUP BY kind`,
    ...OPEN,
    ...kinds,
  );
  const by = new Map(counts.map((c) => [c.kind as string, c]));
  const recent = all(
    `SELECT id, ticket_no, kind, status, student_name, subject, created_at FROM requests WHERE kind IN (${ph}) ORDER BY created_at DESC, id DESC LIMIT 8`,
    ...kinds,
  );
  const isAdmin = ctx.user!.role === 'admin';
  const demoCount = Number(
    get(
      `SELECT (SELECT COUNT(*) FROM requests WHERE is_demo=1) + (SELECT COUNT(*) FROM announcements WHERE is_demo=1)
            + (SELECT COUNT(*) FROM initiatives WHERE is_demo=1) AS c`,
    )!.c,
  );
  const drafts = Number(get("SELECT COUNT(*) AS c FROM announcements WHERE status='draft'")!.c);

  const body = html`<h2>لوحة المتابعة</h2>
    ${isAdmin && demoCount
      ? html`<div class="alert alert-warn" role="status">${icon('alert')}<div>توجد <strong>${demoCount}</strong> عناصر تجريبية في النظام.
          <form method="post" action="/admin/demo/clear" data-confirm="سيتم حذف جميع البيانات التجريبية نهائيًا. هل أنتم متأكدون؟" style="display:inline">${csrfInput(ctx)}
          <button class="btn btn-soft btn-sm" type="submit">حذف البيانات التجريبية</button></form></div></div>`
      : ''}
    <div class="stat-grid">
      ${kinds.map((k: Kind) => {
        const c = by.get(k);
        const open = Number(c?.open ?? 0);
        return html`<a class="stat${open ? ' alertish' : ''}" href="/admin/requests?kind=${k}"><b>${open}</b><span>${KINDS[k].label} — بانتظار المعالجة (من ${Number(c?.total ?? 0)})</span></a>`;
      })}
      <a class="stat" href="/admin/announcements"><b>${drafts}</b><span>إعلانات مسودة</span></a>
    </div>
    <h3>أحدث الطلبات</h3>
    ${recent.length
      ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>الرقم</th><th>النوع</th><th>الاسم / الموضوع</th><th>الحالة</th><th>التاريخ</th><th></th></tr></thead><tbody>
        ${recent.map(
          (r) => html`<tr><td dir="ltr" class="ltr-start">${r.ticket_no}</td><td>${KINDS[r.kind as Kind].label}</td><td>${r.student_name || r.subject || '—'}</td>
          <td>${statusBadge(r.status as string)}</td><td>${fmtDateTime(r.created_at as string)}</td><td><a class="btn btn-soft btn-sm" href="/admin/requests/${r.id}">فتح</a></td></tr>`,
        )}</tbody></table></div>`
      : empty('لا توجد طلبات بعد.', 'inbox')}
    ${alertBox('info', 'لا ترسل المنصة رسائل نصية أو بريدًا إلكترونيًا حاليًا؛ يتابع أولياء الأمور حالة الطلب من صفحة المتابعة برقم الطلب والرمز السري.')}`;
  adminPage(ctx, { title: 'لوحة المتابعة', active: 'dash', body });
}
