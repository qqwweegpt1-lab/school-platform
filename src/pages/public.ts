import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { ANNOUNCEMENT_CATEGORIES, brand, config, KINDS, MEDIA_CATEGORIES, STATUS_LABELS } from '../config.ts';
import { all, get, getSetting } from '../db.ts';
import { FORMS, validateForm, type FormDef } from '../forms.ts';
import { esc, fmtDate, fmtDateTime, html, paragraphs, raw, Safe } from '../html.ts';
import { redirect, sendHtml, type Ctx } from '../http.ts';
import { serveFile } from '../files.ts';
import type { Route } from '../router.ts';
import { csrfField, rateLimit, rateLimitPeek, rateLimitReset } from '../security.ts';
import {
  findForTracking,
  publicHistory,
  publishedAnnouncements,
  publishedMedia,
  publishedVoices,
  submitRequest,
  surveysWithItems,
} from '../services.ts';
import { checkAttachment, type CheckedFile } from '../uploads.ts';
import {
  alertBox,
  demoBadge,
  empty,
  icon,
  layout,
  pageHero,
  renderForm,
  statusBadge,
  type FormState,
  type NavKey,
} from '../ui.ts';

const page = (ctx: Ctx, o: { title: string; active?: NavKey; body: Safe; description?: string }, status = 200, noStore = false) =>
  sendHtml(ctx, layout({ ctx, ...o }), status, noStore);

export function notFound(ctx: Ctx) {
  page(
    ctx,
    {
      title: 'الصفحة غير موجودة',
      body: html`${pageHero('الصفحة غير موجودة', 'تعذّر العثور على الصفحة المطلوبة.', 'alert')}
        <div class="container content narrow"><div class="card"><p>ربما تغيّر الرابط أو لم تعد الصفحة متاحة.</p><a class="btn btn-primary" href="/">العودة إلى الرئيسية</a></div></div>`,
    },
    404,
  );
}

export function serverError(ctx: Ctx) {
  page(
    ctx,
    {
      title: 'حدث خطأ',
      body: html`${pageHero('حدث خطأ غير متوقع', 'نعتذر عن ذلك. لم تُحفظ أي بيانات في هذه العملية.', 'alert')}
        <div class="container content narrow"><div class="card"><p>يرجى المحاولة مرة أخرى بعد قليل.</p><a class="btn btn-primary" href="/">العودة إلى الرئيسية</a></div></div>`,
    },
    500,
    true,
  );
}

