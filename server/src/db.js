import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'crm.db');

export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  age INTEGER,
  guardian_name TEXT,
  guardian_phone TEXT,
  address TEXT,
  date_of_birth TEXT,
  date_of_admission TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  fee_mode TEXT DEFAULT 'monthly',
  monthly_fee REAL NOT NULL DEFAULT 0,
  duration_months INTEGER,
  description TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  days TEXT,
  time TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id),
  batch TEXT,
  start_date TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  payment_date TEXT NOT NULL DEFAULT (date('now')),
  method TEXT DEFAULT 'cash',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminder_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  amount_due REAL,
  channel TEXT DEFAULT 'whatsapp',
  status TEXT,
  message TEXT,
  error TEXT,
  sent_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  batch_date TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(batch_id, batch_date)
);

CREATE TABLE IF NOT EXISTS attendance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attendance_id INTEGER NOT NULL REFERENCES attendance_logs(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  UNIQUE(attendance_id, student_id)
);

CREATE TABLE IF NOT EXISTS student_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrollment_id INTEGER REFERENCES enrollments(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  from_course TEXT,
  to_course TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  recovery_key_hash TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_seen_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_student_events_student_id ON student_events(student_id);
CREATE INDEX IF NOT EXISTS idx_student_events_enrollment_id ON student_events(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_enrollment_id ON fee_payments(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_student_id ON reminder_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_enrollment_id ON reminder_logs(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_date ON attendance_logs(batch_date);
CREATE INDEX IF NOT EXISTS idx_attendance_entries_attendance_id ON attendance_entries(attendance_id);
`);

const studentCols = db.prepare('PRAGMA table_info(students)').all().map((c) => c.name);
if (!studentCols.includes('age')) {
  db.exec('ALTER TABLE students ADD COLUMN age INTEGER');
}
if (!studentCols.includes('date_of_admission')) {
  db.exec('ALTER TABLE students ADD COLUMN date_of_admission TEXT');
}

const enrollmentCols = db.prepare('PRAGMA table_info(enrollments)').all().map((c) => c.name);
if (!enrollmentCols.includes('batch_id')) {
  db.exec('ALTER TABLE enrollments ADD COLUMN batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL');
}

const courseCols = db.prepare('PRAGMA table_info(courses)').all().map((c) => c.name);
if (!courseCols.includes('status')) {
  db.exec("ALTER TABLE courses ADD COLUMN status TEXT DEFAULT 'active'");
}
if (!courseCols.includes('admission_fee')) {
  db.exec('ALTER TABLE courses ADD COLUMN admission_fee REAL NOT NULL DEFAULT 0');
}
if (!courseCols.includes('kit_fee')) {
  db.exec('ALTER TABLE courses ADD COLUMN kit_fee REAL');
}
if (!courseCols.includes('sort_order')) {
  db.exec('ALTER TABLE courses ADD COLUMN sort_order INTEGER');
}

const paymentCols = db.prepare('PRAGMA table_info(fee_payments)').all().map((c) => c.name);
if (!paymentCols.includes('gateway_ref')) {
  db.exec('ALTER TABLE fee_payments ADD COLUMN gateway_ref TEXT');
}
if (!paymentCols.includes('fee_type')) {
  db.exec("ALTER TABLE fee_payments ADD COLUMN fee_type TEXT NOT NULL DEFAULT 'tuition'");
}
if (!paymentCols.includes('admission_group')) {
  db.exec('ALTER TABLE fee_payments ADD COLUMN admission_group TEXT');
}
db.exec(
  'CREATE INDEX IF NOT EXISTS idx_fee_payments_admission_group ON fee_payments(admission_group) WHERE admission_group IS NOT NULL;',
);
if (!paymentCols.includes('share_token')) {
  db.exec('ALTER TABLE fee_payments ADD COLUMN share_token TEXT');
}
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_payments_gateway_ref ON fee_payments(gateway_ref) WHERE gateway_ref IS NOT NULL;',
);
db.exec(
  `CREATE TRIGGER IF NOT EXISTS trg_fee_payments_share_token
   AFTER INSERT ON fee_payments
   WHEN NEW.share_token IS NULL
   BEGIN UPDATE fee_payments SET share_token = lower(hex(randomblob(12))) WHERE id = NEW.id; END;`,
);

export function query(sql, ...params) {
  return db.prepare(sql).all(...params);
}

export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function run(sql, ...params) {
  const result = db.prepare(sql).run(...params);
  return { lastInsertRowid: Number(result.lastInsertRowid), changes: result.changes };
}

export function closeDb() {
  db.close();
}