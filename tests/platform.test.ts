import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ADMIN_PW, adminClient, Client, codeOf, PNG, startServer, ticketOf, today, type TestServer } from './helpers.ts';

let S: TestServer;
before(async () => {
  S = await startServer();
});
after(async () => {
  await S.stop();
});

const absence = (o: Record<string, string> = {}) => ({
  student_name: 'طالبة اختبار آلي',
  grade: 'الأول الابتدائي',
  class_name: '2',
  event_date: today(),
  body: 'سبب الغياب للاختبار الآلي',
  ack: 'on',
  ...o,
});
const count = (sql: string, ...p: any[]) => Number((S.db().prepare(sql).get(...p) as any).c);

describe('الواجهة العامة', () => {
  test('الصفحة الرئيسية: RTL وعنوان المنصة واسم المشرفة والشعاران', async () => {
    const { res, text } = await new Client(S.base).get('/');
    assert.equal(res.status, 200);
    assert.match(text, /<html lang="ar" dir="rtl">/);
    assert.match(text, /منصة الانضباط والمواظبة السلوكية/);
    assert.match(text, /بإشراف: أ\. منال الجهني/);
    assert.match(text, /school-logo\.jpg/);
    assert.match(text, /moe-logo\.png/);
    assert.match(text, /تهدف منصة الانضباط والمواظبة السلوكية، بإشراف وكيلة الشؤون الطلابية الأستاذة منال الجهني/);
  });

  test('جميع الأقسام تعمل وليست روابط شكلية', async () => {
    const c = new Client(S.base);
    const pages: Record<string, RegExp> = {
      '/student-voice': /صوت الطالبة/,
      '/parents-opinions': /آراء أولياء الأمور/,
      '/notices': /إشعار الغياب/,
      '/notices/absence': /إشعار غياب/,
      '/notices/late': /إشعار تأخر/,
      '/notices/permission': /لا يعني الموافقة عليه تلقائيًا/,
      '/track': /رمز المتابعة/,
      '/incentives': /وسائل التحفيز/,
      '/surveys': /لا توجد نتائج منشورة حاليًا/,
      '/announcements': /لا توجد إعلانات منشورة حاليًا/,
      '/events': /لا توجد صور أو مقاطع منشورة حاليًا/,
      '/suggestions': /المقترحات/,
      '/complaints': /سرّية/,
      '/privacy': /سياسة الخصوصية/,
    };
    for (const [p, re] of Object.entries(pages)) {
      const { res, text } = await c.get(p);
      assert.equal(res.status, 200, p);
      assert.match(text, re, p);
    }
    const { res } = await c.get('/no-such-page');
    assert.equal(res.status, 404);
  });

  test('القائمة الفرعية لإشعارات ولي الأمر تحتوي الخيارات الثلاثة ومتابعة الطلب', async () => {
    const { text } = await new Client(S.base).get('/');
    for (const h of ['/notices/absence', '/notices/late', '/notices/permission', '/track']) assert.ok(text.includes(`href="${h}"`), h);
    assert.match(text, /aria-expanded="false"/);
  });

  test('ترويسات الأمان', async () => {
    const { res } = await new Client(S.base).get('/');
    assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });
});

