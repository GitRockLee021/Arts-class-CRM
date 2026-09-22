import { Router } from 'express';
import { db, get, query, run } from '../db.js';

const router = Router();

// Weekday aliases -> JS getDay() index (0 = Sunday)
const WEEK_ALIASES = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseWeekdays(text) {
  const set = new Set();
  const tokens = String(text || '').toLowerCase().match(/[a-z]{3,}/g) || [];
  for (const t of tokens) {
    if (t in WEEK_ALIASES) set.add(WEEK_ALIASES[t]);
  }
  return set;
}

function weekdayOf(dateStr) {
  return new Date(dateStr + 'T00:00:00').getDay();
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function activeBatches() {
  return query(
    `SELECT b.id, b.name, b.days, b.time, b.course_id, c.name AS course_name,
            (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e
              WHERE e.batch_id = b.id AND e.status = 'active') AS students
     FROM batches b
     LEFT JOIN courses c ON c.id = b.course_id
     WHERE b.status = 'active'
     ORDER BY b.id DESC`,
  );
}

function recordSummary(batchId, date) {
  return get(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(ae.status = 'present'), 0) AS present,
            COALESCE(SUM(ae.status = 'absent'), 0) AS absent
     FROM attendance_logs al
     JOIN attendance_entries ae ON ae.attendance_id = al.id
     WHERE al.batch_id = ? AND al.batch_date = ?`,
    batchId,
    date,
  );
}

function withRecord(r, date) {
  const rec = recordSummary(r.id, date);
  const logged = Boolean(rec && rec.total > 0);
  return {
    ...r,
    date,
    logged,
    present: logged ? Number(rec.present) : 0,
    absent: logged ? Number(rec.absent) : 0,
    logged_total: logged ? Number(rec.total) : 0,
  };
}

function rosterForBatch(batchId) {
  const rows = query(
    `SELECT e.id AS enrollment_id, e.student_id, s.name, s.phone
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     WHERE e.batch_id = ? AND e.status = 'active'
     ORDER BY s.name`,
    batchId,
  );
  const seen = new Set();
  return rows.filter((r) => {
    if (seen.has(r.student_id)) return false;
    seen.add(r.student_id);
    return true;
  });
}

// Batches scheduled on a specific day (powers the "Today's batches" table)
router.get('/day', (req, res) => {
  const date = String(req.query.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date is required (YYYY-MM-DD).' });
  const wd = weekdayOf(date);
  const rows = activeBatches()
    .filter((b) => parseWeekdays(b.days).has(wd))
    .map((b) => withRecord(b, date));
  res.json({ date, batches: rows });
});

// Recent class-day sessions across active batches (powers Unlogged + Past lists)
router.get('/sessions', (req, res) => {
  const days = Math.min(31, Math.max(1, Number(req.query.days) || 14));
  const today = localToday();
  const from = addDays(today, -days + 1);
  const batches = activeBatches().map((b) => ({ ...b, weekdays: parseWeekdays(b.days) }));
  const sessions = [];
  for (let d = from; d <= today; ) {
    const wd = weekdayOf(d);
    for (const b of batches) {
      if (b.weekdays.has(wd)) sessions.push(withRecord(b, d));
    }
    d = addDays(d, 1);
  }
  res.json({ sessions });
});

// Roster for a batch + existing record for a date
router.get('/batch/:id', (req, res) => {
  const batch = get('SELECT b.*, c.name AS course_name FROM batches b LEFT JOIN courses c ON c.id = b.course_id WHERE b.id = ?', req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });
  const date = String(req.query.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date is required (YYYY-MM-DD).' });
  const roster = rosterForBatch(batch.id);
  const rec = recordSummary(batch.id, date);
  const absentRows = rec && rec.total > 0
    ? query(
        `SELECT student_id FROM attendance_entries ae
         JOIN attendance_logs al ON al.id = ae.attendance_id
         WHERE al.batch_id = ? AND al.batch_date = ? AND ae.status = 'absent'`,
        batch.id,
        date,
      ).map((r) => r.student_id)
    : [];
  res.json({ batch, date, roster, logged: Boolean(rec && rec.total > 0), absent: absentRows });
});

// Create / replace an attendance record for a batch-day
router.post('/', (req, res) => {
  const b = req.body || {};
  const batchId = Number(b.batch_id);
  const date = String(b.batch_date || '').slice(0, 10);
  if (!batchId) return res.status(400).json({ error: 'batch_id is required.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'batch_date is required (YYYY-MM-DD).' });
  if (date > localToday()) return res.status(400).json({ error: 'Cannot save attendance for a future date.' });

  const batch = get('SELECT id FROM batches WHERE id = ?', batchId);
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });

  const roster = rosterForBatch(batchId);
  if (roster.length === 0) return res.status(400).json({ error: 'Batch has no enrolled students.' });

  const allowed = new Set(roster.map((r) => r.student_id));
  const absent = [...new Set((Array.isArray(b.absent) ? b.absent : []).map(Number))];
  for (const sid of absent) {
    if (!allowed.has(sid)) return res.status(400).json({ error: 'absent contains a student not in this batch.' });
  }
  const present = roster.filter((r) => !absent.includes(r.student_id)).map((r) => r.student_id);

  db.exec('BEGIN');
  try {
    run('DELETE FROM attendance_logs WHERE batch_id = ? AND batch_date = ?', batchId, date);
    const { lastInsertRowid } = run(
      'INSERT INTO attendance_logs (batch_id, batch_date, created_by) VALUES (?, ?, ?)',
      batchId,
      date,
      req.user?.id || null,
    );
    for (const sid of present) {
      run('INSERT INTO attendance_entries (attendance_id, student_id, status) VALUES (?, ?, ?)', lastInsertRowid, sid, 'present');
    }
    for (const sid of absent) {
      run('INSERT INTO attendance_entries (attendance_id, student_id, status) VALUES (?, ?, ?)', lastInsertRowid, sid, 'absent');
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.status(201).json({ ok: true, batch_id: batchId, batch_date: date, present, absent });
});

export default router;