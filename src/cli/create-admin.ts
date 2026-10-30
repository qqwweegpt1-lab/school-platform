// إنشاء حساب المشرفة الأولى بأمان. لا توجد حسابات أو كلمات مرور افتراضية في المشروع.
// الاستخدام التفاعلي:   npm run create-admin
// أو عبر المتغيرات:     ADMIN_USERNAME=... ADMIN_DISPLAY_NAME=... ADMIN_PASSWORD=... npm run create-admin
import { createInterface } from 'node:readline';
import { get, nowIso, run } from '../db.ts';
import { hashPassword, validatePasswordStrength } from '../security.ts';

/** سؤال عادي (الإدخال ظاهر). تُنشأ واجهة readline واحدة لكل سؤال ثم تُغلق. */
function ask(q: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(q, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });
}

/**
 * قراءة كلمة المرور دون إظهارها، بالوضع الخام للطرفية (يعمل على Windows PowerShell وcmd وLinux وmacOS).
 * لا يُعتمد على أي دوال داخلية غير موثقة في readline، ويبقى stdin نشطًا حتى يضغط المستخدم Enter.
 */
function askHidden(q: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('الطرفية لا تدعم إخفاء كلمة المرور. عرّفوا ADMIN_PASSWORD كمتغير بيئة بدل ذلك.'));
      return;
    }
    process.stdout.write(q);
    let buf = '';
    const finish = (err?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      if (err) reject(err);
      else resolve(buf);
    };
    const onData = (chunk: string) => {
      // قد تصل عدة أحرف في دفعة واحدة (لصق) أو تسلسلات مفاتيح خاصة
      if (chunk.startsWith('\u001b')) return; // الأسهم ومفاتيح الوظائف: تُتجاهل
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u0003') return finish(new Error('تم إلغاء العملية.')); // Ctrl+C
        if (ch === '\u0004') return finish(); // Ctrl+D
        if (ch === '\u007f' || ch === '\b') {
          buf = Array.from(buf).slice(0, -1).join('');
          continue;
        }
        if (ch >= ' ') buf += ch;
      }
    };
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

const interactive = process.stdin.isTTY;
let username = process.env.ADMIN_USERNAME?.trim() ?? '';
let display = process.env.ADMIN_DISPLAY_NAME?.trim() ?? '';
let password = process.env.ADMIN_PASSWORD ?? '';

if (!username && interactive) username = await ask('اسم المستخدم (أحرف إنجليزية وأرقام): ');
if (!display && interactive) display = await ask('الاسم المعروض (مثال: أ. منال الجهني): ');
if (!password && interactive) {
  try {
    password = await askHidden('كلمة المرور (10 أحرف على الأقل، أحرف وأرقام): ');
    const again = await askHidden('أعد كتابة كلمة المرور: ');
    if (again !== password) {
      console.error('كلمتا المرور غير متطابقتين.');
      process.exit(1);
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) {
  console.error('اسم المستخدم غير صالح (3–40 حرفًا إنجليزيًا أو رقمًا أو _ . -).');
  process.exit(1);
}
if (!display) display = username;
const weak = validatePasswordStrength(password);
if (weak) {
  console.error(weak);
  process.exit(1);
}
if (get('SELECT id FROM users WHERE username = ?', username)) {
  console.error('اسم المستخدم موجود مسبقًا.');
  process.exit(1);
}
run('INSERT INTO users(username, display_name, password_hash, role, created_at) VALUES (?,?,?,?,?)', username, display, hashPassword(password), 'admin', nowIso());
console.log(`تم إنشاء حساب المشرفة «${username}». يمكنكم تسجيل الدخول من /admin/login`);