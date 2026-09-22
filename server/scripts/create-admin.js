import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { get, run } from '../src/db.js';
import { hashPassword, hashToken, generateRecoveryKey } from '../src/services/auth.js';

function ask(rl, prompt) {
  return rl.question(prompt);
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  let email = process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;
  let name = process.env.ADMIN_NAME;

  if (!email) email = (await ask(rl, 'Admin email: ')).trim();
  if (!name) name = (await ask(rl, 'Admin name (e.g. Owner): ')).trim() || 'Admin';
  if (!password) password = await ask(rl, 'Admin password (min 8 chars): ');

  if (!email || !password) {
    console.error('Email and password are required.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const existing = get('SELECT id FROM users WHERE email = ? COLLATE NOCASE', email);
  const recoveryKey = generateRecoveryKey();

  if (existing) {
    run(
      'UPDATE users SET name = ?, password_hash = ?, recovery_key_hash = ?, role = ?, active = 1 WHERE id = ?',
      name,
      hashPassword(password),
      hashToken(recoveryKey),
      'admin',
      existing.id,
    );
    console.log('Admin updated:', email);
  } else {
    run(
      'INSERT INTO users (email, name, password_hash, recovery_key_hash, role, active) VALUES (?, ?, ?, ?, ?, 1)',
      email,
      name,
      hashPassword(password),
      hashToken(recoveryKey),
      'admin',
    );
    console.log('Admin created:', email);
  }

  console.log('');
  console.log('Recovery key (save it now, shown only this once):');
  console.log('  ' + recoveryKey);
  console.log('');
  console.log('Use it on the login screen under "Forgot password?" if you ever lose your password.');

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});