// ───────── الرئيسية ─────────
function homePage(ctx: Ctx) {
  const intro = getSetting('intro_text', brand.defaultIntro);
  const wTitle = getSetting('welcome_title', brand.defaultWelcomeTitle);
  const wText = getSetting('welcome_text', brand.defaultWelcomeText);
  const latest = publishedAnnouncements().slice(0, 3);

  const svc = (href: string, ic: string, title: string, desc: string, pink = false) => html`
    <a class="svc reveal${pink ? ' pink' : ''}" href="${href}">
      <span class="svc-ico">${icon(ic)}</span>
      <span><h4>${title}</h4><p>${desc}</p></span>
    </a>`;

  const body = html`
  <section class="hero"><div class="container">
    <div class="hero-card">
      <div>
        <p class="chip">${brand.supervisorRole}</p>
        <h2>${wTitle}</h2>
        <p class="lead">${wText}</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="#services">استعراض الخدمات</a>
          <a class="btn btn-ghost btn-lg" href="/announcements">إعلانات المدرسة</a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <span class="center-ring"></span>
        <span class="bubble b1">${icon('book')}</span>
        <span class="bubble b2">${icon('heart')}</span>
        <span class="bubble b3">${icon('users')}</span>
      </div>
    </div>
  </div></section>

  <section class="section"><div class="container">
    <div class="about reveal"><h3>عن المنصة</h3><p>${intro}</p></div>
  </div></section>

  <section class="section" id="services"><div class="container">
    <div class="section-title"><h3>خدمات ولي الأمر</h3><span class="bar"></span></div>
    <div class="grid cols-4">
      ${svc('/notices/absence', 'absence', 'إشعار غياب', 'إبلاغ المدرسة بغياب الطالبة مع إمكانية إرفاق عذر.')}
      ${svc('/notices/late', 'clock', 'إشعار تأخر', 'إبلاغ المدرسة بتأخر الطالبة وسببه.')}
      ${svc('/notices/permission', 'door', 'طلب استئذان', 'طلب خروج الطالبة أثناء الدوام لسبب مبرَّر.')}
      ${svc('/track', 'search', 'متابعة حالة طلب', 'تابعوا طلبكم برقمه ورمز المتابعة.', true)}
    </div>
  </div></section>

  <section class="section"><div class="container">
    <div class="section-title"><h3>المشاركة والتواصل</h3><span class="bar"></span></div>
    <div class="grid cols-4">
      ${svc('/student-voice', 'voice', 'صوت الطالبة', 'شاركي رأيكِ وأفكاركِ بأسلوب راقٍ ومحترم.', true)}
      ${svc('/parents-opinions', 'users', 'آراء أولياء الأمور', 'رأيكم يساعدنا على تطوير الخدمات.')}
      ${svc('/suggestions', 'bulb', 'المقترحات', 'أرسلوا مقترحاتكم لتطوير البيئة المدرسية.')}
      ${svc('/complaints', 'shield', 'الشكاوى', 'قناة سرّية ومنظمة لاستقبال الشكاوى.', true)}
    </div>
  </div></section>

  <section class="section"><div class="container">
    <div class="section-title"><h3>المبادرات والمستجدات</h3><span class="bar"></span></div>
    <div class="grid cols-3">
      ${svc('/incentives', 'trophy', 'وسائل التحفيز', 'مبادرات تشجّع الانضباط والمواظبة والسلوك الإيجابي.')}
      ${svc('/surveys', 'chart', 'نتائج الاستبانات', 'الاطلاع على نتائج الاستبانات المنشورة.', true)}
      ${svc('/announcements', 'news', 'إعلانات المدرسة', 'آخر الأخبار والفعاليات والتنبيهات.')}
    </div>
  </div></section>

  <section class="section"><div class="container">
    <div class="section-title"><h3>آخر الإعلانات</h3><span class="bar"></span></div>
    ${latest.length
      ? html`<div class="grid cols-3">${latest.map(announcementCard)}</div>
          <p class="mt16"><a class="btn btn-soft" href="/announcements">عرض جميع الإعلانات</a></p>`
      : empty('لا توجد إعلانات منشورة حاليًا.', 'news')}
  </div></section>`;
  page(ctx, { title: '', active: 'home', body });
}

function isNew(iso: string | null) {
  return !!iso && Date.now() - new Date(iso).getTime() < 7 * 86400000;
}

export function announcementCard(a: Record<string, any>): Safe {
  const excerpt = String(a.body).replace(/\s+/g, ' ').slice(0, 130);
  return html`<a class="ann reveal" href="/announcements/${a.id}">
    <div class="meta">
      <span class="chip">${a.category}</span>
      ${isNew(a.published_at) ? html`<span class="badge badge-new">جديد</span>` : ''}
      ${a.pinned ? html`<span class="badge b-info">مثبّت</span>` : ''}
      ${demoBadge(a.is_demo)}
    </div>
    <h4>${a.title}</h4>
    <p>${excerpt}${String(a.body).length > 130 ? '…' : ''}</p>
    <div class="meta">${icon('calendar', 'ico')}<span>${fmtDate(a.published_at)}</span>${a.event_date ? html`<span>• موعد الفعالية: ${fmtDate(a.event_date)}</span>` : ''}</div>
  </a>`;
}

// ───────── إشعارات ولي الأمر (الصفحة التعريفية) ─────────
function noticesHub(ctx: Ctx) {
  const card = (href: string, ic: string, t: string, d: string, pink = false) => html`
    <a class="svc${pink ? ' pink' : ''}" href="${href}"><span class="svc-ico">${icon(ic)}</span><span><h4>${t}</h4><p>${d}</p></span></a>`;
  page(ctx, {
    title: 'إشعارات ولي الأمر',
    active: 'notices',
    body: html`${pageHero('إشعارات ولي الأمر', 'اختاروا الخدمة المناسبة، ثم عبّئوا النموذج الخاص بها.', 'bell')}
    <div class="container content">
      <div class="grid cols-3">
        ${card('/notices/absence', 'absence', 'إشعار الغياب', 'لإبلاغ المدرسة بغياب الطالبة وسببه مع إرفاق عذر عند الحاجة.')}
        ${card('/notices/late', 'clock', 'إشعار التأخر', 'لإبلاغ المدرسة بتأخر الطالبة عن الطابور أو الحصة الأولى.', true)}
        ${card('/notices/permission', 'door', 'طلب الاستئذان', 'لطلب خروج الطالبة أثناء الدوام؛ الموافقة تخضع لإجراءات المدرسة.')}
      </div>
      <div class="card mt22">
        <h3>${icon('search')} هل قدّمتم طلبًا سابقًا؟</h3>
        <p>أدخلوا الرقم المرجعي ورمز المتابعة اللذين ظهرا لكم عند الإرسال لمعرفة حالة الطلب.</p>
        <a class="btn btn-primary" href="/track">متابعة حالة طلب</a>
      </div>
    </div>`,
  });
}

