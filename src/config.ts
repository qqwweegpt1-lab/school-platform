import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// تحميل .env إن وُجد (بدون أي مكتبة خارجية)
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* تجاهل أخطاء القراءة */
  }
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const bool = (v: string | undefined) => (v ?? '').toLowerCase() === 'true';

const dataDir = path.resolve(ROOT, process.env.DATA_DIR ?? './storage');
mkdirSync(path.join(dataDir, 'attachments'), { recursive: true });
mkdirSync(path.join(dataDir, 'media'), { recursive: true });

const isProd = process.env.NODE_ENV === 'production';

function loadSecret(): string {
  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (isProd) {
    throw new Error('APP_SECRET مطلوب في بيئة الإنتاج (32 حرفًا على الأقل). راجع .env.example');
  }
  // بيئة التطوير: يُولَّد سر محلي ويُحفظ داخل مجلد البيانات (غير عام)
  const f = path.join(dataDir, '.app_secret');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  const s = randomBytes(48).toString('base64url');
  writeFileSync(f, s, { mode: 0o600 });
  try {
    chmodSync(f, 0o600);
  } catch {
    /* ignore */
  }
  return s;
}

export const config = {
  root: ROOT,
  publicDir: path.join(ROOT, 'public'),
  dataDir,
  attachmentsDir: path.join(dataDir, 'attachments'),
  mediaDir: path.join(dataDir, 'media'),
  dbFile: path.join(dataDir, 'platform.db'),
  migrationsDir: path.join(ROOT, 'db', 'migrations'),
  port: num(process.env.PORT, 3000),
  host: process.env.HOST ?? '127.0.0.1',
  isProd,
  cookieSecure: bool(process.env.COOKIE_SECURE),
  trustProxy: bool(process.env.TRUST_PROXY),
  secret: loadSecret(),
  maxAttachmentBytes: num(process.env.MAX_ATTACHMENT_MB, 5) * 1024 * 1024,
  maxAttachments: num(process.env.MAX_ATTACHMENTS, 3),
  maxImageBytes: 8 * 1024 * 1024,
  maxVideoBytes: 60 * 1024 * 1024,
  submitLimitPerHour: num(process.env.SUBMIT_LIMIT_PER_HOUR, 20),
  sessionHours: 8,
  tz: 'Asia/Riyadh',
} as const;

// ───────── هوية المنصة (يمكن تعديل النصوص من هنا أو من لوحة الإدارة) ─────────
export const brand = {
  platformName: 'منصة الانضباط والمواظبة السلوكية',
  supervisorLine: 'بإشراف: أ. منال الجهني',
  supervisorRole: 'وكيلة الشؤون الطلابية',
  schoolName: 'المدرسة الابتدائية الثامنة والتسعون بعد المائة',
  defaultIntro:
    'تهدف منصة الانضباط والمواظبة السلوكية، بإشراف وكيلة الشؤون الطلابية الأستاذة منال الجهني، إلى تعزيز التواصل الفعّال بين المدرسة والطالبات وأولياء الأمور، ودعم الانضباط المدرسي والمواظبة، وترسيخ السلوك الإيجابي، من خلال توفير خدمات إلكترونية تتيح تقديم الإشعارات والمقترحات والشكاوى، والمشاركة في الاستبانات والأنشطة المدرسية، والاطلاع على الإعلانات والمستجدات.',
  defaultWelcomeTitle: 'أهلًا بكم في منصتنا المدرسية',
  defaultWelcomeText:
    'خدمات إلكترونية سهلة وآمنة تربط المدرسة بالطالبات وأولياء الأمور: قدّموا إشعاراتكم، وشاركونا آراءكم، وتابعوا مستجدات المدرسة.',
} as const;

// الصفوف (حسب شعار المدرسة: مدرسة ابتدائية). عدّلها إن لزم.
export const GRADES = [
  'الأول الابتدائي',
  'الثاني الابتدائي',
  'الثالث الابتدائي',
  'الرابع الابتدائي',
  'الخامس الابتدائي',
  'السادس الابتدائي',
] as const;

export const ANNOUNCEMENT_CATEGORIES = [
  'الفعاليات المدرسية',
  'التكريم والإنجازات',
  'الإجازات والتنبيهات',
  'الاجتماعات ومجالس الأمهات',
  'الأنشطة الطلابية',
  'المستجدات المدرسية',
] as const;

export const MEDIA_CATEGORIES = [
  'مجالس الأمهات',
  'الاجتماعات',
  'الفعاليات المدرسية',
  'المبادرات',
  'حفلات التكريم',
  'الأنشطة المدرسية',
] as const;

// ───────── أنواع الطلبات وحالاتها ─────────
export type Kind =
  | 'absence'
  | 'late'
  | 'permission'
  | 'suggestion'
  | 'complaint'
  | 'student_voice'
  | 'parent_opinion';

export const KINDS: Record<Kind, { label: string; prefix: string; statuses: string[]; initial: string }> = {
  absence: {
    label: 'إشعار غياب',
    prefix: 'ABS',
    initial: 'received',
    statuses: ['received', 'in_review', 'needs_info', 'approved', 'rejected', 'closed'],
  },
  late: {
    label: 'إشعار تأخر',
    prefix: 'LAT',
    initial: 'received',
    statuses: ['received', 'in_review', 'needs_info', 'approved', 'rejected', 'closed'],
  },
  permission: {
    label: 'طلب استئذان',
    prefix: 'PRM',
    initial: 'received',
    statuses: ['received', 'in_review', 'needs_info', 'approved', 'rejected', 'closed'],
  },
  suggestion: {
    label: 'مقترح',
    prefix: 'SUG',
    initial: 'new',
    statuses: ['new', 'under_study', 'reviewed', 'implemented', 'not_approved'],
  },
  complaint: {
    label: 'شكوى',
    prefix: 'CMP',
    initial: 'received',
    statuses: ['received', 'in_review', 'needs_info', 'closed'],
  },
  student_voice: {
    label: 'مشاركة طالبة',
    prefix: 'VOI',
    initial: 'new',
    statuses: ['new', 'reviewed', 'published', 'private'],
  },
  parent_opinion: {
    label: 'رأي ولي أمر',
    prefix: 'OPN',
    initial: 'new',
    statuses: ['new', 'reviewed'],
  },
};

export const STATUS_LABELS: Record<string, string> = {
  received: 'تم الاستلام',
  in_review: 'قيد المراجعة',
  needs_info: 'يحتاج إلى استكمال بيانات',
  approved: 'تمت الموافقة',
  rejected: 'تم الرفض',
  closed: 'تم الإغلاق',
  new: 'جديد',
  under_study: 'قيد الدراسة',
  reviewed: 'تمت المراجعة',
  implemented: 'تم التنفيذ',
  not_approved: 'لم تتم الموافقة',
  published: 'منشور للعامة',
  private: 'رسالة خاصة للإدارة',
};

export const KIND_KEYS = Object.keys(KINDS) as Kind[];
