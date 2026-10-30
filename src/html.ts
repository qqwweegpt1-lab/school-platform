// قالب HTML بسيط مع تهريب تلقائي لكل القيم المُدرَجة (حماية من XSS).
export class Safe {
  readonly value: string;
  constructor(v: string) {
    this.value = v;
  }
  toString() {
    return this.value;
  }
}

export const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

type Val = Safe | string | number | boolean | null | undefined | Val[];

function render(v: Val): string {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Safe) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings: TemplateStringsArray, ...vals: Val[]): Safe {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += render(vals[i]);
  });
  return new Safe(out);
}

export const raw = (s: string) => new Safe(s);

/** يحوّل نصًا متعدد الأسطر إلى فقرات آمنة */
export function paragraphs(text: string | null | undefined): Safe {
  const parts = String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return new Safe(parts.map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join(''));
}

// ───────── التواريخ (توقيت الرياض، أرقام لاتينية) ─────────
const TZ = 'Asia/Riyadh';
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00Z') : new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? 'UTC' : TZ,
  }).format(d);
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(d);
}
/** تاريخ اليوم في الرياض بصيغة YYYY-MM-DD */
export function todayRiyadh(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
}
