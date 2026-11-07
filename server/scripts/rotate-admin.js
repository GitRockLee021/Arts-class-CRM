#!/usr/bin/env node
/**
 * Rotate an admin password + recovery key against the configured database, and invalidate every
 * session for that account. The new credentials are written once to a file outside the repo.
 *
 * Usage:
 *   npm run rotate:admin -- --dry-run
 *   npm run rotate:admin -- --login Radhakannan
 *   npm run rotate:admin -- --login Radhakannan --out D:\secure\admin.txt
 *
 * Why this is not a cron job: the new password has to reach a human. Schedule the *reminder*
 * (see SECRET_ROTATION.md), then run this with a person present.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(SERVER_DIR, '..');

// Load the server env explicitly so the script works from any working directory.
dotenv.config({ path: path.join(SERVER_DIR, '.env') });

const { get, run } = await import('../src/db.js');
const { hashPassword, hashToken, generateRecoveryKey, verifyPassword } = await import('../src/services/auth.js');

const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};

if (has('--help') || has('-h')) {
  console.log(`Rotate an admin password + recovery key and revoke its sessions.

Options:
  --login <id>   User ID (login) to rotate. Default: $ADMIN_EMAIL or "Radhakannan".
  --out <path>   Where to write the one-time credential file. Must be outside the repo.
  --dry-run      Generate and validate, but do not touch the database.
  --quiet        Only print the output file path.
  -h, --help     Show this help.

The output file is created with user-only permissions where the OS supports it.`);
  process.exit(0);
}

const login = arg('--login') || process.env.ADMIN_EMAIL || 'Radhakannan';
const dryRun = has('--dry-run');
const quiet = has('--quiet');

function die(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function generatePassword() {
  // 24 chars, unambiguous alphabet (no 0/O/1/I/l) -> ~140 bits of entropy.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 24; i += 1) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

function defaultOutPath() {
  const base = process.env.LOCALAPPDATA || process.env.XDG_STATE_HOME || os.homedir();
  return path.join(base, 'Pravaha', `admin-credentials-${new Date().toISOString().slice(0, 10)}.txt`);
}

function assertOutsideRepo(file) {
  const resolved = path.resolve(file);
  const rel = path.relative(REPO_ROOT, resolved);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    die(`Refusing to write credentials inside the repository (${resolved}). Pass --out with a path outside ${REPO_ROOT}.`);
  }
  return resolved;
}

function restrictPermissions(file) {
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows ignores POSIX modes; handled below.
  }
  if (process.platform === 'win32') {
    const who = `${process.env.USERDOMAIN || ''}\\${process.env.USERNAME || os.userInfo().username}`.replace(/^\\/, '');
    try {
      execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `${who}:(F)`], { stdio: 'ignore' });
    } catch {
      console.warn('WARN: could not tighten the file ACL with icacls; check the file permissions manually.');
    }
  }
}

const user = await get('SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)', login);
if (!user) die(`No user found with login "${login}". Pass --login <id>.`);

const password = generatePassword();
const recoveryKey = generateRecoveryKey();
const passwordHash = hashPassword(password);

if (!verifyPassword(password, passwordHash) || verifyPassword(login, passwordHash)) {
  die('self-check failed: generated hash did not validate (no changes made)');
}

if (dryRun) {
  console.log('DRY RUN - no database changes were made.');
  console.log(`Would rotate login: ${user.email} (id ${user.id})`);
  console.log(`Would revoke all sessions for user ${user.id}.`);
  console.log(`Would write the new credentials to: ${assertOutsideRepo(arg('--out') || defaultOutPath())}`);
  process.exit(0);
}

const file = assertOutsideRepo(arg('--out') || defaultOutPath());

await run(
  'UPDATE users SET password_hash = $1, recovery_key_hash = $2, role = $3, active = 1 WHERE id = $4',
  passwordHash,
  hashToken(recoveryKey),
  'admin',
  user.id,
);
const { changes: revoked } = await run('DELETE FROM sessions WHERE user_id = $1', user.id);

const stored = await get('SELECT password_hash FROM users WHERE id = $1', user.id);
if (!verifyPassword(password, stored.password_hash) || verifyPassword(login, stored.password_hash)) {
  die('post-update verification failed. The credential file was NOT written; the password may still have changed - check the DB.');
}

fs.mkdirSync(path.dirname(file), { recursive: true });
const body = [
  'PRAVAHA CRM - ADMIN CREDENTIALS (rotated ' + new Date().toISOString() + ')',
  '',
  'Login / user ID: ' + user.email,
  'Password:        ' + password,
  'Recovery key:    ' + recoveryKey,
  '',
  'The previous password no longer works. All sessions for this account were invalidated.',
  'Save this in your password manager, then delete the file.',
  '',
].join('\r\n');
fs.writeFileSync(file, body, { encoding: 'utf8', mode: 0o600 });
restrictPermissions(file);

if (quiet) {
  console.log(file);
} else {
  console.log('Admin credential rotated.');
  console.log('  login:            ' + user.email + ' (id ' + user.id + ')');
  console.log('  sessions revoked: ' + revoked);
  console.log('  old password:     rejected');
  console.log('  credentials file: ' + file);
  console.log('');
  console.log('Move the password and recovery key into your password manager, then delete that file.');
}
