import { Router } from 'express';
import { get, query, run, begin, commit, rollback } from '../db.js';
import { ah } from '../lib/asyncHandler.js';
import { requireIntId, toInt } from '../lib/validate.js';

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

async function activeBatches() {
  return query(
    `SELECT b.id, b.name, b.days, b.time, b.course_id, c.name AS course_name,
            (SELECT COUNT(DISTINCT e.student_id)::int FROM enrollments e
              WHERE e.batch_id = b.id AND e.status = 'active') AS students
     FROM batches b
     LEFT JOIN courses c ON c.id = b.course_id
     WHERE b.status = 'active'
     ORDER BY b.id DESC`,
  );
}

async function recordSummary(batchId, date) {
  return get(
    `SELECT COUNT(*)::int AS total,
            COALESCE(SUM((ae.status = 'present')::int), 0)::int AS present,
            COALESCE(SUM((ae.status = 'absent')::int), 0)::int AS absent
     FROM attendance_logs al
     JOIN attendance_entries ae ON ae.attendance_id = al.id
     WHERE al.batch_id = $1 AND al.batch_date = $2`,
    batchId,
    date,
  );
}

async function withRecord(r, date) {
  const rec = await recordSummary(r.id, date);
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

async function rosterForBatch(batchId) {
  const rows = await query(
    `SELECT e.id AS enrollment_id, e.student_id, s.name, s.phone
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     WHERE e.batch_id = $1 AND e.status = 'active'
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
router.get(
  '/day',
  ah(async (req, res) => {
    const date = String(req.query.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date is required (YYYY-MM-DD).' });
    const wd = weekdayOf(date);
    const batches = await activeBatches();
    const rows = await Promise.all(
      batches
        .filter((b) => parseWeekdays(b.days).has(wd))
        .map((b) => withRecord(b, date)),
    );
    res.json({ date, batches: rows });
  }),
);

// Recent class-day sessions across active batches (powers Unlogged + Past lists)
router.get(
  '/sessions',
  ah(async (req, res) => {
    const days = Math.min(31, Math.max(1, Number(req.query.days) || 14));
    const today = localToday();
    const from = addDays(today, -days + 1);
    const batches = (await activeBatches()).map((b) => ({ ...b, weekdays: parseWeekdays(b.days) }));
    const sessions = [];
    for (let d = from; d <= today; ) {
      const wd = weekdayOf(d);
      for (const b of batches) {
        if (b.weekdays.has(wd)) sessions.push(withRecord(b, d));
      }
      d = addDays(d, 1);
    }
    const resolved = await Promise.all(sessions);
    res.json({ sessions: resolved });
  }),
);

// Roster for a batch + existing record for a date
router.get(
  '/batch/:id',
  requireIntId,
  ah(async (req, res) => {
    const batch = await get('SELECT b.*, c.name AS course_name FROM batches b LEFT JOIN courses c ON c.id = b.course_id WHERE b.id = $1', req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch not found.' });
    const date = String(req.query.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date is required (YYYY-MM-DD).' });
    const roster = await rosterForBatch(batch.id);
    const rec = await recordSummary(batch.id, date);
    const absentRows =
      rec && rec.total > 0
        ? (
            await query(
              `SELECT student_id FROM attendance_entries ae
               JOIN attendance_logs al ON al.id = ae.attendance_id
               WHERE al.batch_id = $1 AND al.batch_date = $2 AND ae.status = 'absent'`,
              batch.id,
              date,
            )
          ).map((r) => r.student_id)
        : [];
    res.json({ batch, date, roster, logged: Boolean(rec && rec.total > 0), absent: absentRows });
  }),
);

// Create / replace an attendance record for a batch-day
router.post(
  '/',
  ah(async (req, res) => {
    const b = req.body || {};
    const batchId = toInt(b.batch_id);
    const date = String(b.batch_date || '').slice(0, 10);
    if (batchId === null) return res.status(400).json({ error: 'batch_id is required.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'batch_date is required (YYYY-MM-DD).' });
    if (date > localToday()) return res.status(400).json({ error: 'Cannot save attendance for a future date.' });

    const batch = await get('SELECT id FROM batches WHERE id = $1', batchId);
    if (!batch) return res.status(404).json({ error: 'Batch not found.' });

    const roster = await rosterForBatch(batchId);
    if (roster.length === 0) return res.status(400).json({ error: 'Batch has no enrolled students.' });

    const allowed = new Set(roster.map((r) => r.student_id));
    const absent = [...new Set((Array.isArray(b.absent) ? b.absent : []).map(Number))];
    for (const sid of absent) {
      if (!allowed.has(sid)) return res.status(400).json({ error: 'absent contains a student not in this batch.' });
    }
    const present = roster.filter((r) => !absent.includes(r.student_id)).map((r) => r.student_id);

    await begin();
    try {
      await run('DELETE FROM attendance_logs WHERE batch_id = $1 AND batch_date = $2', batchId, date);
      const { lastInsertRowid } = await run(
        'INSERT INTO attendance_logs (batch_id, batch_date, created_by) VALUES ($1, $2, $3)',
        batchId,
        date,
        req.user?.id || null,
      );
      for (const sid of present) {
        await run('INSERT INTO attendance_entries (attendance_id, student_id, status) VALUES ($1, $2, $3)', lastInsertRowid, sid, 'present');
      }
      for (const sid of absent) {
        await run('INSERT INTO attendance_entries (attendance_id, student_id, status) VALUES ($1, $2, $3)', lastInsertRowid, sid, 'absent');
      }
      await commit();
    } catch (err) {
      await rollback();
      throw err;
    }

    res.status(201).json({ ok: true, batch_id: batchId, batch_date: date, present, absent });
  }),
);

export default router;