describe('إشعار الغياب والتحقق', () => {
  test('إرسال صحيح يُحفظ في قاعدة البيانات ويُنشئ رقمًا فريدًا ورمز متابعة', async () => {
    const c = new Client(S.base);
    const { res, text } = await c.postForm('/notices/absence', absence());
    assert.equal(res.status, 200);
    const ticket = ticketOf(text);
    const code = codeOf(text);
    assert.match(ticket, /^ABS-\d{4}-[A-Z0-9]{6}$/);
    assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const row = S.db().prepare('SELECT * FROM requests WHERE ticket_no = ?').get(ticket) as any;
    assert.equal(row.kind, 'absence');
    assert.equal(row.status, 'received');
    assert.equal(row.student_name, 'طالبة اختبار آلي');
    assert.notEqual(row.secret_hash, code, 'لا يُخزَّن الرمز نفسه');
    assert.equal(count('SELECT COUNT(*) c FROM status_history WHERE request_id = ?', row.id), 1);
  });

  test('نموذج ناقص يُرفض ولا يُحفظ منه شيء', async () => {
    const before = count('SELECT COUNT(*) c FROM requests');
    const { res, text } = await new Client(S.base).postForm('/notices/absence', { student_name: '', grade: '', event_date: '', body: '' });
    assert.equal(res.status, 422);
    assert.match(text, /هذا الحقل مطلوب/);
    assert.match(text, /يوجد \d+ أخطاء/);
    assert.ok(!/id="tk"/.test(text), 'لا رسالة نجاح');
    assert.equal(count('SELECT COUNT(*) c FROM requests'), before);
  });

  test('تواريخ غير صحيحة أو خارج النطاق وإقرار غير مفعّل', async () => {
    const c = new Client(S.base);
    for (const bad of [{ event_date: '2020-01-01' }, { event_date: '2999-01-01' }, { event_date: '2026-02-30' }, { event_date: 'abc' }]) {
      const r = await c.postForm('/notices/absence', absence(bad));
      assert.equal(r.res.status, 422, JSON.stringify(bad));
    }
    const r = await c.postForm('/notices/absence', absence({ ack: '' }));
    assert.equal(r.res.status, 422);
    assert.match(r.text, /الإقرار مطلوب/);
  });

  test('منع تكرار الإرسال: نفس النموذج مرتين يُنشئ طلبًا واحدًا', async () => {
    const c = new Client(S.base);
    const t = await c.tokens('/notices/absence');
    const send = () =>
      c.request('/notices/absence', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...absence({ student_name: 'طالبة تكرار' }), _csrf: t.csrf, _nonce: t.nonce }),
      });
    const [a, b] = await Promise.all([send(), send()]);
    const texts = [await a.text(), await b.text()];
    assert.equal(count("SELECT COUNT(*) c FROM requests WHERE student_name = 'طالبة تكرار'"), 1);
    assert.ok(texts.some((x) => /تم استلام هذا الطلب مسبقًا/.test(x)) || texts.every((x) => /id="tk"/.test(x)));
  });

  test('طلب بلا رمز CSRF أو برمز خاطئ يُرفض (403)', async () => {
    const c = new Client(S.base);
    const a = await c.postForm('/notices/absence', absence(), '/notices/absence', { csrf: null });
    assert.equal(a.res.status, 403);
    const b = await c.postForm('/notices/absence', absence(), '/notices/absence', { csrf: 'x'.repeat(43) });
    assert.equal(b.res.status, 403);
  });

  test('Origin غريب يُرفض', async () => {
    const c = new Client(S.base);
    const t = await c.tokens('/notices/absence');
    const r = await c.request('/notices/absence', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' },
      body: new URLSearchParams({ ...absence(), _csrf: t.csrf, _nonce: t.nonce }),
    });
    assert.equal(r.status, 403);
  });

  test('حقل الفخ المخفي (robots honeypot) لا يُنشئ طلبًا', async () => {
    const before = count('SELECT COUNT(*) c FROM requests');
    const r = await new Client(S.base).postForm('/notices/absence', absence({ website: 'http://spam' }));
    assert.equal(r.res.status, 303);
    assert.equal(count('SELECT COUNT(*) c FROM requests'), before);
  });
});

describe('المرفقات', () => {
  const ok = (name = 'excuse.png', data = PNG) => ({ name: 'files', filename: name, data, type: 'image/png' });

  test('PNG صحيح يُقبل ويُخزَّن خارج المجلد العام', async () => {
    const c = new Client(S.base);
    const { res, text } = await c.postMultipart('/notices/absence', absence({ student_name: 'طالبة مرفق' }), [ok()]);
    assert.equal(res.status, 200);
    const t = ticketOf(text);
    const a = S.db().prepare('SELECT a.* FROM attachments a JOIN requests r ON r.id=a.request_id WHERE r.ticket_no=?').get(t) as any;
    assert.equal(a.mime, 'image/png');
    assert.match(a.stored_name, /^[0-9a-f-]{36}\.png$/);
    const pub = await c.get('/static/' + a.stored_name);
    assert.equal(pub.res.status, 404);
  });

  test('ملف تنفيذي بامتداد png يُرفض', async () => {
    const before = count('SELECT COUNT(*) c FROM requests');
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
    const { res, text } = await new Client(S.base).postMultipart('/notices/absence', absence(), [ok('virus.png', exe)]);
    assert.equal(res.status, 422);
    assert.match(text, /غير مدعوم/);
    assert.equal(count('SELECT COUNT(*) c FROM requests'), before);
  });

  test('امتداد لا يطابق المحتوى يُرفض', async () => {
    const { res, text } = await new Client(S.base).postMultipart('/notices/absence', absence(), [ok('doc.pdf', PNG)]);
    assert.equal(res.status, 422);
    assert.match(text, /لا يطابق محتواه/);
  });

  test('PDF يحتوي JavaScript يُرفض', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /JavaScript (app.alert(1)) >> endobj\n%%EOF');
    const { res } = await new Client(S.base).postMultipart('/notices/absence', absence(), [ok('x.pdf', pdf)]);
    assert.equal(res.status, 422);
  });

  test('تجاوز الحد الأقصى للحجم يُرفض', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 10, 0)]);
    const { res, text } = await new Client(S.base).postMultipart('/notices/absence', absence(), [ok('big.png', big)]);
    assert.ok([413, 422].includes(res.status), String(res.status));
    assert.match(text, /الحد الأقصى|يتجاوز/);
  });

  test('تجاوز عدد المرفقات يُرفض', async () => {
    const { res } = await new Client(S.base).postMultipart('/notices/absence', absence(), [ok('1.png'), ok('2.png'), ok('3.png'), ok('4.png')]);
    assert.equal(res.status, 422);
  });

  test('نموذج بلا مرفقات (صوت الطالبة) يرفض رفع ملفات', async () => {
    const { res } = await new Client(S.base).postMultipart(
      '/student-voice',
      { grade: 'الأول الابتدائي', category: 'فكرة تطويرية', subject: 'عنوان تجريبي', body: 'نص المشاركة التجريبية الطويل' },
      [ok()],
    );
    assert.equal(res.status, 422);
  });
});

