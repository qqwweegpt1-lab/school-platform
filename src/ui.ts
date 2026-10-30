import { brand, STATUS_LABELS } from './config.ts';
import { esc, html, raw, Safe } from './html.ts';
import type { Ctx } from './http.ts';
import { csrfField } from './security.ts';
import type { Field, FormDef } from './forms.ts';

// ───────── الأيقونات (SVG مضمّنة، بلا اعتماد على خدمات خارجية) ─────────
const ICONS: Record<string, string> = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  voice: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4.5 2 4.5 4.5"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  absence: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="m10 13.5 4 4M14 13.5l-4 4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  door: '<path d="M5 20V5a1 1 0 0 1 1-1h8l4 2v14"/><path d="M3 20h18"/><path d="M14 12v.5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a2 2 0 0 0 0 4h3M16 6h3a2 2 0 0 1 0 4h-3"/><path d="M12 13v4M8.5 20h7M9.5 17h5"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7.5" y="11" width="3" height="6" rx=".6"/><rect x="12.5" y="7" width="3" height="10" rx=".6"/><rect x="17" y="13" width="2.5" height="4" rx=".6"/>',
  news: '<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M18 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2"/><path d="M8.5 8.5h6M8.5 12h6M8.5 15.5h4"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.3 2.9 7.6 7 9.5 4.1-1.9 7-5.2 7-9.5V6z"/><path d="M12 8v5M12 16v.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/><path d="M9 8h7"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 6 3.5-6 3.5z"/>',
  file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  clip: '<path d="M20 11.5 12.2 19.3a5 5 0 0 1-7-7l8-8a3.4 3.4 0 0 1 5 5l-8 8a1.7 1.7 0 0 1-2.4-2.4L14.5 8"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M15 8l4 4-4 4M19 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  inbox: '<path d="M4 13 6.5 5h11L20 13v6H4z"/><path d="M4 13h4.5a3.5 3.5 0 0 0 7 0H20"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
};

export function icon(name: string, cls = 'ico'): Safe {
  return raw(
    `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] ?? ICONS.star}</svg>`,
  );
}
export const ICON_NAMES = Object.keys(ICONS);

// ───────── CSRF ─────────
export function csrfInput(ctx: Ctx): Safe {
  return raw(`<input type="hidden" name="_csrf" value="${esc(csrfField(ctx.csrfCookie))}">`);
}

// ───────── التخطيط العام ─────────
export type NavKey =
  | 'home'
  | 'voice'
  | 'parents'
  | 'notices'
  | 'incentives'
  | 'surveys'
  | 'announcements'
  | 'suggestions'
  | 'complaints'
  | '';

const NAV: { key: NavKey; href: string; label: string; children?: { href: string; label: string; icon: string }[] }[] = [
  { key: 'home', href: '/', label: 'الرئيسية' },
  { key: 'voice', href: '/student-voice', label: 'صوت الطالبة' },
  { key: 'parents', href: '/parents-opinions', label: 'آراء أولياء الأمور' },
  {
    key: 'notices',
    href: '/notices',
    label: 'إشعارات ولي الأمر',
    children: [
      { href: '/notices/absence', label: 'إشعار الغياب', icon: 'absence' },
      { href: '/notices/late', label: 'إشعار التأخر', icon: 'clock' },
      { href: '/notices/permission', label: 'طلب الاستئذان', icon: 'door' },
      { href: '/track', label: 'متابعة حالة طلب', icon: 'search' },
    ],
  },
  { key: 'incentives', href: '/incentives', label: 'وسائل التحفيز' },
  { key: 'surveys', href: '/surveys', label: 'نتائج الاستبانات' },
  { key: 'announcements', href: '/announcements', label: 'إعلانات المدرسة' },
  { key: 'suggestions', href: '/suggestions', label: 'المقترحات' },
  { key: 'complaints', href: '/complaints', label: 'الشكاوى' },
];

export interface LayoutOpts {
  ctx: Ctx;
  title: string;
  description?: string;
  active?: NavKey;
  body: Safe;
  bodyClass?: string;
}

