import type { Ctx } from '../http.ts';

/** يقرأ حقلًا نصيًا من النموذج مع تنظيف وحد أقصى للطول */
export function str(ctx: Ctx, name: string, max: number): string {
  return (ctx.fields[name] ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[‪-‮⁦-⁩]/g, '')
    .trim()
    .slice(0, max);
}

export function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const idParam = (ctx: Ctx) => Number(ctx.params.id) || 0;
export const checked = (ctx: Ctx, name: string) => ctx.fields[name] === '1' || ctx.fields[name] === 'on';

/** تسميات عربية للأيقونات المتاحة في المبادرات */
export const INITIATIVE_ICONS: { value: string; label: string }[] = [
  { value: 'star', label: 'نجمة' },
  { value: 'trophy', label: 'كأس' },
  { value: 'heart', label: 'قلب' },
  { value: 'book', label: 'كتاب' },
  { value: 'users', label: 'مجموعة' },
  { value: 'bulb', label: 'فكرة' },
  { value: 'shield', label: 'درع' },
  { value: 'check', label: 'علامة صح' },
  { value: 'bell', label: 'جرس' },
  { value: 'clock', label: 'ساعة' },
  { value: 'news', label: 'خبر' },
  { value: 'chart', label: 'رسم بياني' },
  { value: 'voice', label: 'صوت' },
];
