import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from './config.ts';
import { get, run, nowIso, type Row } from './db.ts';

// ───────── كلمات المرور (scrypt) ─────────
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT);
  return timingSafeEqual(actual, expected);
}

// تجزئة وهمية للتقليل من الفرق الزمني عند اسم مستخدم غير موجود
const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'));
export const dummyVerify = (p: string) => verifyPassword(p, DUMMY_HASH);

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 10) return 'يجب ألا تقل كلمة المرور عن 10 أحرف.';
  if (!/[A-Za-z؀-ۿ]/.test(pw) || !/\d/.test(pw)) return 'يجب أن تحتوي كلمة المرور على أحرف وأرقام.';
  return null;
}

// ───────── أدوات الرموز ─────────
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const hmac = (s: string) => createHmac('sha256', config.secret).update(s).digest('hex');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // بدون أحرف ملتبسة (O/0/I/1/L)
export function randomCode(len: number): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function newTicketNo(prefix: string): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${randomCode(6)}`;
}

/** رمز المتابعة السري: XXXX-XXXX (يُعرض مرة واحدة ويُخزَّن مجزّأً فقط) */
export function newSecretCode(): string {
  const c = randomCode(8);
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashSecretCode = (code: string) => hmac('ticket:' + normalizeCode(code));

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

// ───────── الجلسات ─────────
export interface SessionUser {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'staff';
}

export function createSession(userId: number, ip: string, ua: string): { token: string; expires: Date } {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionHours * 3600_000);
  run(
    'INSERT INTO sessions(token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?)',
    sha256(token),
    userId,
    nowIso(),
    expires.toISOString(),
    ip,
    ua.slice(0, 200),
  );
  return { token, expires };
}

export type SessionLookup = { user: SessionUser } | { expired: true } | null;

export function lookupSession(token: string | undefined): SessionLookup {
  if (!token) return null;
  const r = get(
    `SELECT s.expires_at, u.id, u.username, u.display_name, u.role, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    sha256(token),
  ) as Row | undefined;
  if (!r) return null;
  if (!r.active) return null;
  if (new Date(r.expires_at as string).getTime() < Date.now()) {
    destroySession(token);
    return { expired: true };
  }
  return { user: { id: r.id, username: r.username, display_name: r.display_name, role: r.role } };
}

export function destroySession(token: string | undefined) {
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}
export function destroyUserSessions(userId: number) {
  run('DELETE FROM sessions WHERE user_id = ?', userId);
}
export function purgeExpiredSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', nowIso());
}

// ───────── CSRF ─────────
export const newCsrfCookie = () => randomBytes(24).toString('base64url');
export const csrfField = (cookieVal: string) => hmac('csrf:' + cookieVal);
export function csrfValid(cookieVal: string | undefined, field: string | undefined): boolean {
  if (!cookieVal || !field) return false;
  const expected = csrfField(cookieVal);
  const a = Buffer.from(expected);
  const b = Buffer.from(field);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ───────── تحديد المعدّل (في الذاكرة) ─────────
interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

/** يعيد true إذا ما زال ضمن الحد المسموح، ويسجّل المحاولة */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= max;
}
export function rateLimitPeek(key: string, max: number): boolean {
  const b = buckets.get(key);
  return !b || b.resetAt < Date.now() || b.count < max;
}
export function rateLimitReset(key: string) {
  buckets.delete(key);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}, 60_000).unref();