describe('التأخر والاستئذان والمقترحات والآراء', () => {
  test('إشعار تأخر', async () => {
    const { res, text } = await new Client(S.base).postForm('/notices/late', { student_name: 'طالبة تأخر', grade: 'الثاني الابتدائي', event_date: today(), event_time: '07:45', body: 'ازدحام مروري' });
    assert.equal(res.status, 200);
    assert.match(ticketOf(text), /^LAT-/);
    const r = S.db().prepare("SELECT event_time FROM requests WHERE student_name='طالبة تأخر'").get() as any;
    assert.equal(r.event_time, '07:45');
  });

  test('طلب استئذان: تاريخ ماضٍ يُرفض ووسيلة التواصل مطلوبة ثم يُقبل', async () => {
    const c = new Client(S.base);
    const base = { student_name: 'طالبة استئذان', grade: 'الثالث الابتدائي', event_date: today(), event_time: '10:30', body: 'موعد طبي', submitter_name: 'ولي أمر تجريبي', contact: '0501234567', ack: 'on' };
    assert.equal((await c.postForm('/notices/permission', { ...base, event_date: '2020-01-01' })).res.status, 422);
    assert.equal((await c.postForm('/notices/permission', { ...base, contact: '' })).res.status, 422);
    assert.equal((await c.postForm('/notices/permission', { ...base, contact: '12345' })).res.status, 422);
    const ok = await c.postForm('/notices/permission', base);
    assert.equal(ok.res.status, 200);
    assert.match(ticketOf(ok.text), /^PRM-/);
  });

  test('مقترح (بلا اسم) وآراء أولياء الأمور وصوت الطالبة', async () => {
    const c = new Client(S.base);
    const s = await c.postForm('/suggestions', { submitter_type: 'ولي أمر', subject: 'مقترح اختبار', body: 'نص مقترح كافٍ للاختبار الآلي' });
    assert.equal(s.res.status, 200);
    assert.match(ticketOf(s.text), /^SUG-/);
    const o = await c.postForm('/parents-opinions', { subject: 'رأي اختبار', body: 'نص رأي كافٍ للاختبار', rating: '4 - جيد جدًا' });
    assert.equal(o.res.status, 200);
    assert.equal((S.db().prepare("SELECT rating FROM requests WHERE subject='رأي اختبار'").get() as any).rating, 4);
    const v = await c.postForm('/student-voice', { grade: 'الأول الابتدائي', category: 'فكرة تطويرية', subject: 'مشاركة اختبار', body: 'نص مشاركة كافٍ للاختبار' });
    assert.equal(v.res.status, 200);
  });

  test('بيانات التواصل غير الصالحة تُرفض', async () => {
    const r = await new Client(S.base).postForm('/complaints', { submitter_type: 'ولي أمر', subject: 'x'.repeat(5), category: 'أخرى', body: 'وصف كافٍ للشكوى الاختبارية', contact: 'not-a-contact' });
    assert.equal(r.res.status, 422);
  });
});

