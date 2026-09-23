import { query, run } from '../src/db.js';

const LADDER = [
  { name: 'Varnam',  monthly_fee: 950,  admission_fee: 300, kit_fee: 500, sort_order: 1 },
  { name: 'Vidhai',  monthly_fee: 1200, admission_fee: 300, kit_fee: 600, sort_order: 2 },
  { name: 'Thulir',  monthly_fee: 1400, admission_fee: 300, kit_fee: 600, sort_order: 3 },
  { name: 'Arumbu',  monthly_fee: 1600, admission_fee: 300, kit_fee: 600, sort_order: 4 },
  { name: 'Malar',   monthly_fee: 1800, admission_fee: 300, kit_fee: null, sort_order: 5 },
  { name: 'Kani',    monthly_fee: 2500, admission_fee: 500, kit_fee: null, sort_order: 6 },
];

async function main() {
  for (const c of LADDER) {
    const existing = (await query('SELECT id FROM courses WHERE name = $1', c.name))[0];
    if (existing) {
      await run(
        `UPDATE courses
         SET monthly_fee = $1, admission_fee = $2, kit_fee = $3, sort_order = $4
         WHERE id = $5`,
        c.monthly_fee,
        c.admission_fee,
        c.kit_fee,
        c.sort_order,
        existing.id,
      );
      console.log('updated', c.name, '->', c.monthly_fee);
    } else {
      await run(
        `INSERT INTO courses (name, fee_mode, monthly_fee, admission_fee, kit_fee, sort_order)
         VALUES ($1, 'monthly', $2, $3, $4, $5)`,
        c.name,
        c.monthly_fee,
        c.admission_fee,
        c.kit_fee,
        c.sort_order,
      );
      console.log('created', c.name, '->', c.monthly_fee);
    }
  }

  console.log(
    'courses:',
    JSON.stringify(
      await query('SELECT id, name, monthly_fee, admission_fee, kit_fee, sort_order FROM courses ORDER BY sort_order'),
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });