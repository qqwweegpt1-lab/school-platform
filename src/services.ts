import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { config, KINDS, type Kind } from './config.ts';
import { all, get, nowIso, run, tx, type Row } from './db.ts';
import type { FormDef } from './forms.ts';
import { hashSecretCode, newSecretCode, newTicketNo, safeEqualHex } from './security.ts';
import { storeFile, type CheckedFile } from './uploads.ts';

const COLUMNS = [
  'student_name',
  'grade',
  'class_name',
  'submitter_type',
  'submitter_name',
  'contact',
  'subject',
  'category',
  'event_date',
  'event_time',
  'body',
  'notes',
] as const;

export interface Submitted {
  ticket: string;
  code: string | null; // null عند إعادة الإرسال المكرّر (لا يُعاد عرض الرمز)
  duplicate: boolean;
}

export function submitRequest(
  def: FormDef,
  values: Record<string, string>,
  files: CheckedFile[],
  nonce: string,
): Submitted {
  // نمنع التكرار: إن كان نفس النموذج قد حُفظ سابقًا نعيد رقمه فقط
  const prior = get(
    'SELECT r.ticket_no FROM form_nonces n JOIN requests r ON r.id = n.request_id WHERE n.nonce = ?',
    nonce,
  );
  if (prior) return { ticket: prior.ticket_no as string, code: null, duplicate: true };

  const stored: { stored: string; sha256: string; f: CheckedFile }[] = [];
  try {
    for (const f of files) stored.push({ ...storeFile(config.attachmentsDir, f), f });

    return tx(() => {
      const kind: Kind = def.kind;
      const code = newSecretCode();
      const cols: string[] = [];
      const vals: (string | number | null)[] = [];
      for (const c of COLUMNS) {
        if (values[c] !== undefined && values[c] !== '') {
          cols.push(c);
          vals.push(values[c]);
        }
      }
      if (values.rating) {
        cols.push('rating');
        vals.push(parseInt(values.rating.charAt(0), 10));
      }
      if (values.is_private) {
        cols.push('is_private');
        vals.push(1);
      }
      const now = nowIso();
      const initial = KINDS[kind].initial;

      let ticket = '';
      let id = 0;
      for (let attempt = 0; attempt < 6; attempt++) {
        ticket = newTicketNo(KINDS[kind].prefix);
        try {
          const r = run(
            `INSERT INTO requests (ticket_no, secret_hash, kind, status, ${cols.join(', ')}, created_at, updated_at)
             VALUES (?, ?, ?, ?, ${cols.map(() => '?').join(', ')}, ?, ?)`,
            ticket,
            hashSecretCode(code),
            kind,
            initial,
            ...vals,
            now,
            now,
          );
          id = Number(r.lastInsertRowid);
          break;
        } catch (e) {
          if (!String((e as Error).message).includes('UNIQUE') || attempt === 5) throw e;
        }
      }
      run('INSERT INTO status_history(request_id, from_status, to_status, user_id, note, created_at) VALUES (?,?,?,?,?,?)', id, null, initial, null, null, now);
      run('INSERT INTO form_nonces(nonce, request_id, created_at) VALUES (?,?,?)', nonce, id, now);
      for (const s of stored) {
        run(
          'INSERT INTO attachments(request_id, orig_name, stored_name, mime, size, sha256, created_at) VALUES (?,?,?,?,?,?,?)',
          id,
          s.f.orig,
          s.stored,
          s.f.det.mime,
          s.f.data.length,
          s.sha256,
          now,
        );
      }
      return { ticket, code, duplicate: false };
    });
  } catch (e) {
    for (const s of stored) {
      try {
        unlinkSync(path.join(config.attachmentsDir, s.stored));
      } catch {
        /* ignore */
      }
    }
    throw e;
  }
}

// ───────── متابعة الطلب (رقم + رمز سري) ─────────
export function findForTracking(ticket: string, code: string): Row | null {
  const t = ticket.trim().toUpperCase();
  if (!/^[A-Z]{3}-\d{4}-[A-Z0-9]{6}$/.test(t)) return null;
  const r = get('SELECT * FROM requests WHERE ticket_no = ?', t);
  if (!r) {
    // تنفيذ مقارنة وهمية لتقليل الفرق الزمني
    safeEqualHex(hashSecretCode(code), hashSecretCode('XXXX-XXXX'));
    return null;
  }
  return safeEqualHex(hashSecretCode(code), r.secret_hash as string) ? r : null;
}

export function publicHistory(requestId: number): Row[] {
  return all('SELECT to_status, note, created_at FROM status_history WHERE request_id = ? ORDER BY id ASC', requestId);
}

// ───────── المحتوى العام ─────────
export const publishedAnnouncements = (cat?: string) =>
  cat
    ? all(
        "SELECT * FROM announcements WHERE status = 'published' AND category = ? ORDER BY pinned DESC, published_at DESC, id DESC",
        cat,
      )
    : all("SELECT * FROM announcements WHERE status = 'published' ORDER BY pinned DESC, published_at DESC, id DESC");

export const publishedVoices = () =>
  all(
    "SELECT id, ticket_no, category, subject, body, grade, created_at FROM requests WHERE kind = 'student_voice' AND status = 'published' AND is_private = 0 ORDER BY updated_at DESC LIMIT 50",
  );

export function surveysWithItems(): { survey: Row; items: Row[] }[] {
  return all("SELECT * FROM surveys WHERE status = 'published' ORDER BY published_at DESC, id DESC").map((s) => ({
    survey: s,
    items: all('SELECT * FROM survey_items WHERE survey_id = ? ORDER BY sort_order, id', s.id as number),
  }));
}

export const publishedMedia = (cat?: string) =>
  cat
    ? all("SELECT * FROM media WHERE status = 'published' AND consent_confirmed = 1 AND category = ? ORDER BY COALESCE(event_date, created_at) DESC, id DESC", cat)
    : all("SELECT * FROM media WHERE status = 'published' AND consent_confirmed = 1 ORDER BY COALESCE(event_date, created_at) DESC, id DESC");
