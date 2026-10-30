import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

export type Row = Record<string, any>;

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  const d = new DatabaseSync(config.dbFile);
  d.exec('PRAGMA journal_mode = WAL;');
  d.exec('PRAGMA foreign_keys = ON;');
  d.exec('PRAGMA busy_timeout = 5000;');
  _db = d;
  migrate(d);
  return d;
}

function migrate(d: DatabaseSync) {
  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set(
    (d.prepare('SELECT name FROM schema_migrations').all() as Row[]).map((r) => r.name as string),
  );
  const files = readdirSync(config.migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(path.join(config.migrationsDir, f), 'utf8');
    d.exec('BEGIN');
    try {
      d.exec(sql);
      d.prepare('INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)').run(f, nowIso());
      d.exec('COMMIT');
    } catch (e) {
      d.exec('ROLLBACK');
      throw e;
    }
  }
}

export const nowIso = () => new Date().toISOString();

// ───────── مساعدات الاستعلام (كل القيم عبر معاملات مرتبطة لمنع حقن SQL) ─────────
type Param = string | number | bigint | null;

export function all(sql: string, ...params: Param[]): Row[] {
  return db().prepare(sql).all(...params) as Row[];
}
export function get(sql: string, ...params: Param[]): Row | undefined {
  return db().prepare(sql).get(...params) as Row | undefined;
}
export function run(sql: string, ...params: Param[]) {
  return db().prepare(sql).run(...params);
}
export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

// ───────── الإعدادات ─────────
export function getSetting(key: string, fallback: string): string {
  const r = get('SELECT value FROM settings WHERE key = ?', key);
  return r ? String(r.value) : fallback;
}
export function setSetting(key: string, value: string) {
  run(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export function audit(userId: number | null, action: string, target: string | null, ip: string | null) {
  run('INSERT INTO audit_log(user_id, action, target, ip, created_at) VALUES (?,?,?,?,?)', userId, action, target, ip, nowIso());
}
