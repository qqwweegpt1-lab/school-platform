import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const ADMIN_PW = 'Test-Admin-Pass-2026';

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
}

export interface TestServer {
  base: string;
  dataDir: string;
  db: () => DatabaseSync;
  stop: () => Promise<void>;
}

export async function startServer(extraEnv: Record<string, string> = {}): Promise<TestServer> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'plat-test-'));
  const port = await freePort();
  const env = { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'development', SUBMIT_LIMIT_PER_HOUR: '500', ...extraEnv };
  const cli = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/cli/create-admin.ts'], {
    cwd: ROOT,
    env: { ...env, ADMIN_USERNAME: 'manal', ADMIN_DISPLAY_NAME: 'أ. منال الجهني', ADMIN_PASSWORD: ADMIN_PW },
    encoding: 'utf8',
  });
  if (cli.status !== 0) throw new Error('create-admin failed: ' + cli.stderr + cli.stdout);
  const child: ChildProcess = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout?.on('data', (d) => (log += d));
  child.stderr?.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + '/healthz');
      if (r.ok) break;
    } catch {
      /* لم يبدأ بعد */
    }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw new Error('server did not start: ' + log);
  }
  return {
    base,
    dataDir,
    db: () => new DatabaseSync(path.join(dataDir, 'platform.db'), { readOnly: true }),
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export class Client {
  cookies = new Map<string, string>();
  base: string;
  constructor(base: string) {
    this.base = base;
  }

  private jar() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(p: string, init: { method?: string; body?: BodyInit; headers?: Record<string, string> } = {}) {
    const res = await fetch(this.base + p, { redirect: 'manual', ...init, headers: { cookie: this.jar(), ...(init.headers ?? {}) } });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const val = decodeURIComponent(pair.slice(i + 1));
      if (/Max-Age=0/i.test(sc)) this.cookies.delete(name);
      else this.cookies.set(name, val);
    }
    return res;
  }

  async get(p: string) {
    const res = await this.request(p);
    return { res, text: await res.text() };
  }

  async tokens(p: string) {
    const { text } = await this.get(p);
    return {
      csrf: /name="_csrf" value="([^"]+)"/.exec(text)?.[1] ?? '',
      nonce: /name="_nonce" value="([^"]+)"/.exec(text)?.[1] ?? '',
      text,
    };
  }

  /** يرسل نموذجًا urlencoded مع رمز CSRF (يُجلب من الصفحة المحددة) */
  async postForm(p: string, fields: Record<string, string>, from = p, opts: { csrf?: string | null; nonce?: boolean } = {}) {
    const t = await this.tokens(from);
    const body = new URLSearchParams(fields);
    if (opts.csrf !== null) body.set('_csrf', opts.csrf ?? t.csrf);
    if (opts.nonce !== false && t.nonce && !fields._nonce) body.set('_nonce', t.nonce);
    const res = await this.request(p, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    return { res, text: await res.text() };
  }

  async postMultipart(p: string, fields: Record<string, string>, files: { name: string; filename: string; data: Buffer; type?: string }[], from = p) {
    const t = await this.tokens(from);
    const fd = new FormData();
    fd.set('_csrf', t.csrf);
    if (t.nonce) fd.set('_nonce', t.nonce);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    for (const f of files) fd.append(f.name, new Blob([new Uint8Array(f.data)], { type: f.type ?? 'application/octet-stream' }), f.filename);
    const res = await this.request(p, { method: 'POST', body: fd });
    return { res, text: await res.text() };
  }

  async login(username: string, password: string) {
    return this.postForm('/admin/login', { username, password }, '/admin/login');
  }
}

export async function adminClient(s: TestServer) {
  const c = new Client(s.base);
  const r = await c.login('manal', ADMIN_PW);
  if (r.res.status !== 303) throw new Error('admin login failed ' + r.res.status);
  return c;
}

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
export const ticketOf = (html: string) => /id="tk">([A-Z]{3}-\d{4}-[A-Z0-9]{6})</.exec(html)?.[1] ?? '';
export const codeOf = (html: string) => /id="tc">([A-Z0-9]{4}-[A-Z0-9]{4})</.exec(html)?.[1] ?? '';