export function layout(o: LayoutOpts): Safe {
  const full = o.title ? `${o.title} | ${brand.platformName}` : brand.platformName;
  const desc = o.description ?? 'منصة مدرسية لتعزيز التواصل والانضباط والمواظبة السلوكية بين المدرسة والطالبات وأولياء الأمور.';
  const nav = NAV.map((n) => {
    const cur = o.active === n.key ? ' aria-current="page"' : '';
    if (n.children) {
      return html`<li class="has-sub${o.active === n.key ? ' current' : ''}">
        <button type="button" class="sub-toggle" aria-expanded="false" aria-controls="sub-${n.key}">
          ${n.label} ${icon('down', 'ico chev')}
        </button>
        <ul class="submenu" id="sub-${n.key}">
          <li><a href="${n.href}">${icon('bell')}<span>جميع إشعارات ولي الأمر</span></a></li>
          ${n.children.map((c) => html`<li><a href="${c.href}">${icon(c.icon)}<span>${c.label}</span></a></li>`)}
        </ul>
      </li>`;
    }
    return html`<li><a href="${n.href}" class="${o.active === n.key ? 'current' : ''}"${raw(cur)}>${n.label}</a></li>`;
  });

  return html`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${full}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#f7f0e6">
<link rel="icon" href="/static/img/school-logo.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap">
<link rel="stylesheet" href="/static/css/app.css">
<script src="/static/js/boot.js"></script>
</head>
<body class="${o.bodyClass ?? ''}">
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>
<header class="site-header">
  <div class="brandbar container">
    <a class="logo logo-school" href="/" aria-label="الصفحة الرئيسية"><img src="/static/img/school-logo.jpg" alt="شعار المدرسة" width="96" height="88"></a>
    <div class="brand-title">
      <p class="brand-sub">${brand.schoolName}</p>
      <h1><a href="/">${brand.platformName}</a></h1>
      <p class="brand-sup">${brand.supervisorLine}</p>
    </div>
    <span class="logo logo-moe"><img src="/static/img/moe-logo.png" alt="شعار وزارة التعليم" width="110" height="84"></span>
  </div>
  <div class="navbar">
    <div class="container navrow">
      <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="mainnav">${icon('menu')}<span>القائمة</span></button>
      <nav id="mainnav" class="mainnav" aria-label="القائمة الرئيسية"><ul>${nav}</ul></nav>
    </div>
  </div>
</header>
<main id="main" tabindex="-1">${o.body}</main>
<footer class="site-footer">
  <div class="container foot">
    <div>
      <strong>${brand.platformName}</strong>
      <p>${brand.schoolName}</p>
      <p>${brand.supervisorLine} — ${brand.supervisorRole}</p>
    </div>
    <ul class="foot-links">
      <li><a href="/track">متابعة حالة طلب</a></li>
      <li><a href="/privacy">سياسة الخصوصية</a></li>
      <li><a href="/admin/login">دخول الإدارة</a></li>
    </ul>
  </div>
</footer>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<script src="/static/js/app.js" defer></script>
</body>
</html>`;
}

// ───────── مكوّنات مشتركة ─────────
export function pageHero(title: string, sub: string, ic: string, crumbs?: { href: string; label: string }[]): Safe {
  return html`<section class="page-hero">
    <div class="container">
      ${crumbs && crumbs.length
        ? html`<nav class="crumbs" aria-label="مسار التنقل"><a href="/">الرئيسية</a>${crumbs.map((c) => html` <span aria-hidden="true">›</span> <a href="${c.href}">${c.label}</a>`)}</nav>`
        : ''}
      <div class="ph-row">
        <span class="ph-ico">${icon(ic, 'ico lg')}</span>
        <div><h2>${title}</h2><p>${sub}</p></div>
      </div>
    </div>
  </section>`;
}

export function empty(msg: string, ic = 'inbox'): Safe {
  return html`<div class="empty">${icon(ic, 'ico lg')}<p>${msg}</p></div>`;
}

export function alertBox(kind: 'ok' | 'err' | 'warn' | 'info', content: Safe | string): Safe {
  const role = kind === 'err' ? 'alert' : 'status';
  return html`<div class="alert alert-${kind}" role="${role}">${icon(kind === 'ok' ? 'check' : 'alert')}<div>${content}</div></div>`;
}

export function statusBadge(status: string): Safe {
  const cls =
    ['approved', 'implemented', 'published', 'reviewed'].includes(status)
      ? 'ok'
      : ['rejected', 'not_approved'].includes(status)
        ? 'bad'
        : ['needs_info'].includes(status)
          ? 'warn'
          : ['closed', 'private'].includes(status)
            ? 'mute'
            : 'info';
  return html`<span class="badge b-${cls}">${STATUS_LABELS[status] ?? status}</span>`;
}

export function demoBadge(isDemo: unknown): Safe {
  return isDemo ? html`<span class="badge b-demo" title="محتوى تجريبي يمكن حذفه من لوحة الإدارة">بيانات تجريبية</span>` : html``;
}

// ───────── عرض النموذج ─────────
export interface FormState {
  values: Record<string, string>;
  errors: Record<string, string>;
  nonce: string;
  fileError?: string;
  formError?: string;
}