// ───────── النماذج العامة ─────────
const FORM_PATHS: Record<string, { path: string; nav: NavKey; icon: string; crumbs?: { href: string; label: string }[] }> = {
  absence: { path: '/notices/absence', nav: 'notices', icon: 'absence', crumbs: [{ href: '/notices', label: 'إشعارات ولي الأمر' }] },
  late: { path: '/notices/late', nav: 'notices', icon: 'clock', crumbs: [{ href: '/notices', label: 'إشعارات ولي الأمر' }] },
  permission: { path: '/notices/permission', nav: 'notices', icon: 'door', crumbs: [{ href: '/notices', label: 'إشعارات ولي الأمر' }] },
  suggestion: { path: '/suggestions', nav: 'suggestions', icon: 'bulb' },
  complaint: { path: '/complaints', nav: 'complaints', icon: 'shield' },
  student_voice: { path: '/student-voice', nav: 'voice', icon: 'voice' },
  parent_opinion: { path: '/parents-opinions', nav: 'parents', icon: 'users' },
};

const newNonce = () => randomBytes(16).toString('hex');

function formPage(ctx: Ctx, def: FormDef, st: FormState, status = 200) {
  const meta = FORM_PATHS[def.kind];
  const extra =
    def.kind === 'student_voice'
      ? html`<div class="container content"><h3 class="reveal">${icon('star')} مشاركات الطالبات المنشورة</h3>${publishedVoicesBlock()}</div>`
      : html``;
  page(
    ctx,
    {
      title: def.title,
      active: meta.nav,
      body: html`${pageHero(def.title, def.intro, meta.icon, meta.crumbs)}
        <div class="container content narrow">${renderForm(ctx, def, st, meta.path)}</div>${extra}`,
    },
    status,
    status !== 200,
  );
}

function publishedVoicesBlock(): Safe {
  const items = publishedVoices();
  if (!items.length) return empty('لا توجد مشاركات منشورة حاليًا. تُنشر المشاركات بعد مراجعتها من الإدارة.', 'voice');
  return html`<div class="grid cols-3">${items.map(
    (v) => html`<article class="init reveal"><span class="chip">${v.category}</span><h4>${v.subject}</h4><p>${v.body}</p><div class="meta">${v.grade ?? ''}</div></article>`,
  )}</div>`;
}

function showForm(def: FormDef) {
  return (ctx: Ctx) => formPage(ctx, def, { values: {}, errors: {}, nonce: newNonce() });
}

