// اختبار واجهة في متصفح حقيقي (اختياري): npm i -D playwright && npx playwright install chromium && npm run test:ui
// متغيرات اختيارية: SHOTS=مجلد حفظ لقطات الشاشة، PLAYWRIGHT_MODULES=مسار node_modules يحتوي playwright
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ADMIN_PW, ROOT, startServer } from '../helpers.ts';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  const req = createRequire(path.join(process.env.PLAYWRIGHT_MODULES ?? '/usr/lib/node_modules', 'x.js'));
  ({ chromium } = req('playwright'));
}

const shots = process.env.SHOTS ?? path.join(ROOT, 'test-results');
mkdirSync(shots, { recursive: true });
const S = await startServer();
spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/cli/seed.ts'], { cwd: ROOT, env: { ...process.env, DATA_DIR: S.dataDir }, stdio: 'ignore' });

const browser = await chromium.launch();
let failed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log('✔', name);
  } catch (e) {
    failed++;
    console.log('✖', name, '\n   ', e.message);
  }
};

for (const vp of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'tablet', width: 820, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'ar-SA', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|Failed to load resource/.test(m.text()) && errors.push(m.text()));

  const pages = ['/', '/notices', '/notices/absence', '/notices/late', '/notices/permission', '/track', '/student-voice', '/parents-opinions', '/incentives', '/surveys', '/announcements', '/events', '/suggestions', '/complaints', '/privacy', '/admin/login'];
  for (const p of pages) {
    await check(`${vp.name} ${p}: بلا تمرير أفقي وأخطاء`, async () => {
      await page.goto(S.base + p, { waitUntil: 'load' });
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, dir: document.documentElement.dir, imgs: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length }));
      assert.equal(m.dir, 'rtl');
      assert.ok(m.sw <= m.iw + 1, `overflow ${m.sw} > ${m.iw}`);
      assert.equal(m.imgs, 0, 'صورة لم تُحمَّل');
    });
  }
  await page.goto(S.base + '/', { waitUntil: 'load' });
  await page.screenshot({ path: path.join(shots, `${vp.name}-home.png`), fullPage: true });

  if (vp.width < 900) {
    await check(`${vp.name}: قائمة الجوال تفتح وتُغلق`, async () => {
      await page.goto(S.base + '/', { waitUntil: 'load' });
      const nav = page.locator('#mainnav');
      assert.equal(await nav.isVisible(), false);
      await page.click('.nav-toggle');
      assert.equal(await nav.isVisible(), true);
      await page.click('.sub-toggle');
      assert.equal(await page.locator('#sub-notices').isVisible(), true);
      await page.screenshot({ path: path.join(shots, `${vp.name}-menu.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#mainnav').isVisible(), false);
    });
  } else {
    await check(`${vp.name}: القائمة الفرعية تفتح وتُغلق`, async () => {
      await page.goto(S.base + '/', { waitUntil: 'load' });
      const sub = page.locator('#sub-notices');
      assert.equal(await sub.isVisible(), false);
      await page.click('.sub-toggle');
      assert.equal(await sub.isVisible(), true);
      await page.screenshot({ path: path.join(shots, `${vp.name}-submenu.png`) });
      await page.click('#sub-notices a[href="/notices/late"]');
      await page.waitForURL('**/notices/late');
      await page.click('.sub-toggle');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#sub-notices').isVisible(), false);
    });
  }

  await check(`${vp.name}: نموذج الغياب — أخطاء ثم نجاح ثم رقم الطلب`, async () => {
    await page.goto(S.base + '/notices/absence', { waitUntil: 'load' });
    await page.click('button[type=submit]');
    await page.waitForSelector('.field-err');
    assert.ok((await page.locator('.field-err').count()) >= 4);
    await page.screenshot({ path: path.join(shots, `${vp.name}-absence-errors.png`), fullPage: true });
    await page.fill('#f_student_name', 'طالبة واجهة اختبار');
    await page.selectOption('#f_grade', 'الأول الابتدائي');
    await page.fill('#f_event_date', new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date()));
    await page.fill('#f_body', 'سبب الغياب');
    await page.check('#f_ack');
    await page.click('button[type=submit]');
    await page.waitForSelector('#tk');
    const t = await page.textContent('#tk');
    const c = await page.textContent('#tc');
    assert.match(t, /^ABS-/);
    await page.screenshot({ path: path.join(shots, `${vp.name}-absence-success.png`), fullPage: true });
    await page.goto(S.base + '/track');
    await page.fill('#ticket', t.trim());
    await page.fill('#code', c.trim());
    await page.click('button[type=submit]');
    await page.waitForSelector('.timeline');
    assert.match(await page.textContent('main'), /تم الاستلام/);
  });

  await check(`${vp.name}: مرفق كبير يُرفض في المتصفح قبل الإرسال`, async () => {
    await page.goto(S.base + '/notices/absence', { waitUntil: 'load' });
    await page.setInputFiles('#f_files', { name: 'a.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
    await page.waitForSelector('.js-file-err:not([hidden])');
  });

  await check(`${vp.name}: لوحة الإدارة`, async () => {
    await page.goto(S.base + '/admin', { waitUntil: 'load' });
    assert.match(page.url(), /\/admin\/login/);
    await page.fill('#u', 'manal');
    await page.fill('#p', ADMIN_PW);
    await page.click('button[type=submit]');
    await page.waitForURL('**/admin');
    await page.screenshot({ path: path.join(shots, `${vp.name}-admin.png`), fullPage: true });
    const m = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    assert.ok(m, 'overflow في لوحة الإدارة');
    for (const p of ['/admin/requests', '/admin/announcements', '/admin/initiatives', '/admin/surveys', '/admin/media', '/admin/settings', '/admin/users']) {
      const r = await page.goto(S.base + p, { waitUntil: 'load' });
      assert.equal(r.status(), 200, p);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `overflow ${p}`);
    }
  });

  await check(`${vp.name}: بلا أخطاء JavaScript`, async () => assert.deepEqual(errors, []));
  await ctx.close();
}
await browser.close();
await S.stop();
console.log(failed ? `\n${failed} اختبار فشل` : '\nنجحت جميع اختبارات الواجهة');
process.exit(failed ? 1 : 0);
