// تعريف النماذج العامة (مصدر واحد للعرض والتحقق على الخادم)
import { ANNOUNCEMENT_CATEGORIES, GRADES, type Kind } from './config.ts';
import { todayRiyadh } from './html.ts';

export type FieldType = 'text' | 'textarea' | 'select' | 'date' | 'time' | 'contact' | 'checkbox' | 'checkbox_ack';

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  max?: number;
  min?: number;
  hint?: string;
  placeholder?: string;
  autocomplete?: string;
  /** حدود التاريخ بالأيام نسبةً لليوم (توقيت الرياض) */
  dateRange?: [number, number];
  half?: boolean;
}

export interface FormDef {
  kind: Kind;
  slug: string;
  title: string;
  intro: string;
  notice?: string;
  fields: Field[];
  files: number; // أقصى عدد مرفقات (0 = بدون)
  fileHint?: string;
  submit: string;
  success: string;
}

const NAME = (label = 'اسم الطالبة'): Field => ({
  name: 'student_name',
  label,
  type: 'text',
  required: true,
  max: 80,
  min: 3,
  autocomplete: 'off',
  placeholder: 'الاسم الثلاثي',
});
const GRADE: Field = { name: 'grade', label: 'الصف', type: 'select', required: true, options: GRADES, half: true };
const CLASS: Field = {
  name: 'class_name',
  label: 'الفصل / الشعبة',
  type: 'text',
  max: 20,
  placeholder: 'مثال: 2',
  half: true,
};
const CONTACT = (required = false, hint = 'رقم جوال (05xxxxxxxx) أو بريد إلكتروني. نطلب هذا الحقل للضرورة فقط.'): Field => ({
  name: 'contact',
  label: 'وسيلة التواصل',
  type: 'contact',
  required,
  max: 100,
  hint,
  autocomplete: 'off',
});