function successPage(ctx: Ctx, def: FormDef, ticket: string, code: string | null, duplicate: boolean) {
  const meta = FORM_PATHS[def.kind];
  const body = duplicate
    ? html`<div class="container content narrow"><div class="card ticket-box">
        ${alertBox('info', 'تم استلام هذا الطلب مسبقًا ولم يُنشأ طلب مكرر.')}
        <p>الرقم المرجعي للطلب:</p><div class="ticket-big">${ticket}</div>
        <p class="hint">رمز المتابعة عُرض عند الإرسال الأول ولا يمكن إعادة عرضه حفاظًا على الخصوصية.</p>
        <div class="ticket-actions"><a class="btn btn-primary" href="/track">متابعة حالة طلب</a><a class="btn btn-ghost" href="/">الرئيسية</a></div>
      </div></div>`
    : html`<div class="container content narrow"><div class="card ticket-box">
        ${alertBox('ok', html`<strong>${def.success}</strong>`)}
        <div class="ticket-row"><p>الرقم المرجعي للطلب</p><div class="ticket-big" id="tk">${ticket}</div></div>
        <div class="ticket-row"><p>رمز المتابعة (سرّي)</p><div class="ticket-big secret" id="tc">${code}</div></div>
        ${alertBox('warn', html`<strong>احتفظوا بالرقمين معًا الآن.</strong> سيُطلبان منكم لمتابعة حالة الطلب، ولن يُعرض الرمز مرة أخرى. لا تشاركوه مع أحد.${def.kind === 'complaint' ? ' الشكاوى سرّية ولا يُعرض أي تفصيل منها دون الرقم والرمز.' : ''}`)}
        <p class="hint">لا تُرسل هذه المنصة رسائل نصية أو بريدًا إلكترونيًا حاليًا؛ تابعوا حالة الطلب من صفحة المتابعة.</p>
        <div class="ticket-actions no-print">
          <button class="btn btn-soft" type="button" data-copy="${ticket} / ${code}">${icon('copy')} نسخ الرقم والرمز</button>
          <button class="btn btn-soft" type="button" data-print>${icon('print')} طباعة</button>
          <a class="btn btn-primary" href="/track">متابعة حالة طلب</a>
          <a class="btn btn-ghost" href="/">الرئيسية</a>
        </div>
      </div></div>`;
  page(ctx, { title: 'تم الاستلام', active: meta.nav, body: html`${pageHero('تم حفظ الطلب', def.title, 'check', meta.crumbs)}${body}` }, 200, true);
}

function submitForm(def: FormDef) {
  return (ctx: Ctx) => {
    const f = ctx.fields;
    // فخ الروبوتات: حقل مخفي يجب أن يبقى فارغًا
    if (f.website) return redirect(ctx, '/');

    const nonce = /^[a-f0-9]{32}$/.test(f._nonce ?? '') ? f._nonce : '';
    const state: FormState = { values: {}, errors: {}, nonce: nonce || newNonce() };

    if (!rateLimit(`submit:${ctx.ip}`, config.submitLimitPerHour, 3600_000)) {
      state.formError = 'تم تجاوز عدد الطلبات المسموح به مؤقتًا. يرجى المحاولة لاحقًا.';
      return formPage(ctx, def, state, 429);
    }
    if (!nonce) {
      state.formError = 'انتهت صلاحية النموذج. تم تحديثه، يرجى مراجعة البيانات ثم إعادة الإرسال.';
      state.values = f;
      return formPage(ctx, def, state, 400);
    }

    const { values, errors } = validateForm(def, f);
    state.values = values;
    state.errors = errors;

    // المرفقات
    const checked: CheckedFile[] = [];
    const uploads = ctx.files.filter((x) => x.field === 'files');
    if (uploads.length > def.files) {
      state.fileError = def.files === 0 ? 'هذا النموذج لا يقبل مرفقات.' : `الحد الأقصى للمرفقات ${def.files}.`;
    } else {
      for (const u of uploads) {
        const r = checkAttachment(u);
        if ('error' in r) {
          state.fileError = r.error;
          break;
        }
        checked.push(r.ok);
      }
    }

    if (Object.keys(errors).length || state.fileError) {
      if (state.fileError || uploads.length) state.fileError = (state.fileError ?? '') + (uploads.length ? ' يرجى إعادة اختيار المرفقات.' : '');
      return formPage(ctx, def, state, 422);
    }

    try {
      const r = submitRequest(def, values, checked, nonce);
      successPage(ctx, def, r.ticket, r.code, r.duplicate);
    } catch (e) {
      console.error('submit failed:', (e as Error).message);
      state.formError = 'تعذّر حفظ الطلب حاليًا ولم تُحفظ أي بيانات. يرجى المحاولة مرة أخرى بعد قليل.';
      formPage(ctx, def, state, 500);
    }
  };
}

