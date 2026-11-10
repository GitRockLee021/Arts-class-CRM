/**
 * Generates the sample invoice image used on the public site.
 *
 * Razorpay asks for a sample invoice during business-website verification. This script draws
 * a clean, realistic invoice to `site/assets/sample-invoice.png`. It uses only local files and
 * the already-installed @napi-rs/canvas dependency, so it does not touch the database.
 *
 * Run from the repo root:
 *   node server/scripts/generate-sample-invoice.mjs
 */
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(root, 'site', 'assets');
mkdirSync(outDir, { recursive: true });

GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\segoeui.ttf', 'Segoe');
GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\segoeuib.ttf', 'SegoeBold');
GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\georgia.ttf', 'Georgia');
GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\georgiab.ttf', 'GeorgiaBold');

const W = 1240;
const H = 1754;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

const INK = '#201b18';
const MUTED = '#7a6d61';
const LINE = '#ddd4c8';
const CLAY = '#ad4f2c';
const PAPER = '#fffdf9';

ctx.fillStyle = PAPER;
ctx.fillRect(0, 0, W, H);

const M = 88;

// Header rule
ctx.fillStyle = INK;
ctx.fillRect(M, 96, 10, 84);

// Logo
const logo = await loadImage(readFileSync(path.join(root, 'site', 'assets', 'logo.png')));
const logoH = 84;
const logoW = (logo.width / logo.height) * logoH;
ctx.drawImage(logo, M + 30, 96, logoW, logoH);

// Brand text
ctx.fillStyle = INK;
ctx.font = '42px GeorgiaBold';
ctx.fillText('Pravaha Art Space', M + 30, 230);
ctx.fillStyle = MUTED;
ctx.font = '20px Segoe';
ctx.fillText('A unit of Right & Left Learning Academy', M + 30, 262);

// Invoice title
ctx.textAlign = 'right';
ctx.fillStyle = INK;
ctx.font = '54px GeorgiaBold';
ctx.fillText('INVOICE', W - M, 140);
ctx.fillStyle = CLAY;
ctx.font = '20px SegoeBold';
ctx.fillText('SAMPLE DOCUMENT', W - M, 174);
ctx.textAlign = 'left';

// Divider
ctx.strokeStyle = INK;
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(M, 300);
ctx.lineTo(W - M, 300);
ctx.stroke();

// Business address
ctx.fillStyle = MUTED;
ctx.font = '19px Segoe';
const address = [
  'No. 2, Agaram Main Road, Indra Nagar,',
  'Selaiyur, Chennai 600 073, Tamil Nadu, India',
  'Phone / WhatsApp: +91 91766 56580',
  'Email: rightleftlearningacademy@gmail.com',
];
address.forEach((line, i) => ctx.fillText(line, M, 342 + i * 29));

// Invoice meta right
ctx.textAlign = 'right';
ctx.fillStyle = MUTED;
ctx.font = '13px SegoeBold';
ctx.fillText('INVOICE NO.', W - M, 342);
ctx.fillText('INVOICE DATE', W - M, 402);
ctx.fillText('PAYMENT STATUS', W - M, 462);
ctx.fillStyle = INK;
ctx.font = '21px Segoe';
ctx.fillText('PAS/2026-27/0042', W - M, 369);
ctx.fillText('10 November 2026', W - M, 429);
ctx.fillStyle = '#2f6b45';
ctx.font = '21px SegoeBold';
ctx.fillText('PAID', W - M, 489);
ctx.textAlign = 'left';

// Billed to
ctx.fillStyle = MUTED;
ctx.font = '13px SegoeBold';
ctx.fillText('BILLED TO', M, 580);
ctx.fillStyle = INK;
ctx.font = '24px GeorgiaBold';
ctx.fillText('Parent of Sample Student', M, 614);
ctx.fillStyle = MUTED;
ctx.font = '19px Segoe';
ctx.fillText('Selaiyur, Chennai 600 073', M, 644);
ctx.fillText('Phone: +91 90000 00000', M, 673);

// Programme
ctx.fillStyle = MUTED;
ctx.font = '13px SegoeBold';
ctx.fillText('PROGRAMME', W / 2 + 40, 580);
ctx.fillStyle = INK;
ctx.font = '24px GeorgiaBold';
ctx.fillText('Vidhai (Foundation)', W / 2 + 40, 614);
ctx.fillStyle = MUTED;
ctx.font = '19px Segoe';
ctx.fillText('Fine arts · Monthly batch', W / 2 + 40, 644);
ctx.fillText('Fee period: November 2026', W / 2 + 40, 673);