function renderField(f: Field, st: FormState): Safe {
  const id = `f_${f.name}`;
  const val = st.values[f.name] ?? '';
  const err = st.errors[f.name];
  const hintId = f.hint ? `${id}_hint` : '';
  const errId = err ? `${id}_err` : '';
  const described = [hintId, errId].filter(Boolean).join(' ');
  const common = `id="${id}" name="${f.name}"${f.required ? ' required' : ''}${err ? ' aria-invalid="true"' : ''}${described ? ` aria-describedby="${described}"` : ''}`;
  const reqMark = f.required ? html` <span class="req" aria-hidden="true">*</span>` : '';
  let control: Safe;

  switch (f.type) {
    case 'textarea':
      control = html`<textarea ${raw(common)} rows="4"${f.max ? raw(` maxlength="${f.max}"`) : ''}>${val}</textarea>`;
      break;
    case 'select':
      control = html`<select ${raw(common)}>
        <option value="">اختر…</option>
        ${(f.options ?? []).map((o) => html`<option value="${o}"${o === val ? raw(' selected') : ''}>${o}</option>`)}
      </select>`;
      break;
    case 'date': {
      control = html`<input type="date" ${raw(common)} value="${val}">`;
      break;
    }
    case 'time':
      control = html`<input type="time" ${raw(common)} value="${val}">`;
      break;
    case 'contact':
      control = html`<input type="text" inputmode="tel" dir="ltr" class="ltr-input" ${raw(common)} value="${val}" maxlength="${f.max ?? 100}"${f.autocomplete ? raw(` autocomplete="${f.autocomplete}"`) : ''}>`;
      break;
    case 'checkbox':
    case 'checkbox_ack':
      return html`<div class="field full">
        <label class="check"><input type="checkbox" ${raw(common)}${val ? raw(' checked') : ''}><span>${f.label}${reqMark}</span></label>
        ${err ? html`<p class="field-err" id="${errId}">${err}</p>` : ''}
      </div>`;
    default:
      control = html`<input type="text" ${raw(common)} value="${val}"${f.max ? raw(` maxlength="${f.max}"`) : ''}${f.placeholder ? raw(` placeholder="${esc(f.placeholder)}"`) : ''}${f.autocomplete ? raw(` autocomplete="${f.autocomplete}"`) : ''}>`;
  }
  return html`<div class="field${f.half ? ' half' : ' full'}${err ? ' has-err' : ''}">
    <label for="${id}">${f.label}${reqMark}</label>
    ${control}
    ${f.hint ? html`<p class="hint" id="${hintId}">${f.hint}</p>` : ''}
    ${err ? html`<p class="field-err" id="${errId}">${err}</p>` : ''}
  </div>`;
}

export function renderForm(ctx: Ctx, def: FormDef, st: FormState, action: string): Safe {
  const errCount = Object.keys(st.errors).length + (st.fileError ? 1 : 0);
  const maxMb = Math.round((Number(process.env.MAX_ATTACHMENT_MB) || 5) * 10) / 10;
  return html`<form class="card form" method="post" action="${action}" enctype="multipart/form-data" novalidate data-guard>
    ${st.formError ? alertBox('err', st.formError) : ''}
    ${errCount && !st.formError ? alertBox('err', html`يوجد ${errCount} ${errCount === 1 ? 'خطأ' : 'أخطاء'} يرجى تصحيحها ثم إعادة الإرسال.`) : ''}
    ${def.notice ? alertBox('info', def.notice) : ''}
    ${csrfInput(ctx)}
    <input type="hidden" name="_nonce" value="${st.nonce}">
    <div class="hp" aria-hidden="true"><label>لا تملأ هذا الحقل <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
    <div class="grid-form">${def.fields.map((f) => renderField(f, st))}</div>
    ${def.files > 0
      ? html`<div class="field full file-field${st.fileError ? ' has-err' : ''}">
          <label for="f_files">${icon('clip')} المرفقات (اختياري)</label>
          <input type="file" id="f_files" name="files" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" data-max-files="${def.files}" data-max-mb="${maxMb}">
          <p class="hint">${def.fileHint ?? ''} الحد الأقصى ${def.files} ${def.files === 1 ? 'ملف' : 'ملفات'}، وحجم كل ملف حتى ${maxMb} ميغابايت.</p>
          ${st.fileError ? html`<p class="field-err">${st.fileError}</p>` : ''}
          <p class="field-err js-file-err" hidden></p>
        </div>`
      : ''}
    <p class="privacy-note">${icon('lock')} بياناتكم تُستخدم لمعالجة هذا الطلب فقط. راجعوا <a href="/privacy">سياسة الخصوصية</a>.</p>
    <button type="submit" class="btn btn-primary btn-lg">${def.submit}</button>
  </form>`;
}