// ───────── متابعة حالة الطلب ─────────
function trackForm(ctx: Ctx, err?: string, values: { ticket?: string } = {}) {
  page(
    ctx,
    {
      title: 'متابعة حالة طلب',
      active: 'notices',
      body: html`${pageHero('متابعة حالة طلب', 'أدخلوا الرقم المرجعي ورمز المتابعة اللذين ظهرا لكم عند إرسال الطلب.', 'search', [{ href: '/notices', label: 'إشعارات ولي الأمر' }])}
      <div class="container content narrow">
        <form class="card form" method="post" action="/track" novalidate data-guard>
          ${err ? alertBox('err', err) : ''}
          <input type="hidden" name="_csrf" value="${ctxCsrf(ctx)}">
          <div class="grid-form">
            <div class="field full"><label for="ticket">الرقم المرجعي</label>
              <input id="ticket" name="ticket" type="text" dir="ltr" class="ltr-input" required autocomplete="off" maxlength="30" placeholder="ABS-2026-XXXXXX" value="${values.ticket ?? ''}"></div>
            <div class="field full"><label for="code">رمز المتابعة</label>
              <input id="code" name="code" type="text" dir="ltr" class="ltr-input" required autocomplete="off" maxlength="12" placeholder="XXXX-XXXX"></div>
          </div>
          <p class="privacy-note">${icon('lock')} لحماية الخصوصية لا تُعرض أي بيانات إلا بعد إدخال الرقم والرمز معًا.</p>
          <button type="submit" class="btn btn-primary btn-lg">عرض حالة الطلب</button>
        </form>
      </div>`,
    },
    err ? 400 : 200,
    true,
  );
}

const ctxCsrf = (ctx: Ctx) => esc(csrfField(ctx.csrfCookie));

function trackSubmit(ctx: Ctx) {
  const ticket = (ctx.fields.ticket ?? '').trim().toUpperCase().slice(0, 30);
  const code = (ctx.fields.code ?? '').trim().slice(0, 12);
  const ipKey = `track:ip:${ctx.ip}`;
  const tKey = `track:t:${ticket}`;
  const generic = 'تعذّر العثور على طلب مطابق. تأكدوا من الرقم المرجعي والرمز ثم أعيدوا المحاولة.';

  if (!rateLimitPeek(ipKey, 12) || !rateLimitPeek(tKey, 6)) {
    return page(ctx, { title: 'متابعة حالة طلب', active: 'notices', body: html`${pageHero('محاولات كثيرة', 'لحماية الطلبات تم إيقاف المحاولات مؤقتًا.', 'lock')}<div class="container content narrow"><div class="card">${alertBox('err', 'تم تجاوز عدد المحاولات المسموح به. يرجى المحاولة بعد 15 دقيقة.')}</div></div>` }, 429, true);
  }
  const r = ticket && code ? findForTracking(ticket, code) : null;
  if (!r) {
    rateLimit(ipKey, 12, 15 * 60_000);
    rateLimit(tKey, 6, 15 * 60_000);
    return trackForm(ctx, generic, { ticket });
  }
  rateLimitReset(tKey);

  const hist = publicHistory(r.id as number);
  const kind = r.kind as keyof typeof KINDS;
  page(
    ctx,
    {
      title: 'حالة الطلب',
      active: 'notices',
      body: html`${pageHero('حالة الطلب', KINDS[kind].label, 'search', [{ href: '/track', label: 'متابعة حالة طلب' }])}
      <div class="container content narrow"><div class="card">
        <dl class="kv">
          <dt>الرقم المرجعي</dt><dd dir="ltr" class="ltr-start">${r.ticket_no}</dd>
          <dt>نوع الطلب</dt><dd>${KINDS[kind].label}</dd>
          <dt>الحالة الحالية</dt><dd>${statusBadge(r.status as string)}</dd>
          <dt>تاريخ التقديم</dt><dd>${fmtDateTime(r.created_at as string)}</dd>
          <dt>آخر تحديث</dt><dd>${fmtDateTime(r.updated_at as string)}</dd>
        </dl>
        ${r.public_note ? html`<div class="alert alert-info mt18">${icon('bell')}<div><strong>ملاحظة من المدرسة:</strong><br>${r.public_note}</div></div>` : ''}
        ${r.status === 'needs_info' ? alertBox('warn', 'المدرسة بحاجة إلى استكمال بيانات. يرجى التواصل مع إدارة المدرسة أو تقديم طلب جديد يتضمّن المعلومات المطلوبة.') : ''}
        <h3 class="mt22">سجل الحالة</h3>
        <ol class="timeline">${hist.map((h) => html`<li><strong>${STATUS_LABELS[h.to_status as string] ?? h.to_status}</strong><div class="meta">${fmtDateTime(h.created_at as string)}</div>${h.note ? html`<div>${h.note}</div>` : ''}</li>`)}</ol>
        <p class="hint">لحماية الخصوصية لا تُعرض هنا بيانات الطالبة أو المرفقات.</p>
        <a class="btn btn-ghost" href="/track">استعلام آخر</a>
      </div></div>`,
    },
    200,
    true,
  );
}

