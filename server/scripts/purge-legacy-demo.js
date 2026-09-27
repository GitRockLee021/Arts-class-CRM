/**
 * One-time purge of the legacy demo dataset.
 *
 * The original seed.js was run twice, so it produced two copies of every row:
 *   students   #4-6 duplicate #1-3 (same people)
 *   courses    #10-12 duplicate #1-3 (Sketching Basics / Watercolor / Perspective)
 *   enrollments #4-6 duplicate #1-3
 * and the three real students are enrolled in exactly the courses being removed, so their
 * enrollments have to go too (enrollments.course_id has no ON DELETE, so it would block the
 * course delete).
 *
 * The replacement seed.js owns the whole demo world, so this deletes all of it and lets the
 * next `npm run seed` rebuild it cleanly. Nothing here touches the studio's real courses,
 * users or sessions.
 *
 * Dry run by default. Pass --yes to actually delete.
 */
import { query, run, pool } from '../src/db.js';

const YES = process.argv.includes('--yes');

async function main() {
  console.log(YES ? '=== PURGE (live) ===' : '=== PURGE (dry run - pass --yes to apply) ===\n');

  const before = {};
  for (const t of ['students', 'courses', 'batches', 'enrollments', 'fee_payments', 'reminder_logs', 'attendance_logs']) {
    const r = await query(`SELECT count(*)::int AS n FROM ${t}`);
    before[t] = r[0].n;
  }
  console.log('before:', JSON.stringify(before), '\n');

  const students = await query(`SELECT id, name FROM students ORDER BY id`);
  const doomedCourses = await query(
    `SELECT id, name FROM courses
      WHERE name IN ('Sketching Basics', 'Watercolor Painting', 'Perspective Drawing')
      ORDER BY id`,
  );
  const keepCourses = await query(
    `SELECT id, name FROM courses
      WHERE name NOT IN ('Sketching Basics', 'Watercolor Painting', 'Perspective Drawing')
      ORDER BY id`,
  );

  console.log(`will DELETE ${students.length} students:`);
  for (const s of students) console.log(`   #${s.id}  ${s.name}`);
  console.log(`\nwill DELETE ${doomedCourses.length} courses (both copies of the 3 demo courses):`);
  for (const c of doomedCourses) console.log(`   #${c.id}  ${c.name}`);
  console.log(`\nwill KEEP ${keepCourses.length} courses:`);
  for (const c of keepCourses) console.log(`   #${c.id}  ${c.name}`);

  // Enrollments/payments/attendance disappear via ON DELETE CASCADE, but reminder_logs has no
  // foreign keys at all, so it has to be swept by hand - and only *after* the students are gone,
  // since a row is only orphaned once its student no longer exists.
  console.log(
    `\nwill also delete every reminder_logs row (${before.reminder_logs} today) - ` +
      'they have no FK, so nothing cascades',
  );

  if (!YES) {
    console.log('\nNothing changed. Re-run with --yes to apply.');
    return;
  }

  console.log('\n--- applying ---');
  // Students first: cascades enrollments -> fee_payments, and attendance_entries.
  await run('DELETE FROM students');
  // Only now are the courses free; enrollments.course_id is a NO ACTION foreign key.
  await run(
    `DELETE FROM courses
      WHERE name IN ('Sketching Basics', 'Watercolor Painting', 'Perspective Drawing')`,
  );
  // Runs after the student delete, so this is what actually catches the un-cascaded rows.
  const swept = await run(
    `DELETE FROM reminder_logs rl
      WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = rl.student_id)`,
  );
  console.log(`swept ${swept} orphaned reminder_logs rows`);
  // Tidy the identity sequences so the rebuilt demo data starts at 1 again.
  for (const t of ['students', 'batches', 'enrollments', 'fee_payments']) {
    await run(`ALTER TABLE ${t} ALTER COLUMN id RESTART WITH 1`);
  }

  const after = {};
  for (const t of ['students', 'courses', 'batches', 'enrollments', 'fee_payments', 'reminder_logs']) {
    const r = await query(`SELECT count(*)::int AS n FROM ${t}`);
    after[t] = r[0].n;
  }
  console.log('after: ', JSON.stringify(after), '\n');
  console.log('Done. Run "npm run seed" to rebuild the demo dataset.');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
