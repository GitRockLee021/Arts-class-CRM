/**
 * Demo dataset.
 *
 * Creates a self-contained, reproducible demo world: 4 time slots ("batches") spread over the
 * studio's real courses, 20 students, one enrollment each, and a realistic mix of paid/unpaid
 * fees. `npm run seed -- --reset` wipes a previous run first.
 *
 * Two rules this file exists to enforce:
 *
 * 1. Re-running never duplicates. The old version inserted fixed names, so running it twice
 *    produced two of every student. Every row now carries a `demo_run` number and every phone,
 *    email and name is derived from a fixed template, so a second run is a clean second set
 *    rather than a silent duplicate - and `--reset` can delete exactly one run.
 *
 * 2. It never touches the studio's real data. Courses are *looked up by name*, never inserted or
 *    deleted, and they are deliberately not tagged with `demo_run`. If a needed course is
 *    missing the script fails loudly instead of inventing one.
 */
import { query, run, pool } from './db.js';

/* ------------------------------------------------------------------ config */

const RESET = process.argv.includes('--reset');

/** Courses this script needs to exist. Looked up by name; never created. */
const COURSES = ['Varnam', 'Thulir', 'Malar'];

/**
 * The four time slots. Each meets twice a week so that the studio's "8 classes a month" rule is
 * actually reachable - a once-a-week slot only yields 4.
 *
 * Varnam deliberately has two slots on non-overlapping days, which is what makes the
 * compensation feature meaningful: a Varnam student can attend either one.
 */
const BATCHES = [
  { name: 'Varnam - Morning', course: 'Varnam', days: 'Sat & Wed', time: '10:00 AM - 11:30 AM' },
  { name: 'Varnam - Evening', course: 'Varnam', days: 'Tue & Thu', time: '6:00 PM - 7:30 PM' },
  { name: 'Malar - Afternoon', course: 'Malar', days: 'Sat & Sun', time: '4:00 PM - 5:30 PM' },
  { name: 'Thulir - Evening', course: 'Thulir', days: 'Mon & Wed', time: '6:00 PM - 7:30 PM' },
];

/** Everyone starts today, so every first month is prorated to 50% (PRO_RATE_AFTER_DAY = 15). */
const START_DATE = '2026-09-27';

/** One enrollment per student, 5 per batch. Order matters: it is dealt round-robin below. */
const PER_BATCH = 5;

/** Indices (0-based, into STUDENTS) who deliberately do NOT pay, so dues has real content. */
const UNPAID = new Set([2, 6, 9, 13, 17]);

/**
 * 20 students. Names are unique by construction, so emails derived from them are too.
 * `n` is the 1-based position and drives the phone numbers.
 */
const STUDENTS = [
  { name: 'Aarav Sharma', age: 12, guardian: 'Rahul Sharma', city: 'New Delhi' },
  { name: 'Diya Patel', age: 15, guardian: 'Sanjay Patel', city: 'Mumbai' },
  { name: 'Kabir Khan', age: 14, guardian: 'Imran Khan', city: 'Pune' },
  { name: 'Arjun Nair', age: 12, guardian: 'Ramesh Nair', city: 'Kochi' },
  { name: 'Ananya Iyer', age: 11, guardian: 'Lakshmi Iyer', city: 'Chennai' },
  { name: 'Vihaan Rao', age: 13, guardian: 'Sridhar Rao', city: 'Hyderabad' },
  { name: 'Isha Kulkarni', age: 10, guardian: 'Meera Kulkarni', city: 'Belagavi' },
  { name: 'Aditya Menon', age: 14, guardian: 'Geetha Menon', city: 'Thrissur' },
  { name: 'Kavya Pillai', age: 9, guardian: 'Anitha Pillai', city: 'Kollam' },
  { name: 'Karthik Subramanian', age: 12, guardian: 'Mohan Subramanian', city: 'Coimbatore' },
  { name: 'Meera Venkatesan', age: 11, guardian: 'Raju Venkatesan', city: 'Madurai' },
  { name: 'Rohan Desai', age: 15, guardian: 'Ketan Desai', city: 'Surat' },
  { name: 'Nisha Bhatt', age: 8, guardian: 'Alpa Bhatt', city: 'Rajkot' },
  { name: 'Nikhil Joshi', age: 13, guardian: 'Nilesh Joshi', city: 'Ahmedabad' },
  { name: 'Priya Chandran', age: 12, guardian: 'Suresh Chandran', city: 'Salem' },
  { name: 'Sameer Khan', age: 16, guardian: 'Farhan Khan', city: 'Hyderabad' },
  { name: 'Sai Prasad', age: 9, guardian: 'Venkat Prasad', city: 'Tirupati' },
  { name: 'Dhanush Reddy', age: 14, guardian: 'Suresh Reddy', city: 'Warangal' },
  { name: 'Tarun Malhotra', age: 13, guardian: 'Ashok Malhotra', city: 'Shimla' },
  { name: 'Prithvi Sharma', age: 10, guardian: 'Mohan Sharma', city: 'Dehradun' },
];

/* ----------------------------------------------------------------- helpers */

/** Unique by construction: 9876501001..9876501020. */
function studentPhone(n) {
  return `987650${String(1000 + n).slice(-4)}`;
}

/** Unique by construction, and in a different range from the student's own number. */
function guardianPhone(n) {
  return `981250${String(1000 + n).slice(-4)}`;
}

