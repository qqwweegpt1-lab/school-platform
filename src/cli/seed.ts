// بيانات تجريبية واضحة التمييز (is_demo = 1) لبيئة التطوير فقط.
//   npm run seed          إضافة البيانات التجريبية
//   npm run seed:clear    حذفها (أو من لوحة الإدارة: زر «حذف البيانات التجريبية»)
// لا تحتوي على أسماء طالبات حقيقية ولا نتائج استبانات ولا إنجازات مدعاة.
import { config } from '../config.ts';
import { db, get, nowIso, run, tx } from '../db.ts';
import { hashSecretCode, newSecretCode, newTicketNo } from '../security.ts';

const clear = process.argv.includes('--clear');
db();

if (clear) {
  tx(() => {
    run('DELETE FROM requests WHERE is_demo = 1');
    run('DELETE FROM announcements WHERE is_demo = 1');
    run('DELETE FROM initiatives WHERE is_demo = 1');
  });
  console.log('تم حذف البيانات التجريبية.');
  process.exit(0);
}

if (config.isProd && !process.argv.includes('--force')) {
  console.error('رُفض التنفيذ: البيانات التجريبية مخصصة للتطوير فقط (أضيفوا --force إن كنتم متأكدين).');
  process.exit(1);
}
if (get('SELECT COUNT(*) AS c FROM announcements WHERE is_demo = 1')!.c) {
  console.log('البيانات التجريبية موجودة مسبقًا. استخدموا npm run seed:clear أولًا.');
  process.exit(0);
}

const now = nowIso();
tx(() => {
  const ann = [
    ['إعلان تجريبي: مجلس الأمهات الدوري', 'نص تجريبي لتوضيح شكل الإعلان. استبدلوه بإعلان معتمد من المدرسة أو احذفوا البيانات التجريبية.', 'الاجتماعات ومجالس الأمهات', 1],
    ['إعلان تجريبي: فعالية مدرسية', 'نص تجريبي لتوضيح شكل الإعلان وتصنيفه وموعد الفعالية.', 'الفعاليات المدرسية', 0],
    ['إعلان تجريبي: تنبيه إداري', 'نص تجريبي لتنبيه إداري. هذا المحتوى للعرض فقط.', 'الإجازات والتنبيهات', 0],
  ] as const;
  for (const [t, b, c, pin] of ann) {
    run("INSERT INTO announcements(title, body, category, status, pinned, is_demo, published_at, created_at, updated_at) VALUES (?,?,?,'published',?,1,?,?,?)", t, b, c, pin, now, now, now);
  }
  const ini = [
    ['مبادرة تجريبية: الحضور المبكر', 'وصف تجريبي لمبادرة تشجّع الحضور المبكر والمواظبة.', 'trophy', 'جميع الطالبات', 'active'],
    ['مبادرة تجريبية: السلوك الإيجابي', 'وصف تجريبي لمبادرة تعزّز التعاون والاحترام.', 'heart', 'جميع الطالبات', 'active'],
    ['مبادرة تجريبية: شراكة الأسرة', 'وصف تجريبي لمبادرة تواصل مع أولياء الأمور.', 'users', 'أولياء الأمور', 'ended'],
  ] as const;
  ini.forEach(([n, d, i, a, s], idx) =>
    run('INSERT INTO initiatives(name, description, icon, audience, status, sort_order, is_demo, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)', n, d, i, a, s, idx, now, now),
  );
  const reqs = [
    ['absence', 'ABS', 'received', 'طالبة تجريبية (1)', 'سبب تجريبي للغياب.'],
    ['late', 'LAT', 'in_review', 'طالبة تجريبية (2)', 'سبب تجريبي للتأخر.'],
    ['permission', 'PRM', 'received', 'طالبة تجريبية (3)', 'سبب تجريبي للاستئذان.'],
  ] as const;
  for (const [kind, p, st, name, body] of reqs) {
    const r = run(
      'INSERT INTO requests(ticket_no, secret_hash, kind, status, student_name, grade, event_date, body, is_demo, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)',
      newTicketNo(p), hashSecretCode(newSecretCode()), kind, st, name, 'الثالث الابتدائي', now.slice(0, 10), body, now, now,
    );
    run('INSERT INTO status_history(request_id, from_status, to_status, user_id, note, created_at) VALUES (?,?,?,?,?,?)', Number(r.lastInsertRowid), null, st, null, null, now);
  }
});
console.log('تمت إضافة بيانات تجريبية (مُعلَّمة «تجريبي»).');