// Table
const tableTop = 740;
const rowH = 64;
const colX = [M, M + 520, M + 760];
ctx.fillStyle = INK;
ctx.fillRect(M, tableTop, W - M * 2, 52);
ctx.fillStyle = PAPER;
ctx.font = '14px SegoeBold';
ctx.fillText('DESCRIPTION', colX[0] + 20, tableTop + 33);
ctx.fillText('FEE TYPE', colX[1], tableTop + 33);
ctx.textAlign = 'right';
ctx.fillText('AMOUNT (INR)', W - M - 20, tableTop + 33);
ctx.textAlign = 'left';

const rows = [
  ['Monthly tuition — Vidhai, November 2026', 'Tuition', '1,200.00'],
  ['One-time admission fee', 'Admission', '300.00'],
  ['Art kit (starter materials)', 'Kit', '600.00'],
];

rows.forEach((row, i) => {
  const y = tableTop + 52 + i * rowH;
  if (i % 2 === 0) {
    ctx.fillStyle = '#fbf6ee';
    ctx.fillRect(M, y, W - M * 2, rowH);
  }
  ctx.fillStyle = INK;
  ctx.font = '20px Segoe';
  ctx.fillText(row[0], colX[0] + 20, y + 40);
  ctx.fillStyle = MUTED;
  ctx.fillText(row[1], colX[1], y + 40);
  ctx.fillStyle = INK;
  ctx.textAlign = 'right';
  ctx.fillText(row[2], W - M - 20, y + 40);
  ctx.textAlign = 'left';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, y + rowH);
  ctx.lineTo(W - M, y + rowH);
  ctx.stroke();
});

// Totals
const totalY = tableTop + 52 + rows.length * rowH + 26;
ctx.fillStyle = MUTED;
ctx.font = '19px Segoe';
ctx.textAlign = 'right';
ctx.fillText('Subtotal', W - M - 280, totalY);
ctx.fillText('Total paid', W - M - 280, totalY + 58);
ctx.fillStyle = INK;
ctx.font = '20px Segoe';
ctx.fillText('₹ 2,100.00', W - M - 20, totalY);
ctx.font = '34px GeorgiaBold';
ctx.fillText('₹ 2,100.00', W - M - 20, totalY + 62);

ctx.strokeStyle = INK;
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(W - M - 520, totalY + 86);
ctx.lineTo(W - M, totalY + 86);
ctx.stroke();
ctx.textAlign = 'left';

// Payment details
const payY = totalY + 150;
ctx.fillStyle = INK;
ctx.font = '22px GeorgiaBold';
ctx.fillText('Payment details', M, payY);
ctx.fillStyle = MUTED;
ctx.font = '19px Segoe';
const payLines = [
  'Payment method: UPI (Razorpay)',
  'Razorpay payment reference: pay_SAMPLE0042',
  'Received on: 10 November 2026',
  'Receipt: PAS-R-2026-0042',
];
payLines.forEach((line, i) => ctx.fillText(line, M, payY + 38 + i * 30));

// Sample stamp
ctx.save();
ctx.translate(W - M - 160, payY + 30);
ctx.rotate(-0.12);
ctx.strokeStyle = CLAY;
ctx.lineWidth = 4;
ctx.strokeRect(-150, -30, 300, 90);
ctx.fillStyle = CLAY;
ctx.font = '30px SegoeBold';
ctx.textAlign = 'center';
ctx.fillText('SAMPLE', 0, 12);
ctx.font = '13px SegoeBold';
ctx.fillText('NOT A TAX INVOICE', 0, 40);
ctx.restore();
ctx.textAlign = 'left';

// Footer
ctx.strokeStyle = LINE;
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(M, H - 190);
ctx.lineTo(W - M, H - 190);
ctx.stroke();

ctx.fillStyle = MUTED;
ctx.font = '17px Segoe';
ctx.fillText('This is a computer-generated sample invoice for business verification. No payment was collected.', M, H - 146);
ctx.fillText('Pravaha Art Space · Right & Left Learning Academy · Selaiyur, Chennai 600 073', M, H - 116);
ctx.fillStyle = INK;
ctx.font = '17px SegoeBold';
ctx.fillText('Questions? +91 91766 56580 · rightleftlearningacademy@gmail.com', M, H - 86);

const out = path.join(outDir, 'sample-invoice.png');
const { writeFileSync } = await import('node:fs');
writeFileSync(out, canvas.toBuffer('image/png'));
console.log('wrote', out);