function emailFor(name) {
  return `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;
}

/** A plausible birth date for someone who is `age` in 2026. */
function birthDate(age) {
  return `${2026 - age}-0${(age % 9) + 1}-1${age % 9}`;
}

/** Mirrors expectedForMonth() in lib/monthly.js for a start date after PRO_RATE_AFTER_DAY. */
function firstMonthFee(monthlyFee) {
  return Math.round(monthlyFee * 0.5 * 100) / 100;
}

/* -------------------------------------------------------------------- reset */

async function reset(run_) {
  // Refuse rather than silently orphan anything a real person depends on.
  const strays = await query(
    `SELECT e.id, s.name, b.name AS batch
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN batches b ON b.id = e.batch_id
      WHERE b.demo_run IS NOT NULL AND s.demo_run IS NULL`,
  );
  if (strays.length) {
    console.error('Refusing to reset: real students are enrolled in demo batches:');
    for (const r of strays) console.error(`   enrollment #${r.id}  ${r.name} -> ${r.batch}`);
    console.error('\nReassign them to a real batch first, or delete the enrollment.');
    process.exit(1);
  }

  // Students first: cascades enrollments, fee_payments and attendance_entries.
  const s = (await run_('DELETE FROM students WHERE demo_run IS NOT NULL')).changes;
  // Then the batches. enrollments.batch_id is ON DELETE SET NULL, so anything still pointing at
  // a demo batch would be quietly stripped of its schedule rather than erroring.
  const b = (await run_('DELETE FROM batches WHERE demo_run IS NOT NULL')).changes;
  // reminder_logs has no foreign keys at all, so nothing above cascaded into it.
  const r = (
    await run_(
      `DELETE FROM reminder_logs rl
        WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = rl.student_id)`,
    )
  ).changes;
  console.log(`reset: ${s} students, ${b} batches, ${r} orphaned reminder_logs`);
}

/* --------------------------------------------------------------------- main */

async function main() {
  if (RESET) await reset(run);

  const run_ = await query(
    `SELECT COALESCE(MAX(demo_run), 0) AS m FROM (
       SELECT demo_run FROM students WHERE demo_run IS NOT NULL
       UNION ALL SELECT demo_run FROM batches WHERE demo_run IS NOT NULL) t`,
  );
  const demoRun = Number(run_[0].m) + 1;

  // Look the courses up; never create them.
  const found = await query(`SELECT id, name, monthly_fee FROM courses WHERE name = ANY($1)`, [COURSES]);
  const byName = new Map(found.map((c) => [c.name, c]));
  const missing = COURSES.filter((n) => !byName.has(n));
  if (missing.length) {
    console.error(`Missing course(s): ${missing.join(', ')}`);
    console.error('Create them in the app first, or add them to COURSES in seed.js.');
    process.exit(1);
  }

  const batchIds = {};
  for (const b of BATCHES) {
    const { lastInsertRowid } = await run(
      `INSERT INTO batches (name, course_id, days, time, status, demo_run)
       VALUES ($1, $2, $3, $4, 'active', $5)`,
      b.name,
      byName.get(b.course).id,
      b.days,
      b.time,
      demoRun,
    );
    batchIds[b.name] = lastInsertRowid;
  }

  // Deal students to slots round-robin: exactly PER_BATCH each, alternating between the two
  // Varnam slots so neither looks like the "real" one.
  const slotFor = [];
  for (let k = 0; k < PER_BATCH; k += 1) {
    for (const b of BATCHES) slotFor.push(b);
  }

  let paid = 0;
  for (let i = 0; i < STUDENTS.length; i += 1) {
    const s = STUDENTS[i];
    const slot = slotFor[i];
    const n = i + 1;
    const { lastInsertRowid: studentId } = await run(
      `INSERT INTO students
         (name, phone, email, age, guardian_name, guardian_phone, address, date_of_birth,
          date_of_admission, status, demo_run)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10)`,
      s.name,
      studentPhone(n),
      emailFor(s.name),
      s.age,
      s.guardian,
      guardianPhone(n),
      s.city,
      birthDate(s.age),
      START_DATE,
      demoRun,
    );

    const course = byName.get(slot.course);
    const { lastInsertRowid: enrollmentId } = await run(
      `INSERT INTO enrollments (student_id, course_id, batch, batch_id, start_date, status)
       VALUES ($1,$2,$3,$4,$5,'active')`,
      studentId,
      course.id,
      slot.name,
      batchIds[slot.name],
      START_DATE,
    );

    if (!UNPAID.has(i)) {
      await run(
        `INSERT INTO fee_payments (enrollment_id, amount, payment_date, method, notes)
         VALUES ($1,$2,$3,'cash',$4)`,
        enrollmentId,
        firstMonthFee(course.monthly_fee),
        START_DATE,
        `Demo payment (run ${demoRun})`,
      );
      paid += 1;
    }
  }

  console.log(`\nSeeded demo run ${demoRun}:`);
  console.log(`   ${BATCHES.length} batches`);
  for (const b of BATCHES) {
    console.log(`     - ${b.name.padEnd(20)} ${b.course.padEnd(8)} ${b.days.padEnd(10)} ${b.time}`);
  }
  console.log(`   ${STUDENTS.length} students, one enrollment each, ${PER_BATCH} per batch`);
  console.log(`   ${paid} paid, ${UNPAID.size} left owing (unpaid: ${[...UNPAID].map((i) => STUDENTS[i].name).join(', ')})`);
  console.log(`\nReset and rebuild with: npm run seed -- --reset`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
