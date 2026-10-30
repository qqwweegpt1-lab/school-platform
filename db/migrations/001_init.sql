-- مخطط قاعدة البيانات الأولي (SQLite). يُطبَّق تلقائيًا عند تشغيل الخادم.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,                       -- scrypt: salt$hash
  role          TEXT NOT NULL CHECK (role IN ('admin','staff')),
  active        INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                       -- SHA-256 للرمز (لا يُخزَّن الرمز نفسه)
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- جميع الطلبات والمدخلات الواردة من الواجهة العامة في جدول واحد مع حقل النوع
CREATE TABLE requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no      TEXT NOT NULL UNIQUE,               -- رقم مرجعي فريد
  secret_hash    TEXT NOT NULL,                      -- تجزئة رمز المتابعة (يُعرض لمقدّم الطلب مرة واحدة فقط)
  kind           TEXT NOT NULL CHECK (kind IN
                  ('absence','late','permission','suggestion','complaint','student_voice','parent_opinion')),
  status         TEXT NOT NULL,
  student_name   TEXT,
  grade          TEXT,
  class_name     TEXT,
  submitter_type TEXT,                               -- طالبة / ولي أمر ...
  submitter_name TEXT,
  contact        TEXT,
  subject        TEXT,
  category       TEXT,
  event_date     TEXT,                              -- تاريخ الغياب/التأخر/الاستئذان/الواقعة
  event_time     TEXT,
  body           TEXT,                              -- السبب أو نص المشاركة أو وصف الشكوى
  notes          TEXT,
  rating         INTEGER,
  is_private     INTEGER NOT NULL DEFAULT 0,        -- مشاركة طالبة محفوظة كرسالة خاصة
  public_note    TEXT,                              -- ملاحظة تظهر لمقدّم الطلب عند المتابعة
  is_demo        INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_requests_kind_status ON requests(kind, status);
CREATE INDEX idx_requests_created ON requests(created_at);

CREATE TABLE request_notes (                          -- ملاحظات إدارية داخلية (لا تظهر لمقدّم الطلب)
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE status_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  orig_name   TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,                  -- اسم عشوائي داخل مجلد غير عام
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  sha256      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- يمنع تكرار الإرسال عند الضغط المتكرر أو إعادة إرسال النموذج
CREATE TABLE form_nonces (
  nonce      TEXT PRIMARY KEY,
  request_id INTEGER REFERENCES requests(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE announcements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  category     TEXT NOT NULL,
  event_date   TEXT,
  image_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','hidden')),
  pinned       INTEGER NOT NULL DEFAULT 0,
  is_demo      INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE initiatives (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'star',
  audience    TEXT NOT NULL,
  start_date  TEXT,
  end_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','ended')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_demo     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE surveys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  description  TEXT,
  participants INTEGER,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- نتائج مجمّعة فقط (لا إجابات فردية ولا بيانات شخصية)
CREATE TABLE survey_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id    INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  option_label TEXT NOT NULL,
  votes        INTEGER NOT NULL CHECK (votes >= 0),
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE media (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('image','video')),
  category          TEXT NOT NULL,
  event_date        TEXT,
  stored_name       TEXT NOT NULL UNIQUE,
  mime              TEXT NOT NULL,
  size              INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  consent_confirmed INTEGER NOT NULL DEFAULT 0,       -- لا يُنشر دون تأكيد الموافقة
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);