// ───────── وسائل التحفيز ─────────
function incentivesPage(ctx: Ctx) {
  const rows = all("SELECT * FROM initiatives WHERE status IN ('active','ended') ORDER BY (status='active') DESC, sort_order, id DESC");
  page(ctx, {
    title: 'وسائل التحفيز',
    active: 'incentives',
    body: html`${pageHero('وسائل التحفيز', 'مبادرات وبرامج تشجّع الانضباط المدرسي والمواظبة والسلوك الإيجابي والتعاون والاحترام.', 'trophy')}
    <div class="container content">
      ${rows.length
        ? html`<div class="grid cols-3">${rows.map(
            (i) => html`<article class="init reveal">
              <div class="meta"><span class="svc-ico">${icon(i.icon)}</span>
                <span class="badge ${i.status === 'active' ? 'b-ok' : 'b-mute'}">${i.status === 'active' ? 'نشطة' : 'منتهية'}</span>${demoBadge(i.is_demo)}</div>
              <h4>${i.name}</h4><p>${i.description}</p>
              <div class="meta"><span>${icon('users', 'ico')} الفئة المستهدفة: ${i.audience}</span></div>
              ${i.start_date || i.end_date ? html`<div class="meta">${icon('calendar', 'ico')}<span>${i.start_date ? fmtDate(i.start_date) : '—'} ← ${i.end_date ? fmtDate(i.end_date) : 'مستمرة'}</span></div>` : ''}
            </article>`,
          )}</div>`
        : empty('لا توجد مبادرات منشورة حاليًا.', 'trophy')}
    </div>`,
  });
}

// ───────── نتائج الاستبانات ─────────
function surveysPage(ctx: Ctx) {
  const list = surveysWithItems();
  const block = ({ survey, items }: { survey: Record<string, any>; items: Record<string, any>[] }) => {
    const byQ = new Map<string, Record<string, any>[]>();
    for (const it of items) byQ.set(it.question, [...(byQ.get(it.question) ?? []), it]);
    return html`<article class="card reveal mb20">
      <h3>${survey.title}</h3>
      ${survey.description ? html`<p>${survey.description}</p>` : ''}
      <div class="meta mb16">
        ${survey.participants != null ? html`<span>${icon('users', 'ico')} عدد المشاركات: <strong>${survey.participants}</strong></span>` : ''}
        ${survey.published_at ? html`<span>${icon('calendar', 'ico')} نُشرت النتائج: ${fmtDate(survey.published_at)}</span>` : ''}
      </div>
      ${[...byQ.entries()].map(([q, opts]) => {
        const total = opts.reduce((s, o) => s + (o.votes as number), 0);
        return html`<div class="q-block"><h5>${q}</h5>${opts.map((o) => {
          const pct = total ? Math.round(((o.votes as number) / total) * 1000) / 10 : 0;
          return html`<div class="bar-row"><span>${o.option_label}</span>
            <span class="bar-track" role="img" aria-label="${o.option_label}: ${pct}%"><svg viewBox="0 0 100 10" preserveAspectRatio="none"><rect width="${pct}" height="10" class="bar-fill"></rect></svg></span>
            <span class="bar-num">${pct}% (${o.votes})</span></div>`;
        })}</div>`;
      })}
      <p class="hint">النتائج مجمّعة ولا تتضمن أي بيانات شخصية.</p>
    </article>`;
  };
  page(ctx, {
    title: 'نتائج الاستبانات',
    active: 'surveys',
    body: html`${pageHero('نتائج الاستبانات', 'ملخص نتائج الاستبانات التي قررت المدرسة نشرها.', 'chart')}
    <div class="container content">${list.length ? list.map(block) : empty('لا توجد نتائج منشورة حاليًا.', 'chart')}</div>`,
  });
}

