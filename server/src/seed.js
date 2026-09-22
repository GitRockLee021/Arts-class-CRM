import { run } from './db.js';

const SAMPLE = [
  {
    student: {
      name: 'Aarav Sharma',
      phone: '9876543210',
      email: 'aarav@example.com',
      age: 12,
      guardian_name: 'Rahul Sharma',
      guardian_phone: '9811111111',
      address: 'New Delhi',
      status: 'active',
    },
    course: { name: 'Sketching Basics', monthly_fee: 1500, duration_months: 3 },
    enrollment: { batch: 'Weekday Morning', start_date: '2026-07-05', status: 'active' },
    payments: [
      { amount: 1500, payment_date: '2026-07-05' },
      { amount: 1500, payment_date: '2026-08-05' },
    ],
  },
  {
    student: {
      name: 'Diya Patel',
      phone: '9876501234',
      email: 'diya@example.com',
      age: 15,
      guardian_name: 'Sanjay Patel',
      address: 'Mumbai',
      status: 'active',
    },
    course: { name: 'Watercolor Painting', monthly_fee: 2000, duration_months: 6 },
    enrollment: { batch: 'Weekend Evening', start_date: '2026-06-01', status: 'active' },
    payments: [{ amount: 2000, payment_date: '2026-06-01' }],
  },
  {
    student: {
      name: 'Kabir Khan',
      phone: '9822334455',
      guardian_name: 'Imran Khan',
      age: 17,
      address: 'Pune',
      status: 'active',
    },
    course: { name: 'Perspective Drawing', monthly_fee: 1800, duration_months: 2 },
    enrollment: { batch: 'Weekday Evening', start_date: '2026-08-10', status: 'active' },
    payments: [],
  },
];

export function seed() {
  for (const item of SAMPLE) {
    const { lastInsertRowid: studentId } = run(
      `INSERT INTO students (name, phone, email, age, guardian_name, guardian_phone, address, date_of_birth, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.student.name,
      item.student.phone,
      item.student.email || null,
      item.student.age || null,
      item.student.guardian_name || null,
      item.student.guardian_phone || null,
      item.student.address || null,
      item.student.date_of_birth || null,
      item.student.notes || null,
      item.student.status || 'active',
    );

    const { lastInsertRowid: courseId } = run(
      `INSERT INTO courses (name, fee_mode, monthly_fee, duration_months, description)
       VALUES (?, 'monthly', ?, ?, NULL)`,
      item.course.name,
      item.course.monthly_fee,
      item.course.duration_months,
    );

    const { lastInsertRowid: enrollmentId } = run(
      `INSERT INTO enrollments (student_id, course_id, batch, start_date, status, notes)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      studentId,
      courseId,
      item.enrollment.batch || null,
      item.enrollment.start_date,
      item.enrollment.status || 'active',
    );

    for (const p of item.payments) {
      run(
        `INSERT INTO fee_payments (enrollment_id, amount, payment_date, method, notes)
         VALUES (?, ?, ?, 'cash', NULL)`,
        enrollmentId,
        p.amount,
        p.payment_date,
      );
    }
  }
  console.log('Seed data added.');
}

seed();