export const FORMS: Record<string, FormDef> = {
  absence: {
    kind: 'absence',
    slug: 'absence',
    title: 'إشعار غياب',
    intro: 'يرجى تعبئة البيانات التالية لإشعار المدرسة بغياب الطالبة. سيصلكم رقم مرجعي لمتابعة الطلب.',
    fields: [
      NAME(),
      GRADE,
      CLASS,
      { name: 'event_date', label: 'تاريخ الغياب', type: 'date', required: true, dateRange: [-30, 1] },
      { name: 'body', label: 'سبب الغياب', type: 'textarea', required: true, max: 1000, min: 3 },
      { name: 'notes', label: 'ملاحظات إضافية (اختياري)', type: 'textarea', max: 1000 },
      CONTACT(),
      { name: 'ack', label: 'أقرّ بأن المعلومات المدخلة صحيحة.', type: 'checkbox_ack', required: true },
    ],
    files: 3,
    fileHint: 'يمكنك إرفاق عذر طبي أو مستند داعم (PDF أو JPG أو PNG).',
    submit: 'إرسال الإشعار',
    success: 'تم استلام إشعار الغياب وحفظه.',
  },
  late: {
    kind: 'late',
    slug: 'late',
    title: 'إشعار تأخر',
    intro: 'يرجى تعبئة البيانات التالية لإشعار المدرسة بتأخر الطالبة.',
    fields: [
      NAME(),
      GRADE,
      CLASS,
      { name: 'event_date', label: 'تاريخ التأخر', type: 'date', required: true, dateRange: [-14, 0] },
      { name: 'event_time', label: 'وقت الوصول (اختياري)', type: 'time', hint: 'أو اذكر مدة التأخر في الملاحظات.' },
      { name: 'body', label: 'سبب التأخر', type: 'textarea', required: true, max: 1000, min: 3 },
      { name: 'notes', label: 'ملاحظات إضافية (اختياري)', type: 'textarea', max: 1000 },
      CONTACT(),
    ],
    files: 3,
    fileHint: 'يمكنك إرفاق مستند داعم عند الحاجة (PDF أو JPG أو PNG).',
    submit: 'إرسال الإشعار',
    success: 'تم استلام إشعار التأخر وحفظه.',
  },
  permission: {
    kind: 'permission',
    slug: 'permission',
    title: 'طلب استئذان',
    intro: 'لطلب خروج الطالبة أثناء الدوام. سيتم التحقق من الطلب والتواصل معكم عند الحاجة.',
    notice: 'تنبيه: تقديم طلب الاستئذان لا يعني الموافقة عليه تلقائيًا؛ فالموافقة تخضع لإجراءات المدرسة.',
    fields: [
      NAME(),
      GRADE,
      CLASS,
      { name: 'event_date', label: 'تاريخ الاستئذان', type: 'date', required: true, dateRange: [0, 30], half: true },
      { name: 'event_time', label: 'وقت الاستئذان المطلوب', type: 'time', required: true, half: true },
      { name: 'body', label: 'سبب الاستئذان', type: 'textarea', required: true, max: 1000, min: 3 },
      { name: 'submitter_name', label: 'اسم ولي الأمر / مقدّم الطلب', type: 'text', required: true, max: 80, min: 3, autocomplete: 'name' },
      CONTACT(true, 'رقم جوال (05xxxxxxxx) أو بريد إلكتروني؛ يُستخدم للتحقق من الطلب فقط.'),
      { name: 'ack', label: 'أفهم أن تقديم الطلب لا يعني الموافقة عليه تلقائيًا.', type: 'checkbox_ack', required: true },
    ],
    files: 3,
    fileHint: 'يمكنك إرفاق مستند داعم عند الحاجة (PDF أو JPG أو PNG).',
    submit: 'إرسال الطلب',
    success: 'تم استلام طلب الاستئذان وحفظه، وهو الآن بانتظار المراجعة.',
  },
  suggestion: {
    kind: 'suggestion',
    slug: 'suggestions',
    title: 'المقترحات',
    intro: 'اقتراحاتكم تساعدنا على تطوير بيئتنا المدرسية. شاركونا أفكاركم البنّاءة.',
    fields: [
      { name: 'submitter_type', label: 'مقدّم المقترح', type: 'select', required: true, options: ['طالبة', 'ولي أمر'], half: true },
      { name: 'submitter_name', label: 'الاسم (اختياري)', type: 'text', max: 80, half: true, hint: 'يمكنك ترك الاسم فارغًا.' },
      { name: 'subject', label: 'موضوع المقترح', type: 'text', required: true, max: 120, min: 3 },
      {
        name: 'category',
        label: 'القسم المرتبط (اختياري)',
        type: 'select',
        options: ['الانضباط والمواظبة', 'الأنشطة والفعاليات', 'البيئة المدرسية', 'الخدمات الإلكترونية', 'التواصل مع الأسرة', 'أخرى'],
      },
      { name: 'body', label: 'نص المقترح', type: 'textarea', required: true, max: 2000, min: 10 },
    ],
    files: 1,
    fileHint: 'مرفق اختياري (PDF أو JPG أو PNG).',
    submit: 'إرسال المقترح',
    success: 'تم استلام مقترحكم. شكرًا لمشاركتكم.',
  },
  complaint: {
    kind: 'complaint',
    slug: 'complaints',
    title: 'الشكاوى',
    intro: 'قناة منظمة لاستقبال الشكاوى ومتابعتها وفق إجراءات المدرسة.',
    notice: 'الشكاوى سرّية ولا تُعرض في أي واجهة عامة، ولا يطّلع عليها إلا المخوّلون.',
    fields: [
      { name: 'submitter_type', label: 'مقدّم الشكوى', type: 'select', required: true, options: ['ولي أمر', 'طالبة', 'أخرى'], half: true },
      { name: 'submitter_name', label: 'الاسم (اختياري)', type: 'text', max: 80, half: true, autocomplete: 'name' },
      { name: 'subject', label: 'موضوع الشكوى', type: 'text', required: true, max: 120, min: 3 },
      {
        name: 'category',
        label: 'تصنيف الشكوى',
        type: 'select',
        required: true,
        options: ['سلوك أو معاملة', 'الانضباط والمواظبة', 'السلامة والبيئة المدرسية', 'الخدمات التعليمية', 'الشؤون الإدارية', 'أخرى'],
        half: true,
      },
      { name: 'event_date', label: 'تاريخ الواقعة (اختياري)', type: 'date', dateRange: [-365, 0], half: true },
      { name: 'body', label: 'وصف الشكوى', type: 'textarea', required: true, max: 3000, min: 10 },
      CONTACT(false, 'اختياري: رقم جوال أو بريد إلكتروني آمن إن رغبتم في التواصل معكم.'),
    ],
    files: 3,
    fileHint: 'مرفقات داعمة اختيارية (PDF أو JPG أو PNG).',
    submit: 'إرسال الشكوى',
    success: 'تم استلام الشكوى وحفظها بسرّية.',
  },
  student_voice: {
    kind: 'student_voice',
    slug: 'student-voice',
    title: 'صوت الطالبة',
    intro: 'مساحتكِ للتعبير عن رأيكِ، أو طرح موضوع للنقاش، أو إيصال رسالة إلى المدرسة بأسلوب راقٍ ومحترم.',
    notice: 'لا تُنشر المشاركات تلقائيًا؛ تُراجَع من الإدارة أولًا، ولا يُنشر اسمكِ في أي حال.',
    fields: [
      { name: 'student_name', label: 'اسم الطالبة (اختياري)', type: 'text', max: 80, autocomplete: 'off', hint: 'يمكنكِ المشاركة دون ذكر الاسم.' },
      GRADE,
      CLASS,
      {
        name: 'category',
        label: 'نوع المشاركة',
        type: 'select',
        required: true,
        options: ['فكرة تطويرية', 'موضوع للنقاش', 'تجربة إيجابية', 'ملاحظة مدرسية', 'مشاركة أخرى'],
      },
      { name: 'subject', label: 'عنوان المشاركة', type: 'text', required: true, max: 120, min: 3 },
      { name: 'body', label: 'نص المشاركة', type: 'textarea', required: true, max: 2000, min: 10 },
      { name: 'is_private', label: 'أرغب أن تبقى مشاركتي رسالة خاصة للإدارة ولا تُنشر.', type: 'checkbox' },
    ],
    files: 0,
    submit: 'إرسال المشاركة',
    success: 'وصلت مشاركتكِ إلى الإدارة. شكرًا لكِ على صوتكِ الجميل.',
  },
  parent_opinion: {
    kind: 'parent_opinion',
    slug: 'parents-opinions',
    title: 'آراء أولياء الأمور',
    intro: 'نقدّر رأيكم في خدماتنا وأنشطتنا والبيئة المدرسية، فهو يساعدنا على التطوير المستمر.',
    fields: [
      { name: 'subject', label: 'موضوع الرأي', type: 'text', required: true, max: 120, min: 3 },
      { name: 'body', label: 'نص الرأي', type: 'textarea', required: true, max: 2000, min: 10 },
      {
        name: 'rating',
        label: 'تقييمكم العام للخدمات (اختياري)',
        type: 'select',
        options: ['5 - ممتاز', '4 - جيد جدًا', '3 - جيد', '2 - مقبول', '1 - يحتاج إلى تحسين'],
        half: true,
      },
      CONTACT(false, 'اختياري: اتركوا وسيلة تواصل فقط إن رغبتم في أن نردّ عليكم.'),
    ],
    files: 0,
    submit: 'إرسال الرأي',
    success: 'تم استلام رأيكم. نشكر لكم مشاركتكم.',
  },
};