describe('متابعة الطلب والخصوصية', () => {
  let ticket = '';
  let code = '';
  before(async () => {
    const { text } = await new Client(S.base).postForm('/complaints', {
      submitter_type: 'ولي أمر',
      submitter_name: 'اسم سري للمشتكي',
      subject: 'موضوع شكوى سرية فريد',
      category: 'سلوك أو معاملة',
      body: 'تفاصيل الشكوى السرية الفريدة للاختبار',
    });
    ticket = ticketOf(text);
    code = codeOf(text);
  });

  test('رقم + رمز صحيحان يعرضان الحالة دون بيانات حساسة', async () => {
    const c = new Client(S.base);
    const { res, text } = await c.postForm('/track', { ticket, code }, '/track', { nonce: false });
    assert.equal(res.status, 200);
    assert.match(text, /تم الاستلام/);
    assert.ok(!text.includes('اسم سري للمشتكي'));
    assert.ok(!text.includes('تفاصيل الشكوى السرية'));
  });

  test('رمز خاطئ أو رقم مخمَّن لا يكشف شيئًا ولا يفرّق بين الحالتين', async () => {
    const c = new Client(S.base);
    const wrong = await c.postForm('/track', { ticket, code: 'AAAA-BBBB' }, '/track', { nonce: false });
    const none = await c.postForm('/track', { ticket: 'CMP-2026-ZZZZZZ', code: 'AAAA-BBBB' }, '/track', { nonce: false });
    assert.equal(wrong.res.status, 400);
    assert.equal(none.res.status, 400);
    assert.match(wrong.text, /تعذّر العثور على طلب مطابق/);
    assert.match(none.text, /تعذّر العثور على طلب مطابق/);
  });

  test('تحديد المعدّل: محاولات تخمين متكررة تُحظر مؤقتًا', async () => {
    const c = new Client(S.base);
    let blocked = false;
    for (let i = 0; i < 10; i++) {
      const r = await c.postForm('/track', { ticket, code: `AAAA-${i}BBB` }, '/track', { nonce: false });
      if (r.res.status === 429) blocked = true;
    }
    assert.ok(blocked, 'يجب أن تُحظر المحاولات بعد حد معيّن');
    // حتى الرمز الصحيح لا يُقبل أثناء الحظر
    const good = await c.postForm('/track', { ticket, code }, '/track', { nonce: false });
    assert.equal(good.res.status, 429);
  });

  test('الشكاوى والبيانات الخاصة لا تظهر في أي صفحة عامة', async () => {
    const c = new Client(S.base);
    for (const p of ['/', '/announcements', '/student-voice', '/parents-opinions', '/suggestions', '/complaints', '/incentives', '/surveys', '/events']) {
      const { text } = await c.get(p);
      assert.ok(!text.includes('موضوع شكوى سرية فريد'), p);
      assert.ok(!text.includes('اسم سري للمشتكي'), p);
      assert.ok(!text.includes('طالبة اختبار آلي'), p);
    }
  });

  test('مشاركة الطالبة لا تُنشر تلقائيًا', async () => {
    const { text } = await new Client(S.base).get('/student-voice');
    assert.ok(!text.includes('مشاركة اختبار'));
  });
});

