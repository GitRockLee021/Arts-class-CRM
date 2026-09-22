import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BRAND = process.env.CERT_BRAND || 'Pravaha Art Space';
const OWNER = process.env.CERT_OWNER || 'Radha Kannan';
const OWNER_TITLE = process.env.CERT_OWNER_TITLE || 'Founder — Right & Left Learning Academy';
const SIGNATURE_PATH = process.env.CERT_SIGNATURE_PATH || path.join(__dirname, '..', '..', 'assets', 'signature.png');
const LOGO_PATH = process.env.CERT_LOGO_PATH || path.join(__dirname, '..', '..', 'assets', 'logo.png');

const W = 1800;
const H = 2100;

const PALETTE = {
  cream: '#fbf7f0',
  creamDeep: '#f4ebdd',
  purple: '#7a5ba8',
  purpleDeep: '#5b4286',
  gold: '#c9a65a',
  goldDeep: '#a9833c',
  ink: '#2f2a36',
  inkSoft: '#5b5560',
};

const FONT_DIR = process.env.CERT_FONT_DIR || 'C:/Windows/Fonts';

const fonts = {
  serif: GlobalFonts.registerFromPath(`${FONT_DIR}/georgia.ttf`, 'Georgia') ? 'Georgia' : 'serif',
  serifBold: GlobalFonts.registerFromPath(`${FONT_DIR}/georgiab.ttf`, 'Georgia Bold') ? 'Georgia Bold' : 'Georgia',
  serifItalic: GlobalFonts.registerFromPath(`${FONT_DIR}/georgiai.ttf`, 'Georgia Italic') ? 'Georgia Italic' : 'Georgia',
  script: GlobalFonts.registerFromPath(`${FONT_DIR}/BRUSHSCI.TTF`, 'Brush Script MT') ? 'Brush Script MT' : 'Georgia',
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitFont(ctx, text, startSize, maxWidth, family, baseStyle = '') {
  let size = startSize;
  while (size > 18) {
    ctx.font = `${baseStyle} ${size}px "${family}"`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return ctx.font;
}

function drawCenter(ctx, text, x, y, style) {
  const {
    font,
    color = PALETTE.ink,
    spacing = 0,
    alpha = 1,
    baseline = 'alphabetic',
    align = 'center',
  } = style;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (spacing) {
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, x, y);
    ctx.letterSpacing = '0px';
  } else {
    ctx.fillText(text, x, y);
  }
  ctx.globalAlpha = 1;
}

function drawOrnamentLine(ctx, x1, x2, y, color = PALETTE.gold, d = PALETTE.purple) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.fillStyle = d;
  ctx.save();
  ctx.translate((x1 + x2) / 2, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-5, -5, 10, 10);
  ctx.restore();
}