// ───────── الإعلانات ─────────
function announcementsPage(ctx: Ctx) {
  const cat = ctx.url.searchParams.get('cat') ?? '';
  const valid = (ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(cat) ? cat : '';
  const list = publishedAnnouncements(valid || undefined);
  page(ctx, {
    title: 'إعلانات المدرسة',
    active: 'announcements',
    body: html`${pageHero('إعلانات المدرسة', 'آخر الأخبار والفعاليات والتنبيهات والمستجدات المدرسية.', 'news')}
    <div class="container content">
      <div class="filters" aria-label="تصنيف الإعلانات">
        <a href="/announcements" class="${valid ? '' : 'on'}">الكل</a>
        ${ANNOUNCEMENT_CATEGORIES.map((c) => html`<a href="/announcements?cat=${encodeURIComponent(c)}" class="${c === valid ? 'on' : ''}">${c}</a>`)}
        <a href="/events">${icon('image', 'ico')} تغطية الفعاليات</a>
      </div>
      ${list.length ? html`<div class="grid cols-3">${list.map(announcementCard)}</div>` : empty('لا توجد إعلانات منشورة حاليًا.', 'news')}
    </div>`,
  });
}

function announcementDetail(ctx: Ctx) {
  const a = get("SELECT * FROM announcements WHERE id = ? AND status = 'published'", Number(ctx.params.id) || 0);
  if (!a) return notFound(ctx);
  const img = a.image_media_id ? get("SELECT id, title FROM media WHERE id = ? AND status='published' AND consent_confirmed=1 AND kind='image'", a.image_media_id as number) : undefined;
  page(ctx, {
    title: a.title as string,
    active: 'announcements',
    description: String(a.body).slice(0, 150),
    body: html`${pageHero('إعلانات المدرسة', 'التفاصيل الكاملة للإعلان', 'news', [{ href: '/announcements', label: 'إعلانات المدرسة' }])}
    <div class="container content narrow"><article class="article">
      <div class="meta"><span class="chip">${a.category}</span>${isNew(a.published_at as string) ? html`<span class="badge badge-new">جديد</span>` : ''}${demoBadge(a.is_demo)}</div>
      <h2>${a.title}</h2>
      <div class="meta mb16">${icon('calendar', 'ico')}<span>تاريخ النشر: ${fmtDate(a.published_at as string)}</span>${a.event_date ? html`<span>• موعد الفعالية: <strong>${fmtDate(a.event_date as string)}</strong></span>` : ''}</div>
      ${img ? html`<p><img src="/media/${img.id}" alt="${img.title}" loading="lazy" class="round"></p>` : ''}
      ${paragraphs(a.body as string)}
      <p><a class="btn btn-ghost" href="/announcements">العودة إلى الإعلانات</a></p>
    </article></div>`,
  });
}

// ───────── تغطية الفعاليات ─────────
function eventsPage(ctx: Ctx) {
  const cat = ctx.url.searchParams.get('cat') ?? '';
  const valid = (MEDIA_CATEGORIES as readonly string[]).includes(cat) ? cat : '';
  const items = publishedMedia(valid || undefined);
  page(ctx, {
    title: 'تغطية الفعاليات',
    active: 'announcements',
    body: html`${pageHero('تغطية الفعاليات المدرسية', 'صور ومقاطع من مجالس الأمهات والاجتماعات والمبادرات والأنشطة (تُنشر بعد التحقق من الأذونات اللازمة).', 'image', [{ href: '/announcements', label: 'إعلانات المدرسة' }])}
    <div class="container content">
      <div class="filters"><a href="/events" class="${valid ? '' : 'on'}">الكل</a>
        ${MEDIA_CATEGORIES.map((c) => html`<a href="/events?cat=${encodeURIComponent(c)}" class="${c === valid ? 'on' : ''}">${c}</a>`)}</div>
      ${items.length
        ? html`<div class="gallery">${items.map(
            (m) => html`<figure class="shot reveal">
              ${m.kind === 'video'
                ? html`<video controls preload="none" src="/media/${m.id}" aria-label="${m.title}"></video>`
                : html`<img src="/media/${m.id}" alt="${m.title}" loading="lazy">`}
              <figcaption><strong>${m.title}</strong><div class="meta"><span class="chip">${m.category}</span>${m.event_date ? html`<span>${fmtDate(m.event_date)}</span>` : ''}</div></figcaption>
            </figure>`,
          )}</div>`
        : empty('لا توجد صور أو مقاطع منشورة حاليًا.', 'image')}
    </div>`,
  });
}

function serveMedia(ctx: Ctx) {
  const m = get("SELECT * FROM media WHERE id = ? AND status = 'published' AND consent_confirmed = 1", Number(ctx.params.id) || 0);
  if (!m) return notFound(ctx);
  const ok = serveFile(ctx, path.join(config.mediaDir, m.stored_name as string), m.mime as string, { cache: 'public, max-age=300' });
  if (!ok) notFound(ctx);
}

// ───────── سياسة الخصوصية ─────────
function privacyPage(ctx: Ctx) {
  page(ctx, {
    title: 'سياسة الخصوصية',
    body: html`${pageHero('سياسة الخصوصية', 'كيف تتعامل المنصة مع البيانات التي تُدخلونها.', 'lock')}
    <div class="container content narrow"><article class="article">
      ${alertBox('warn', 'مسودة إرشادية: يجب على إدارة المدرسة مراجعة هذه السياسة وتعديلها واعتمادها من الجهة المختصة قبل نشر المنصة رسميًا.')}
      <h3>الغرض من جمع البيانات</h3>
      <p>تُجمع البيانات المدخلة في النماذج (مثل اسم الطالبة والصف وسبب الغياب أو التأخر) لغرض واحد هو معالجة الطلب والتواصل بشأنه ودعم الانضباط والمواظبة، ولا تُستخدم لأي غرض تسويقي.</p>
      <h3>الحد الأدنى من البيانات</h3>
      <p>نطلب فقط ما يلزم لمعالجة كل خدمة، وحقول التواصل اختيارية حيثما أمكن. ولا يلزم ذكر الاسم في المقترحات وصوت الطالبة.</p>
      <h3>من يطّلع على البيانات؟</h3>
      <p>لا تُعرض بيانات الطالبات أو أولياء الأمور أو الشكاوى أو المرفقات في أي واجهة عامة. يقتصر الاطلاع عليها على المشرفة والموظفين المخوّلين عبر لوحة إدارة محمية بتسجيل دخول.</p>
      <h3>مشاركات الطالبات والصور</h3>
      <p>لا تُنشر مشاركات الطالبات إلا بعد مراجعتها من الإدارة وبدون ذكر الاسم، ولا تُنشر صور أو مقاطع الفعاليات إلا بعد تأكيد الموافقات اللازمة.</p>
      <h3>متابعة الطلبات</h3>
      <p>يُعطى مقدّم الطلب رقمًا مرجعيًا ورمز متابعة سريًا يُعرض مرة واحدة؛ ولا تُعرض حالة الطلب إلا بإدخالهما معًا.</p>
      <h3>الاحتفاظ بالبيانات</h3>
      <p>تحدد المدرسة مدة الاحتفاظ بالبيانات وفق الأنظمة المعمول بها، ويمكن للإدارة حذف الطلبات المنتهية.</p>
      <h3>التواصل</h3>
      <p>للاستفسار عن البيانات أو طلب تصحيحها يرجى مراجعة إدارة المدرسة (${brand.supervisorLine}).</p>
    </article></div>`,
  });
}

export const publicRoutes: Route[] = [
  { method: 'GET', pattern: '/', handler: homePage },
  { method: 'GET', pattern: '/notices', handler: noticesHub },
  ...Object.values(FORMS).flatMap((def): Route[] => {
    const p = FORM_PATHS[def.kind].path;
    return [
      { method: 'GET', pattern: p, handler: showForm(def) },
      { method: 'POST', pattern: p, handler: submitForm(def), bigBody: true },
    ];
  }),
  { method: 'GET', pattern: '/track', handler: (c) => trackForm(c) },
  { method: 'POST', pattern: '/track', handler: trackSubmit },
  { method: 'GET', pattern: '/incentives', handler: incentivesPage },
  { method: 'GET', pattern: '/surveys', handler: surveysPage },
  { method: 'GET', pattern: '/announcements', handler: announcementsPage },
  { method: 'GET', pattern: '/announcements/:id', handler: announcementDetail },
  { method: 'GET', pattern: '/events', handler: eventsPage },
  { method: 'GET', pattern: '/media/:id', handler: serveMedia },
  { method: 'GET', pattern: '/privacy', handler: privacyPage },
];