describe('لوحة الإدارة: الحماية والصلاحيات', () => {
  test('بدون تسجيل دخول: كل مسارات الإدارة تُحوَّل إلى الدخول', async () => {
    const c = new Client(S.base);
    for (const p of ['/admin', '/admin/requests', '/admin/requests/1', '/admin/announcements', '/admin/users', '/admin/media', '/admin/attachments/1', '/admin/settings']) {
      const r = await c.request(p);
      assert.equal(r.status, 303, p);
      assert.match(r.headers.get('location') ?? '', /^\/admin\/login/, p);
    }
    const post = await c.postForm('/admin/demo/clear', {}, '/admin/login');
    assert.equal(post.res.status, 303);
    assert.match(post.res.headers.get('location') ?? '', /^\/admin\/login/);
  });

  test('كلمة مرور خاطئة 401 ورسالة عامة، ثم قفل الحساب بعد محاولات متكررة', async () => {
    const admin = await adminClient(S);
    const created = await admin.postForm('/admin/users', { display_name: 'موظف قفل', username: 'locky', role: 'staff', password: 'Locky-Pass-2026' }, '/admin/users');
    assert.equal(created.res.status, 303);
    const c = new Client(S.base);
    for (let i = 0; i < 5; i++) {
      const r = await c.login('locky', 'wrong-password-' + i);
      assert.equal(r.res.status, 401);
      assert.match(r.text, /اسم المستخدم أو كلمة المرور غير صحيحة/);
    }
    const locked = await c.login('locky', 'Locky-Pass-2026');
    assert.equal(locked.res.status, 429, 'الحساب مقفل مؤقتًا حتى مع كلمة مرور صحيحة');
  });

  test('تسجيل دخول المشرفة وفتح اللوحة؛ والخروج ينهي الجلسة', async () => {
    const c = await adminClient(S);
    const dash = await c.get('/admin');
    assert.equal(dash.res.status, 200);
    assert.match(dash.text, /لوحة المتابعة/);
    assert.ok((c.cookies.get('sid') ?? '').length > 20);
    const out = await c.postForm('/admin/logout', {}, '/admin');
    assert.equal(out.res.status, 303);
    assert.equal((await c.request('/admin')).status, 303);
  });

  test('الموظف المخوّل لا يرى الشكاوى ولا صفحات المشرفة (التحقق على الخادم)', async () => {
    const admin = await adminClient(S);
    await admin.postForm('/admin/users', { display_name: 'موظفة', username: 'staff1', role: 'staff', password: 'Staff-Pass-2026' }, '/admin/users');
    const cid = (S.db().prepare("SELECT id FROM requests WHERE kind='complaint' LIMIT 1").get() as any).id;
    const aid = (S.db().prepare("SELECT id FROM requests WHERE kind='absence' LIMIT 1").get() as any).id;

    const st = new Client(S.base);
    assert.equal((await st.login('staff1', 'Staff-Pass-2026')).res.status, 303);
    assert.equal((await st.get(`/admin/requests/${cid}`)).res.status, 403);
    assert.equal((await st.get(`/admin/requests/${aid}`)).res.status, 200);
    for (const p of ['/admin/users', '/admin/settings', '/admin/surveys', '/admin/initiatives', '/admin/media']) assert.equal((await st.get(p)).res.status, 403, p);
    const list = await st.get('/admin/requests?kind=complaint');
    assert.ok(!list.text.includes('موضوع شكوى سرية فريد'));
    const del = await st.postForm(`/admin/requests/${aid}/delete`, {}, `/admin/requests/${aid}`);
    assert.equal(del.res.status, 403);
    const status = await st.postForm(`/admin/requests/${cid}/status`, { status: 'closed' }, `/admin/requests/${aid}`);
    assert.equal(status.res.status, 403);
    assert.equal((S.db().prepare('SELECT status FROM requests WHERE id=?').get(cid) as any).status, 'received');
  });

  test('بعد تعطيل مستخدم تُنهى جلساته فورًا', async () => {
    const admin = await adminClient(S);
    await admin.postForm('/admin/users', { display_name: 'مؤقت', username: 'temp1', role: 'staff', password: 'Temp1-Pass-2026' }, '/admin/users');
    const st = new Client(S.base);
    await st.login('temp1', 'Temp1-Pass-2026');
    assert.equal((await st.get('/admin')).res.status, 200);
    const uid = (S.db().prepare("SELECT id FROM users WHERE username='temp1'").get() as any).id;
    await admin.postForm(`/admin/users/${uid}/toggle`, {}, '/admin/users');
    assert.equal((await st.request('/admin')).status, 303);
  });

  test('كلمات المرور مشفّرة ولا يوجد حساب افتراضي', async () => {
    const rows = S.db().prepare('SELECT username, password_hash FROM users').all() as any[];
    for (const r of rows) {
      assert.match(r.password_hash, /^scrypt\$/);
      assert.ok(!r.password_hash.includes(ADMIN_PW));
    }
    const c = new Client(S.base);
    for (const [u, p] of [['admin', 'admin'], ['admin', 'password'], ['manal', 'manal']]) assert.equal((await c.login(u, p)).res.status, 401);
  });

  test('إعادة التوجيه بعد الدخول لا تقبل روابط خارجية', async () => {
    const c = new Client(S.base);
    const t = await c.tokens('/admin/login');
    const r = await c.request('/admin/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: 'manal', password: ADMIN_PW, next: 'https://evil.example', _csrf: t.csrf }) });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/admin');
  });
});

describe('إدارة الطلبات والمتابعة', () => {
  test('تغيير الحالة من اللوحة ينعكس على صفحة المتابعة مع الملاحظة العامة وسجل الحالات', async () => {
    const pub = new Client(S.base);
    const sub = await pub.postForm('/notices/absence', absence({ student_name: 'طالبة متابعة' }));
    const ticket = ticketOf(sub.text);
    const code = codeOf(sub.text);
    const id = (S.db().prepare('SELECT id FROM requests WHERE ticket_no=?').get(ticket) as any).id;

    const admin = await adminClient(S);
    const detail = await admin.get(`/admin/requests/${id}`);
    assert.match(detail.text, /طالبة متابعة/);
    const r = await admin.postForm(`/admin/requests/${id}/status`, { status: 'approved', public_note: 'تمت الموافقة على العذر' }, `/admin/requests/${id}`);
    assert.equal(r.res.status, 303);
    const n = await admin.postForm(`/admin/requests/${id}/note`, { note: 'ملاحظة داخلية سرية للاختبار' }, `/admin/requests/${id}`);
    assert.equal(n.res.status, 303);

    const track = await new Client(S.base).postForm('/track', { ticket, code }, '/track', { nonce: false });
    assert.match(track.text, /تمت الموافقة/);
    assert.match(track.text, /تمت الموافقة على العذر/);
    assert.ok(!track.text.includes('ملاحظة داخلية سرية للاختبار'), 'الملاحظة الداخلية لا تظهر لمقدم الطلب');
    assert.ok(!track.text.includes('طالبة متابعة'));
    assert.equal(count('SELECT COUNT(*) c FROM status_history WHERE request_id=?', id), 2);

    const bad = await admin.postForm(`/admin/requests/${id}/status`, { status: 'published' }, `/admin/requests/${id}`);
    assert.equal(bad.res.status, 303);
    assert.equal((S.db().prepare('SELECT status FROM requests WHERE id=?').get(id) as any).status, 'approved', 'حالة غير مسموحة لهذا النوع');
  });

  test('البحث والتصفية حسب النوع والحالة والتاريخ، و404 لطلب غير موجود', async () => {
    const admin = await adminClient(S);
    const a = await admin.get('/admin/requests?kind=absence&q=' + encodeURIComponent('طالبة متابعة'));
    assert.match(a.text, /طالبة متابعة/);
    assert.ok(!a.text.includes('طالبة تأخر'));
    const s = await admin.get('/admin/requests?status=approved');
    assert.match(s.text, /تمت الموافقة/);
    const d = await admin.get(`/admin/requests?from=${today()}&to=${today()}`);
    assert.equal(d.res.status, 200);
    const inj = await admin.get('/admin/requests?q=' + encodeURIComponent("%' OR 1=1 --"));
    assert.equal(inj.res.status, 200);
    assert.equal((await admin.get('/admin/requests/999999')).res.status, 404);
  });

  test('تنزيل المرفق يتطلب تسجيل الدخول', async () => {
    const aid = (S.db().prepare('SELECT id FROM attachments LIMIT 1').get() as any).id;
    const anon = await new Client(S.base).request(`/admin/attachments/${aid}`);
    assert.equal(anon.status, 303);
    const admin = await adminClient(S);
    const r = await admin.request(`/admin/attachments/${aid}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.match(r.headers.get('content-disposition') ?? '', /attachment/);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
  });

  test('نشر مشاركة طالبة بعد المراجعة يعرضها بدون اسم؛ والرسالة الخاصة لا تُنشر', async () => {
    const admin = await adminClient(S);
    const pub = new Client(S.base);
    const mk = async (subject: string, priv = '') => {
      const r = await pub.postForm('/student-voice', { student_name: 'اسم الطالبة المخفي', grade: 'الأول الابتدائي', category: 'فكرة تطويرية', subject, body: 'نص المشاركة الكافي للاختبار الآلي', is_private: priv });
      return (S.db().prepare('SELECT id FROM requests WHERE ticket_no=?').get(ticketOf(r.text)) as any).id as number;
    };
    const id1 = await mk('مشاركة للنشر');
    const id2 = await mk('مشاركة خاصة', 'on');
    for (const id of [id1, id2]) await admin.postForm(`/admin/requests/${id}/status`, { status: 'published' }, `/admin/requests/${id}`);
    const { text } = await pub.get('/student-voice');
    assert.match(text, /مشاركة للنشر/);
    assert.ok(!text.includes('مشاركة خاصة'));
    assert.ok(!text.includes('اسم الطالبة المخفي'));
  });
});

describe('إدارة المحتوى', () => {
  test('الإعلانات: إضافة (مسودة) ثم نشر ثم تعديل ثم إخفاء ثم حذف', async () => {
    const admin = await adminClient(S);
    const pub = new Client(S.base);
    const c = await admin.postForm('/admin/announcements/new', { title: 'إعلان اختبار آلي', body: 'نص الإعلان الأول', category: 'الفعاليات المدرسية', event_date: '2030-01-15', status: 'draft' }, '/admin/announcements/new');
    assert.equal(c.res.status, 303);
    const id = (S.db().prepare("SELECT id FROM announcements WHERE title='إعلان اختبار آلي'").get() as any).id;
    assert.ok(!(await pub.get('/announcements')).text.includes('إعلان اختبار آلي'), 'المسودة غير ظاهرة');
    assert.equal((await pub.get(`/announcements/${id}`)).res.status, 404);

    await admin.postForm(`/admin/announcements/${id}/status`, { status: 'published' }, '/admin/announcements');
    const list = await pub.get('/announcements');
    assert.match(list.text, /إعلان اختبار آلي/);
    assert.match(list.text, /جديد/);
    const det = await pub.get(`/announcements/${id}`);
    assert.equal(det.res.status, 200);
    assert.match(det.text, /نص الإعلان الأول/);

    const up = await admin.postForm(`/admin/announcements/${id}/edit`, { title: 'إعلان اختبار معدّل', body: 'نص معدّل', category: 'التكريم والإنجازات', status: 'published', pinned: '1' }, `/admin/announcements/${id}/edit`);
    assert.equal(up.res.status, 303);
    assert.match((await pub.get('/announcements?cat=' + encodeURIComponent('التكريم والإنجازات'))).text, /إعلان اختبار معدّل/);

    const bad = await admin.postForm(`/admin/announcements/${id}/edit`, { title: '', body: 'x', category: 'x', status: 'published' }, `/admin/announcements/${id}/edit`);
    assert.equal(bad.res.status, 422);

    await admin.postForm(`/admin/announcements/${id}/status`, { status: 'hidden' }, '/admin/announcements');
    assert.ok(!(await pub.get('/announcements')).text.includes('إعلان اختبار معدّل'));
    await admin.postForm(`/admin/announcements/${id}/delete`, {}, '/admin/announcements');
    assert.equal(count('SELECT COUNT(*) c FROM announcements WHERE id=?', id), 0);
  });

  test('الإعلان يُهرَّب من HTML (XSS)', async () => {
    const admin = await adminClient(S);
    await admin.postForm('/admin/announcements/new', { title: '<script>alert(1)</script>', body: '<img src=x onerror=alert(1)>', category: 'الفعاليات المدرسية', status: 'published' }, '/admin/announcements/new');
    const { text } = await new Client(S.base).get('/announcements');
    assert.ok(!text.includes('<script>alert(1)</script>'));
    assert.match(text, /&lt;script&gt;/);
  });

  test('المبادرات (وسائل التحفيز): إضافة ونشر وتعديل وحذف', async () => {
    const admin = await adminClient(S);
    const pub = new Client(S.base);
    assert.equal((await admin.postForm('/admin/initiatives/new', { name: '', description: '', audience: '', icon: 'star', status: 'active' }, '/admin/initiatives/new')).res.status, 422);
    const r = await admin.postForm('/admin/initiatives/new', { name: 'مبادرة اختبار', description: 'وصف المبادرة', audience: 'جميع الطالبات', icon: 'trophy', status: 'active', start_date: '2026-09-01', end_date: '2026-12-01', sort_order: '1' }, '/admin/initiatives/new');
    assert.equal(r.res.status, 303);
    assert.match((await pub.get('/incentives')).text, /مبادرة اختبار/);
    const id = (S.db().prepare("SELECT id FROM initiatives WHERE name='مبادرة اختبار'").get() as any).id;
    await admin.postForm(`/admin/initiatives/${id}/edit`, { name: 'مبادرة اختبار', description: 'وصف', audience: 'x', icon: 'star', status: 'draft' }, `/admin/initiatives/${id}/edit`);
    assert.ok(!(await pub.get('/incentives')).text.includes('مبادرة اختبار'));
    await admin.postForm(`/admin/initiatives/${id}/delete`, {}, '/admin/initiatives');
    assert.equal(count('SELECT COUNT(*) c FROM initiatives WHERE id=?', id), 0);
  });

  test('الاستبانات: لا تُعرض إلا بعد النشر، وبالنتائج المجمّعة فقط', async () => {
    const admin = await adminClient(S);
    const pub = new Client(S.base);
    const c = await admin.postForm('/admin/surveys/new', { title: 'استبانة اختبار', description: 'وصف', participants: '40', status: 'draft' }, '/admin/surveys/new');
    assert.equal(c.res.status, 303);
    const id = (S.db().prepare("SELECT id FROM surveys WHERE title='استبانة اختبار'").get() as any).id;
    await admin.postForm(`/admin/surveys/${id}/items`, { question: 'ما أكثر ما يحفزك؟', option_label: 'التكريم', votes: '30' }, `/admin/surveys/${id}/edit`);
    await admin.postForm(`/admin/surveys/${id}/items`, { question: 'ما أكثر ما يحفزك؟', option_label: 'الأنشطة', votes: '10' }, `/admin/surveys/${id}/edit`);
    assert.ok(!(await pub.get('/surveys')).text.includes('استبانة اختبار'), 'مسودة');
    await admin.postForm(`/admin/surveys/${id}/edit`, { title: 'استبانة اختبار', participants: '40', status: 'published' }, `/admin/surveys/${id}/edit`);
    const { text } = await pub.get('/surveys');
    assert.match(text, /استبانة اختبار/);
    assert.match(text, /75%/);
    assert.match(text, /25%/);
    assert.match(text, /عدد المشاركات/);
    const bad = await admin.postForm(`/admin/surveys/${id}/items`, { question: 'س', option_label: 'خ', votes: '-5' }, `/admin/surveys/${id}/edit`);
    assert.equal(bad.res.status, 422);
  });

  test('الوسائط: لا نشر دون تأكيد الموافقة، ولا تُقدَّم المسودة للعامة', async () => {
    const admin = await adminClient(S);
    const pub = new Client(S.base);
    const up = await admin.postMultipart('/admin/media', { title: 'صورة اختبار', category: 'الفعاليات المدرسية', publish: '1' }, [{ name: 'file', filename: 'a.png', data: PNG, type: 'image/png' }], '/admin/media');
    assert.equal(up.res.status, 303);
    assert.match(up.res.headers.get('location') ?? '', /m=needconsent/);
    const m = S.db().prepare("SELECT * FROM media WHERE title='صورة اختبار'").get() as any;
    assert.equal(m.status, 'draft');
    assert.equal((await pub.get(`/media/${m.id}`)).res.status, 404);
    assert.equal((await new Client(S.base).request(`/admin/media/${m.id}/file`)).status, 303);

    const early = await admin.postForm(`/admin/media/${m.id}/status`, { status: 'published' }, '/admin/media');
    assert.match(early.res.headers.get('location') ?? '', /needconsent/);
    assert.equal((await pub.get(`/media/${m.id}`)).res.status, 404);

    await admin.postForm(`/admin/media/${m.id}/edit`, { title: 'صورة اختبار', category: 'الفعاليات المدرسية', consent: '1' }, `/admin/media/${m.id}/edit`);
    await admin.postForm(`/admin/media/${m.id}/status`, { status: 'published' }, '/admin/media');
    const f = await pub.request(`/media/${m.id}`);
    assert.equal(f.status, 200);
    assert.equal(f.headers.get('content-type'), 'image/png');
    assert.match((await pub.get('/events')).text, /صورة اختبار/);

    await admin.postForm(`/admin/media/${m.id}/edit`, { title: 'صورة اختبار', category: 'الفعاليات المدرسية' }, `/admin/media/${m.id}/edit`);
    assert.equal((await pub.get(`/media/${m.id}`)).res.status, 404, 'سحب الموافقة يلغي النشر');

    const evil = await admin.postMultipart('/admin/media', { title: 'x', category: 'الفعاليات المدرسية' }, [{ name: 'file', filename: 'a.png', data: Buffer.from('<?php echo 1;'), type: 'image/png' }], '/admin/media');
    assert.equal(evil.res.status, 422);
  });

  test('المحتوى التعريفي للصفحة الرئيسية قابل للتعديل من اللوحة', async () => {
    const admin = await adminClient(S);
    await admin.postForm('/admin/settings', { welcome_title: 'عنوان ترحيب جديد', welcome_text: 'نص ترحيب جديد', intro_text: 'نص تعريفي جديد للاختبار' }, '/admin/settings');
    const { text } = await new Client(S.base).get('/');
    assert.match(text, /عنوان ترحيب جديد/);
    assert.match(text, /نص تعريفي جديد للاختبار/);
  });

  test('حذف البيانات التجريبية يحذف المعلَّم فقط', async () => {
    const dbw = (await import('node:sqlite')).DatabaseSync;
    const w = new dbw(S.dataDir + '/platform.db');
    w.exec("PRAGMA busy_timeout=5000; INSERT INTO announcements(title,body,category,status,is_demo,created_at,updated_at) VALUES ('عنصر تجريبي','x','الفعاليات المدرسية','published',1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')");
    w.close();
    const admin = await adminClient(S);
    const before = count('SELECT COUNT(*) c FROM requests');
    const dash = await admin.get('/admin');
    assert.match(dash.text, /عناصر تجريبية/);
    await admin.postForm('/admin/demo/clear', {}, '/admin');
    assert.equal(count('SELECT COUNT(*) c FROM announcements WHERE is_demo=1'), 0);
    assert.equal(count('SELECT COUNT(*) c FROM requests'), before);
  });
});

describe('الأخطاء', () => {
  test('حجم جسم الطلب الكبير يُرفض برسالة عربية', async () => {
    const c = new Client(S.base);
    const t = await c.tokens('/track');
    const r = await c.request('/track', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: t.csrf, ticket: 'x'.repeat(300 * 1024) }) });
    assert.equal(r.status, 413);
    assert.match(await r.text(), /حجم/);
  });

  test('طريقة غير مسموحة وملف ثابت خارج المجلد', async () => {
    const c = new Client(S.base);
    const r = await c.request('/track', { method: 'PUT' });
    assert.ok([404, 405].includes(r.status));
    assert.equal((await c.get('/static/..%2f..%2fpackage.json')).res.status, 404);
    assert.equal((await c.get('/static/css/app.css')).res.status, 200);
  });
});