function drawPalette(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.18);
  ctx.fillStyle = PALETTE.purple;
  ctx.shadowColor = 'rgba(90,70,130,0.35)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.cream;
  ctx.beginPath();
  ctx.arc(r * 0.36, -r * 0.16, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  const colors = [PALETTE.gold, '#d96c6c', '#5e8f86', '#6b62a0', '#d0913d'];
  const pos = [
    [r * 0.2, r * 0.5],
    [-r * 0.42, r * 0.28],
    [-r * 0.5, -r * 0.18],
    [-r * 0.3, -r * 0.5],
    [r * 0.05, -r * 0.5],
  ];
  pos.forEach(([dx, dy], i) => {
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.arc(dx, dy, r * 0.135, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawBrush(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(1.25);
  const len = 120;
  ctx.strokeStyle = PALETTE.goldDeep;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.lineTo(len * 0.2, 0);
  ctx.stroke();
  ctx.fillStyle = PALETTE.purpleDeep;
  ctx.beginPath();
  ctx.moveTo(len * 0.2, -12);
  ctx.lineTo(len + 16, 0);
  ctx.lineTo(len * 0.2, 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(len * 0.12, -22, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEmblem(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 76, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 66, 0, Math.PI * 2);
  ctx.stroke();
  drawPalette(ctx, 6, 4, 38);
  drawBrush(ctx, -30, -26);
  ctx.restore();
}

function drawSeal(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.purple;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.inkSoft;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
    ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40);
  }
  ctx.stroke();
  ctx.fillStyle = PALETTE.purple;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export async function generateCertificate({ studentName, fromCourse, toCourse, dateLabel, certNumber }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, PALETTE.cream);
  bg.addColorStop(1, PALETTE.creamDeep);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // outer frames
  ctx.strokeStyle = PALETTE.purple;
  ctx.lineWidth = 5;
  roundRect(ctx, 34, 34, W - 68, H - 68, 26);
  ctx.stroke();

  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2.5;
  roundRect(ctx, 56, 56, W - 112, H - 112, 18);
  ctx.stroke();

  ctx.strokeStyle = PALETTE.goldDeep;
  ctx.lineWidth = 1.5;
  roundRect(ctx, 74, 74, W - 148, H - 148, 14);
  ctx.stroke();

  // corner diamonds
  const corners = [[110, 112], [W - 110, 112], [110, H - 112], [W - 110, H - 112]];
  corners.forEach(([cx, cy]) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
  });
  // logo (if provided) else fallback emblem
  let logo = null;
  if (fs.existsSync(LOGO_PATH)) {
    try {
      logo = await loadImage(LOGO_PATH);
    } catch {
      logo = null;
    }
  }

  if (logo) {
    // draw the logo with "multiply" blending: white pixels merge into the
    // cream paper (no halo / no pixelation), coloured logo art stays crisp
    const logoW = 1000;
    const logoH = Math.round((logo.height / logo.width) * logoW);
    const logoTop = 110;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(logo, W / 2 - logoW / 2, logoTop, logoW, logoH);
    ctx.restore();
  } else {
    drawEmblem(ctx, W / 2, 200);
  }

  // brand
  drawCenter(ctx, BRAND.toUpperCase(), W / 2, 900, {
    font: `600 42px "${fonts.serifBold}"`,
    color: PALETTE.purpleDeep,
    spacing: 6,
  });
  const brandMid = 922;
  const brandW = Math.min(ctx.measureText(BRAND.toUpperCase()).width + 110, 620);
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(W / 2 - brandW, brandMid);
  ctx.lineTo(W / 2 - 120, brandMid);
  ctx.moveTo(W / 2 + 120, brandMid);
  ctx.lineTo(W / 2 + brandW, brandMid);
  ctx.stroke();
  ctx.fillStyle = PALETTE.goldDeep;
  ctx.beginPath();
  ctx.arc(W / 2, brandMid, 5, 0, Math.PI * 2);
  ctx.fill();

  // heading
  drawCenter(ctx, 'CERTIFICATE', W / 2, 1035, {
    font: `700 92px "${fonts.serifBold}"`,
    color: PALETTE.ink,
  });
  drawCenter(ctx, 'OF ACHIEVEMENT', W / 2, 1125, {
    font: `600 46px "${fonts.serif}"`,
    color: PALETTE.purple,
    spacing: 7,
  });
  drawOrnamentLine(ctx, W / 2 - 260, W / 2 + 260, 1172);

  // main body
  drawCenter(ctx, 'This is to certify that', W / 2, 1255, {
    font: `italic 34px "${fonts.serifItalic}"`,
    color: PALETTE.inkSoft,
  });

  const nameSafe = studentName || 'Student';
  fitFont(ctx, nameSafe, 132, 1350, fonts.script);
  drawCenter(ctx, nameSafe, W / 2, 1435, {
    font: ctx.font,
    color: PALETTE.ink,
  });

  drawCenter(ctx, 'has successfully completed', W / 2, 1535, {
    font: `italic 34px "${fonts.serifItalic}"`,
    color: PALETTE.inkSoft,
  });

  if (fromCourse) {
    fitFont(ctx, fromCourse, 44, 1350, fonts.serifItalic, 'italic');
    drawCenter(ctx, fromCourse, W / 2, 1610, {
      font: ctx.font,
      color: PALETTE.inkSoft,
    });
  }

  if (toCourse) {
    if (fromCourse) {
      drawCenter(ctx, 'and is promoted to', W / 2, 1675, {
        font: `italic 30px "${fonts.serifItalic}"`,
        color: PALETTE.inkSoft,
      });
      fitFont(ctx, toCourse, 56, 1350, fonts.serifBold);
      drawCenter(ctx, toCourse, W / 2, 1745, {
        font: ctx.font,
        color: PALETTE.purpleDeep,
      });
      drawCenter(ctx, `at ${BRAND}, on ${dateLabel}`, W / 2, 1810, {
        font: `italic 30px "${fonts.serifItalic}"`,
        color: PALETTE.inkSoft,
      });
    } else {
      fitFont(ctx, toCourse, 56, 1350, fonts.serifBold);
      drawCenter(ctx, toCourse, W / 2, 1610, {
        font: ctx.font,
        color: PALETTE.purpleDeep,
      });
      drawCenter(ctx, `at ${BRAND}, on ${dateLabel}`, W / 2, 1680, {
        font: `italic 30px "${fonts.serifItalic}"`,
        color: PALETTE.inkSoft,
      });
    }
  }

  // bottom row zone
  const bz = 1880;

  // bottom-left: certificate number (left-aligned, label above the number)
  const certBlockX = 196;
  drawCenter(ctx, 'CERTIFICATE NO.', certBlockX, bz + 22, {
    font: `600 22px "${fonts.serifBold}"`,
    color: PALETTE.inkSoft,
    spacing: 2,
    align: 'left',
  });
  drawCenter(ctx, certNumber, certBlockX, bz + 56, {
    font: `600 30px "${fonts.serif}"`,
    color: PALETTE.ink,
    spacing: 1,
    align: 'left',
  });

  drawSeal(ctx, W / 2, bz + 40);

  // signature
  const sigX = W - 330;
  const sigLineY = bz + 14;
  let sigImage = null;
  if (fs.existsSync(SIGNATURE_PATH)) {
    try {
      sigImage = await loadImage(SIGNATURE_PATH);
    } catch {
      sigImage = null;
    }
  }

  if (sigImage) {
    const imgW = 300;
    const imgH = Math.round((sigImage.height / sigImage.width) * imgW);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(sigImage, sigX - imgW / 2, sigLineY - imgH + 8, imgW, imgH);
    ctx.restore();
  } else {
    fitFont(ctx, OWNER, 74, 460, fonts.script);
    drawCenter(ctx, OWNER, sigX, sigLineY - 10, {
      font: ctx.font,
      color: PALETTE.ink,
    });
  }

  ctx.strokeStyle = PALETTE.inkSoft;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(sigX - 205, sigLineY);
  ctx.lineTo(sigX + 205, sigLineY);
  ctx.stroke();
  drawCenter(ctx, OWNER_TITLE, sigX, sigLineY + 58, {
    font: `italic 24px "${fonts.serifItalic}"`,
    color: PALETTE.inkSoft,
  });

  const buf = canvas.toBuffer('image/png');
  return {
    buffer: buf,
    mime: 'image/png',
    filename: certNumber.replace(/[^a-z0-9]+/gi, '_') + '.png',
  };
}

export function defaultCertNumber({ enrollmentId, serial = 1 }) {
  const year = new Date().getFullYear();
  return `PAS-${year}-${String(enrollmentId).padStart(4, '0')}${serial > 1 ? `-${serial}` : ''}`;
}