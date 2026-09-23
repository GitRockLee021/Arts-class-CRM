import { Router } from 'express';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { query, get, run } from '../db.js';
import { ah } from '../lib/asyncHandler.js';

const router = Router();

const COLUMNS = [
  { header: 'Full name', key: 'name', width: 24 },
  { header: 'Age', key: 'age', width: 10 },
  { header: 'Phone (WhatsApp)', key: 'phone', width: 18 },
  { header: 'Parent name', key: 'parent', width: 24 },
  { header: 'Course', key: 'course', width: 24 },
];

router.get(
  '/template.xlsx',
  ah(async (req, res) => {
    const courses = await query('SELECT id, name FROM courses ORDER BY name');
    const workbook = new ExcelJS.Workbook();

    const ws = workbook.addWorksheet('Import');
    ws.columns = COLUMNS;

    const header = ws.getRow(1);
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7A5BA8' } };
      cell.alignment = { vertical: 'middle' };
    });
    header.height = 20;

    ws.getCell('A2').value = 'Aarav Sharma';
    ws.getCell('B2').value = 12;
    ws.getCell('C2').value = '9876543210';
    ws.getCell('D2').value = 'Rahul Sharma';
    if (courses.length) ws.getCell('E2').value = courses[0].name;
    ws.getCell('A2').note = 'Example row — replace or delete it before filling in your data.';

    const courseSheet = workbook.addWorksheet('Courses');
    courseSheet.getCell('A1').value = 'Course name';
    courses.forEach((c, i) => (courseSheet.getCell(`A${i + 2}`).value = c.name));
    courseSheet.state = 'hidden';

    const validation = {
      type: 'list',
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Invalid course',
      error: 'Pick a course from the dropdown list.',
      formulae: [`'Courses'!$A$2:$A$${courses.length + 1}`],
    };
    for (let r = 2; r <= 1000; r++) ws.getCell(`E${r}`).dataValidation = validation;

    const info = workbook.addWorksheet('Instructions');
    info.getCell('A1').value = 'How to import students';
    info.getCell('A1').font = { bold: true, size: 12 };
    info.getCell('A2').value = '1. Fill one student per row. Full name and Phone (WhatsApp) are required, everything else is optional.';
    info.getCell('A3').value = '2. Pick the Course from its dropdown. Leave it blank to save the student as a draft.';
    info.getCell('A4').value = '3. Save this file (Excel or CSV) and upload it via the Import button on the Students page.';
    info.getCell('A5').value = 'The course dropdown always reflects your current Courses list — download a fresh copy if you added courses.';

    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="students-template.xlsx"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(buf));
  }),
);

function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

async function readWorksheet(buffer, filename) {
  const workbook = new ExcelJS.Workbook();
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.csv')) {
    await workbook.csv.read(Readable.from([buffer.toString('utf8')]));
  } else {
    await workbook.xlsx.load(buffer);
  }
  return workbook.worksheets.find((s) => s.name === 'Import') || workbook.worksheets[0];
}

router.post('/students', async (req, res, next) => {
  try {
    const { fileBase64, filename } = req.body || {};
    if (!fileBase64) return res.status(400).json({ error: 'No file uploaded.' });
    const buffer = Buffer.from(fileBase64, 'base64');
    const ws = await readWorksheet(buffer, filename);

    const courseRows = await query('SELECT id, name FROM courses');
    const courseByName = new Map(courseRows.map((c) => [String(c.name).trim().toLowerCase(), c.id]));

    const rows = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const vals = row.values.slice(1).map((v) => (v == null ? '' : String(v).trim()));
      if (!vals.join('')) return;
      rows.push({
        n,
        name: vals[0] || '',
        age: vals[1],
        phone: normalizePhone(vals[2]),
        parent: vals[3] || '',
        course: vals[4] || '',
      });
    });

    const errors = [];
    let added = 0;
    let drafts = 0;

    for (const r of rows) {
      const problems = [];
      if (!r.name) problems.push('Full name missing');
      if (r.phone.length < 10) problems.push('Phone must be a valid 10+ digit number');

      let age = null;
      if (r.age) {
        const n = Number(r.age.replace(/[^0-9]/g, ''));
        if (Number.isInteger(n) && n >= 3 && n <= 120) age = n;
        else problems.push('Age must be a whole number between 3 and 120');
      }

      let courseId = null;
      if (r.course) {
        courseId = courseByName.get(r.course.toLowerCase()) ?? null;
        if (!courseId) problems.push(`Course "${r.course}" not found`);
      }

      if (problems.length) {
        errors.push({ row: r.n, name: r.name || '(no name)', message: problems.join('; ') });
        continue;
      }

      const { lastInsertRowid: studentId } = await run(
        `INSERT INTO students (name, phone, age, guardian_name, status)
         VALUES ($1, $2, $3, $4, $5)`,
        r.name,
        r.phone,
        age,
        r.parent || null,
        courseId ? 'active' : 'draft',
      );

      if (courseId) {
        await run(
          `INSERT INTO enrollments (student_id, course_id, start_date, status)
           VALUES ($1, $2, CURRENT_DATE, 'active')`,
          studentId,
          courseId,
        );
        added += 1;
      } else {
        drafts += 1;
      }
    }

    res.json({ added, drafts, errors });
  } catch (err) {
    next(err);
  }
});

export default router;