export const FORM_BY_SLUG: Record<string, FormDef> = Object.fromEntries(Object.values(FORMS).map((f) => [f.slug, f]));

// ───────── التحقق على الخادم ─────────
const clean = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[‪-‮⁦-⁩]/g, '') // أحرف تحكم في اتجاه النص
    .trim();

const PHONE = /^(?:\+?966|00966|0)?5\d{8}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export interface Validated {
  values: Record<string, string>;
  errors: Record<string, string>;
}

export function validateForm(def: FormDef, input: Record<string, string>): Validated {
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (const f of def.fields) {
    let v = clean(String(input[f.name] ?? ''));
    if (f.type === 'textarea') v = v.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
    else v = v.replace(/\s+/g, ' ');

    if (f.type === 'checkbox' || f.type === 'checkbox_ack') {
      const on = input[f.name] === 'on' || input[f.name] === '1';
      values[f.name] = on ? '1' : '';
      if (f.required && !on) errors[f.name] = 'هذا الإقرار مطلوب للمتابعة.';
      continue;
    }

    values[f.name] = v;
    if (!v) {
      if (f.required) errors[f.name] = 'هذا الحقل مطلوب.';
      continue;
    }
    if (f.max && v.length > f.max) errors[f.name] = `الحد الأقصى ${f.max} حرفًا.`;
    else if (f.min && v.length < f.min) errors[f.name] = `يجب ألا يقل عن ${f.min} أحرف.`;
    else if (f.type === 'select') {
      if (!f.options?.includes(v)) errors[f.name] = 'يرجى اختيار قيمة من القائمة.';
    } else if (f.type === 'date') {
      if (!validDate(v)) errors[f.name] = 'تاريخ غير صحيح.';
      else if (f.dateRange) {
        const lo = todayRiyadh(f.dateRange[0]);
        const hi = todayRiyadh(f.dateRange[1]);
        if (v < lo || v > hi) errors[f.name] = `التاريخ خارج النطاق المسموح (من ${lo} إلى ${hi}).`;
      }
    } else if (f.type === 'time') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) errors[f.name] = 'وقت غير صحيح.';
    } else if (f.type === 'contact') {
      const compact = v.replace(/[\s-]/g, '');
      if (!PHONE.test(compact) && !EMAIL.test(v)) errors[f.name] = 'أدخل رقم جوال سعوديًا صحيحًا (05xxxxxxxx) أو بريدًا إلكترونيًا صحيحًا.';
      else values[f.name] = EMAIL.test(v) ? v : compact;
    }
  }
  return { values, errors };
}

export const ALL_CATEGORIES = [...ANNOUNCEMENT_CATEGORIES];
