// news-image-20261123: "The World in One Day: Monday 23 November 2026"
// A one-page newspaper front page drawn entirely in code (Node 22, stdlib only).
// 25 verified stories across 6 regions. Lead: COP31 ends with no deal.
// All facts from the verified dossier (full-day refresh 24 Nov 2026).
// Text comes from a pre-rendered DejaVu font atlas (font-atlas.bin, a data asset).
// The program writes /output/entry.png (or MAKEFUN_OUTPUT_DIR/entry.png).
// Deterministic: two runs write byte-identical output. No network, no writes
// outside the output directory.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

// ---------------------------------------------------------------- constants
const W = 1024;
const H = 1024;
const MARGIN = 12;
const CONTENT_W = W - MARGIN * 2;

const PAPER: [number, number, number] = [247, 239, 216];
const NAVY: [number, number, number] = [22, 38, 76];
const NAVY_PANEL: [number, number, number] = [30, 47, 87];
const RED: [number, number, number] = [178, 32, 40];
const INK: [number, number, number] = [32, 32, 32];
const GREY: [number, number, number] = [96, 100, 110];
const GREEN: [number, number, number] = [46, 125, 50];
const AMBER: [number, number, number] = [183, 121, 31];
const TEAL: [number, number, number] = [15, 118, 110];
const SEA: [number, number, number] = [220, 233, 242];
const LAND: [number, number, number] = [217, 200, 154];
const WHITE: [number, number, number] = [255, 255, 255];
const CREAM_LINE: [number, number, number] = [214, 203, 170];

// Region colors, in tab order.
const REGION_COLORS: Record<string, [number, number, number]> = {
  EUROPE: [31, 58, 110],
  "MIDDLE EAST": [168, 30, 40],
  AFRICA: [46, 125, 50],
  "ASIA-PACIFIC": [183, 121, 31],
  AMERICAS: [15, 118, 110],
  GLOBAL: [91, 100, 112],
};
const TAG_COLORS: Record<string, [number, number, number]> = {
  CONFIRMED: [46, 125, 50],
  CLAIM: [198, 40, 40],
  REPORTED: [30, 58, 110],
  ONGOING: [183, 121, 31],
};

// ------------------------------------------------------------ font atlas
// File layout: one JSON header line, then raw grayscale coverage bytes.
// Header: {"v":1,"glyphs":{"family|scale|char":{"o":offset,"w":w,"h":h,
// "adv":advance,"bx":bearingX,"by":bearingY}}}. Offsets are relative to the
// first byte after the header newline. Families: serif, serifr, sansb, sans.
// Glyph bitmaps are row-major, one coverage byte per pixel (0 clear, 255 ink).
// Placement: for a font whose capital A is capH tall, a glyph sits with its
// top at baseline - capH + by and its left at x + bx.

function findAtlas(): string {
  const fromEnv = process.env.MAKEFUN_BOT_DIR;
  const candidates = [
    fromEnv ? path.join(fromEnv, "font-atlas.bin") : "",
    path.join(path.dirname(fileURLToPath(import.meta.url)), "font-atlas.bin"),
    path.join(process.cwd(), "font-atlas.bin"),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("font-atlas.bin not found");
}

const atlasBuf = fs.readFileSync(findAtlas());
const headerEnd = atlasBuf.indexOf(10);
const atlasHeader = JSON.parse(atlasBuf.subarray(0, headerEnd).toString("utf8")) as {
  v: number;
  glyphs: Record<string, { o: number; w: number; h: number; adv: number; bx: number; by: number }>;
};
const DATA_START = headerEnd + 1;
const GLYPHS = atlasHeader.glyphs;

type FontKey = string;

function glyphFor(font: FontKey, ch: string) {
  const g = GLYPHS[font + "|" + ch];
  if (!g) throw new Error("missing glyph " + font + " " + JSON.stringify(ch));
  return g;
}

function capHeight(font: FontKey): number {
  return glyphFor(font, "A").h;
}

function measure(font: FontKey, text: string): number {
  let w = 0;
  for (const ch of text.toUpperCase()) {
    if (ch === "+") {
      w += Math.round(capHeight(font) * 0.6);
      continue;
    }
    w += glyphFor(font, ch).adv;
  }
  return w;
}

// ---------------------------------------------------------------- canvas
const px = new Uint8ClampedArray(W * H * 4);

function fillAll(c: [number, number, number]): void {
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = c[0];
    px[i * 4 + 1] = c[1];
    px[i * 4 + 2] = c[2];
    px[i * 4 + 3] = 255;
  }
}

function setPixel(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const k = (y * W + x) * 4;
  px[k] = c[0];
  px[k + 1] = c[1];
  px[k + 2] = c[2];
}

function blendPixel(x: number, y: number, c: [number, number, number], a: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
  if (a >= 1) {
    setPixel(x, y, c);
    return;
  }
  const k = (y * W + x) * 4;
  px[k] = Math.round(px[k] * (1 - a) + c[0] * a);
  px[k + 1] = Math.round(px[k + 1] * (1 - a) + c[1] * a);
  px[k + 2] = Math.round(px[k + 2] * (1 - a) + c[2] * a);
}

function rect(x: number, y: number, w: number, h: number, c: [number, number, number]): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let j = y0; j < y1; j++) {
    for (let i = x0; i < x1; i++) {
      const k = (j * W + i) * 4;
      px[k] = c[0];
      px[k + 1] = c[1];
      px[k + 2] = c[2];
    }
  }
}

function hline(x: number, y: number, w: number, c: [number, number, number]): void {
  rect(x, y, w, 1, c);
}

function vline(x: number, y: number, h: number, c: [number, number, number]): void {
  rect(x, y, 1, h, c);
}

// Bresenham line.
function line(x0: number, y0: number, x1: number, y1: number, c: [number, number, number]): void {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    setPixel(ax, ay, c);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ax += sx;
    }
    if (e2 <= dx) {
      err += dx;
      ay += sy;
    }
  }
}

function thickLine(x0: number, y0: number, x1: number, y1: number, t: number, c: [number, number, number]): void {
  for (let d = -Math.floor(t / 2); d <= Math.floor(t / 2); d++) {
    line(x0 + d, y0, x1 + d, y1, c);
    line(x0, y0 + d, x1, y1 + d, c);
  }
}

function filledCircle(cx: number, cy: number, r: number, c: [number, number, number]): void {
  const rr = Math.round(r);
  for (let j = -rr; j <= rr; j++) {
    const half = Math.floor(Math.sqrt(rr * rr - j * j));
    for (let i = -half; i <= half; i++) setPixel(Math.round(cx) + i, Math.round(cy) + j, c);
  }
}

function circleOutline(cx: number, cy: number, r: number, c: [number, number, number]): void {
  const rr = Math.round(r);
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    setPixel(Math.round(cx + rr * Math.cos(rad)), Math.round(cy + rr * Math.sin(rad)), c);
  }
}

function filledEllipse(cx: number, cy: number, rx: number, ry: number, c: [number, number, number]): void {
  const rxi = Math.round(rx);
  const ryi = Math.round(ry);
  for (let j = -ryi; j <= ryi; j++) {
    const t = 1 - (j * j) / (ryi * ryi);
    if (t < 0) continue;
    const half = Math.floor(rxi * Math.sqrt(t));
    for (let i = -half; i <= half; i++) setPixel(Math.round(cx) + i, Math.round(cy) + j, c);
  }
}

// Scanline polygon fill. Points are [x, y] pairs.
function polygon(points: Array<[number, number]>, c: [number, number, number]): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.ceil(xs[k]);
      const xb = Math.floor(xs[k + 1]);
      for (let x = xa; x <= xb; x++) setPixel(x, y, c);
    }
  }
}

// ---------------------------------------------------------------- text
function drawText(font: FontKey, x: number, baseline: number, text: string, c: [number, number, number]): number {
  const capH = capHeight(font);
  let cx = Math.round(x);
  const by0 = Math.round(baseline);
  for (const ch of text.toUpperCase()) {
    if (ch === "+") {
      // The atlas has no plus glyph; draw one from bars.
      const size = Math.max(6, Math.round(capH * 0.55));
      const adv = Math.round(capH * 0.6);
      drawPlus(cx + Math.round(adv / 2), by0 - Math.round(capH / 2), size, c);
      cx += adv;
      continue;
    }
    const g = glyphFor(font, ch);
    const gx = cx + g.bx;
    const gy = by0 - capH + g.by;
    for (let row = 0; row < g.h; row++) {
      for (let col = 0; col < g.w; col++) {
        const cov = atlasBuf[DATA_START + g.o + row * g.w + col];
        if (cov) blendPixel(gx + col, gy + row, c, cov / 255);
      }
    }
    cx += g.adv;
  }
  return cx;
}

function drawTextCentered(font: FontKey, cx: number, baseline: number, text: string, c: [number, number, number]): void {
  const w = measure(font, text);
  drawText(font, cx - Math.round(w / 2), baseline, text, c);
}

function drawTextRight(font: FontKey, rightX: number, baseline: number, text: string, c: [number, number, number]): void {
  drawText(font, rightX - measure(font, text), baseline, text, c);
}

// Greedy word wrap to maxWidth. Returns lines of at most maxWidth.
function wrapText(font: FontKey, text: string, maxWidth: number): string[] {
  const words = text.toUpperCase().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur === "" ? word : cur + " " + word;
    if (measure(font, trial) <= maxWidth || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// Draw wrapped text, up to maxLines lines, at (x, firstBaseline) with lineHeight.
function drawWrapped(font: FontKey, x: number, firstBaseline: number, lineHeight: number, text: string, maxWidth: number, maxLines: number, c: [number, number, number]): number {
  const lines = wrapText(font, text, maxWidth).slice(0, maxLines);
  lines.forEach((ln, i) => drawText(font, x, firstBaseline + i * lineHeight, ln, c));
  return lines.length;
}

// Small status tag pill. Returns the pill width.
function drawTag(x: number, y: number, label: string, bg: [number, number, number], h = 15): number {
  const font = "sansb|1";
  const tw = measure(font, label);
  const w = tw + 12;
  rect(x, y, w, h, bg);
  drawText(font, x + 6, y + 11, label, WHITE);
  return w;
}

// Draw a plus sign (for "12,000+") with two bars.
function drawPlus(cx: number, cy: number, size: number, c: [number, number, number]): void {
  const t = Math.max(2, Math.round(size / 4));
  rect(cx - Math.round(size / 2), cy - Math.round(t / 2), size, t, c);
  rect(cx - Math.round(t / 2), cy - Math.round(size / 2), t, size, c);
}

// ---------------------------------------------------------------- png
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePng(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- stories
// 25 verified stories. Regions and counts reconcile with the tabs:
// EUROPE 8, MIDDLE EAST 2, AFRICA 3, ASIA-PACIFIC 5, AMERICAS 3, GLOBAL 4.
// Tags: CONFIRMED = official / 2+ outlets; CLAIM = one side's claim;
// REPORTED = one source / witnesses; ONGOING = still developing.

type ModuleStory = {
  n: number;
  region: string;
  headline: string;
  body: string;
  tag: keyof typeof TAG_COLORS;
};

const MODULES: Array<{ region: string; stories: ModuleStory[] }> = [
  {
    region: "EUROPE",
    stories: [
      { n: 4, region: "EUROPE", headline: "NATO MEETS ON POLAND MISSILES", body: "THREE MISSILES CRASHED FRIDAY.", tag: "CONFIRMED" },
      { n: 5, region: "EUROPE", headline: "KINDERGARTEN HIT IN KHARKIV", body: "RENEWED FEARS FOR CIVILIANS.", tag: "CONFIRMED" },
      { n: 6, region: "EUROPE", headline: "SLOVYANSK STRIKES REPORTEDLY KILL 2", body: "AIRSTRIKES HIT THE CITY.", tag: "REPORTED" },
    ],
  },
  {
    region: "MIDDLE EAST",
    stories: [
      { n: 7, region: "MIDDLE EAST", headline: "GAZA CONTAMINATION REPORT", body: "WATER, SOIL, AIR CONTAMINATED.", tag: "CONFIRMED" },
    ],
  },
  {
    region: "AFRICA",
    stories: [
      { n: 8, region: "AFRICA", headline: "KHARTOUM DRONE STRIKES HIT UN BUILDING", body: "ARMY BLAMES ETHIOPIA.", tag: "CONFIRMED" },
      { n: 9, region: "AFRICA", headline: "SOUTH SUDAN ATTACK CASUALTIES", body: "AFP REPORTS CASUALTIES.", tag: "REPORTED" },
      { n: 10, region: "AFRICA", headline: "CONGO EBOLA RESPONSE DISRUPTED", body: "WHO: FIGHTING DISRUPTS RESPONSE.", tag: "ONGOING" },
    ],
  },
  {
    region: "ASIA-PACIFIC",
    stories: [
      { n: 11, region: "ASIA-PACIFIC", headline: "INDONESIA FACTORY FIRE: 24 DEAD", body: "ABOUT 30 STILL MISSING.", tag: "CONFIRMED" },
      { n: 12, region: "ASIA-PACIFIC", headline: "CHINA ADDRESSES COP31 COLLAPSE", body: "BEIJING URGES FAITH IN TALKS.", tag: "CONFIRMED" },
      { n: 13, region: "ASIA-PACIFIC", headline: "KOSPI SLIDES 3.31%", body: "REGULATORS STEP IN.", tag: "CONFIRMED" },
    ],
  },
  {
    region: "AMERICAS",
    stories: [
      { n: 14, region: "AMERICAS", headline: "S AND P 500 REBOUNDS 5%", body: "NASDAQ UP 6% ON NVIDIA RETURN.", tag: "CONFIRMED" },
      { n: 15, region: "AMERICAS", headline: "HUANG REINSTATED AS CEO", body: "VOTED BACK. PROBE CONTINUES.", tag: "CONFIRMED" },
      { n: 16, region: "AMERICAS", headline: "US SEEKS ANSWERS ON AI CHIPS TO CHINA", body: "US PROBES CHIP EXPORTS.", tag: "CONFIRMED" },
    ],
  },
  {
    region: "GLOBAL",
    stories: [
      { n: 17, region: "GLOBAL", headline: "$12 TRILLION WIPED SINCE 6 OCTOBER", body: "CHIPS -36%, BITCOIN -31%.", tag: "CONFIRMED" },
      { n: 18, region: "GLOBAL", headline: "EU-INDONESIA FREE TRADE DEAL SIGNED", body: "BRUSSELS SIGNED THE AGREEMENT.", tag: "REPORTED" },
      { n: 19, region: "GLOBAL", headline: "CAPITA SHARES PLUNGE 67%", body: "CEO EXITS, SHARES PLUNGE.", tag: "CONFIRMED" },
    ],
  },
];

const ALSO_ON: Array<{ n: number; text: string; tag: keyof typeof TAG_COLORS }> = [
  { n: 20, text: "UKRAINE HITS OIL SITES IN ROSTOV, PERM, TATARSTAN", tag: "CONFIRMED" },
  { n: 21, text: "KYIV PRESSES US ON PATRIOT DELAYS", tag: "CONFIRMED" },
  { n: 22, text: "MANCHESTER EVACUATES 12,000+ AT CONCERT", tag: "CONFIRMED" },
  { n: 23, text: "SPARTA II TOWED FROM FINNISH WATERS", tag: "CONFIRMED" },
  { n: 24, text: "TATA STEEL BUYS $1.67B APL APOLLO STAKE", tag: "CONFIRMED" },
  { n: 25, text: "SOFTBANK FELL 14% ON FRIDAY", tag: "CONFIRMED" },
];

// ---------------------------------------------------------------- illustrations
// All scenes are drawn in code: original geometric illustrations, no photos.

function drawChair(x: number, y: number, s: number, c: [number, number, number]): void {
  // Simple empty chair: backrest, seat, two legs.
  rect(x, y, Math.round(3 * s), Math.round(14 * s), c);
  rect(x - Math.round(2 * s), y + Math.round(14 * s), Math.round(7 * s), Math.round(3 * s), c);
  rect(x, y + Math.round(17 * s), Math.round(1.5 * s), Math.round(6 * s), c);
  rect(x + Math.round(3.5 * s), y + Math.round(17 * s), Math.round(1.5 * s), Math.round(6 * s), c);
}

function drawDroopingFlag(x: number, yTop: number, h: number, c: [number, number, number]): void {
  // Thin pole with a small flag hanging down from the top (a failed summit:
  // the flags droop instead of flying).
  vline(x, yTop, h, [235, 225, 200]);
  polygon(
    [
      [x, yTop],
      [x + 11, yTop + 2],
      [x + 9, yTop + 12],
      [x + 2, yTop + 13],
    ],
    c
  );
}

// COP31 lead illustration: a round negotiation table with empty chairs,
// drooping flags, and a cracked globe on the table. Panel is x..x+w, y..y+h.
function drawCop31(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, NAVY_PANEL);
  // Pale horizon glow behind the table.
  rect(x, y, w, 26, [38, 58, 104]);
  // Floor band.
  rect(x, y + h - 16, w, 16, [178, 152, 96]);
  const cx = x + w / 2;
  const tableY = y + h - 62;
  // Empty chairs behind the table.
  const chairC: [number, number, number] = [214, 190, 138];
  drawChair(cx - 128, tableY - 58, 1.8, chairC);
  drawChair(cx - 72, tableY - 64, 1.8, chairC);
  drawChair(cx - 14, tableY - 66, 1.8, chairC);
  drawChair(cx + 44, tableY - 64, 1.8, chairC);
  drawChair(cx + 100, tableY - 58, 1.8, chairC);
  // Round table: dark edge, wood top.
  filledEllipse(cx, tableY + 8, 132, 30, [90, 70, 38]);
  filledEllipse(cx, tableY, 132, 30, [150, 118, 66]);
  filledEllipse(cx, tableY, 118, 24, [168, 136, 82]);
  // Cracked globe standing on the table.
  const gx = cx;
  const gy = tableY - 46;
  filledCircle(gx, gy, 34, [52, 134, 168]);
  // Land blobs.
  filledEllipse(gx - 12, gy - 10, 12, 8, [110, 168, 96]);
  filledEllipse(gx + 12, gy + 8, 10, 7, [110, 168, 96]);
  filledEllipse(gx + 4, gy - 16, 7, 5, [110, 168, 96]);
  filledEllipse(gx - 14, gy + 14, 8, 5, [110, 168, 96]);
  // The crack: a jagged dark line across the globe.
  const crack: Array<[number, number]> = [
    [gx - 30, gy - 18],
    [gx - 16, gy - 6],
    [gx - 22, gy + 4],
    [gx - 6, gy + 12],
    [gx - 12, gy + 22],
    [gx + 4, gy + 30],
    [gx + 2, gy + 20],
    [gx + 12, gy + 10],
    [gx + 6, gy - 2],
    [gx + 18, gy - 10],
    [gx + 30, gy - 16],
    [gx + 20, gy - 4],
    [gx + 8, gy + 2],
    [gx + 14, gy + 14],
    [gx + 0, gy + 24],
    [gx - 8, gy + 16],
    [gx - 16, gy + 8],
    [gx - 10, gy - 2],
    [gx - 24, gy - 12],
  ];
  for (let i = 0; i + 1 < crack.length; i++) {
    thickLine(crack[i][0], crack[i][1], crack[i + 1][0], crack[i + 1][1], 3, [18, 24, 40]);
  }
  circleOutline(gx, gy, 34, [220, 230, 240]);
  // Drooping flags on the table, behind the globe.
  drawDroopingFlag(cx - 108, tableY - 44, 34, [178, 32, 40]);
  drawDroopingFlag(cx - 84, tableY - 48, 38, [46, 125, 50]);
  drawDroopingFlag(cx + 82, tableY - 48, 38, [183, 121, 31]);
  drawDroopingFlag(cx + 106, tableY - 44, 34, [15, 118, 110]);
  // Chairs in front of the table (near side, two, half cut by the panel edge).
  drawChair(cx - 96, tableY + 22, 1.8, chairC);
  drawChair(cx + 72, tableY + 22, 1.8, chairC);
}

// Merkury illustration: a corvette on a dark sea, two drones above it,
// a small burst at the waterline. Panel x..x+w, y..y+h.
function drawMerkury(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, NAVY_PANEL);
  rect(x, y + Math.round(h * 0.62), w, h - Math.round(h * 0.62), [38, 58, 108]);
  // Moon glow (kept clear of the status tag in the top-right corner).
  filledCircle(x + w - 28, y + 54, 13, [240, 210, 110]);
  // Waves.
  for (let i = 0; i < 3; i++) {
    const wy = y + Math.round(h * 0.66) + i * 12;
    for (let wx = x + 6; wx < x + w - 20; wx += 26) {
      line(wx, wy, wx + 12, wy, [150, 175, 210]);
    }
  }
  // Corvette silhouette.
  const hx = x + 18;
  const hy = y + Math.round(h * 0.58);
  polygon(
    [
      [hx, hy],
      [hx + 96, hy],
      [hx + 112, hy + 12],
      [hx + 100, hy + 18],
      [hx + 8, hy + 18],
      [hx, hy + 8],
    ],
    [14, 18, 30]
  );
  rect(hx + 30, hy - 16, 34, 16, [14, 18, 30]);
  rect(hx + 68, hy - 10, 12, 10, [14, 18, 30]);
  vline(hx + 46, hy - 30, 16, [14, 18, 30]);
  // Portholes.
  for (let i = 0; i < 4; i++) filledCircle(hx + 22 + i * 20, hy + 9, 2, [240, 190, 80]);
  // Two drones.
  const drone = (dx: number, dy: number) => {
    rect(dx - 5, dy - 2, 10, 4, [10, 12, 20]);
    line(dx - 10, dy - 5, dx + 10, dy - 5, [10, 12, 20]);
    line(dx - 10, dy + 5, dx + 10, dy + 5, [10, 12, 20]);
    filledCircle(dx - 10, dy - 5, 2, [220, 60, 50]);
    filledCircle(dx + 10, dy - 5, 2, [220, 60, 50]);
  };
  drone(x + 34, y + 30);
  drone(x + w - 42, y + 44);
  // Burst at the waterline.
  const bx = hx + 108;
  const by = hy + 12;
  filledCircle(bx, by, 7, [240, 170, 40]);
  for (let a = 0; a < 8; a++) {
    const rad = (a * Math.PI) / 4;
    line(bx, by, Math.round(bx + 14 * Math.cos(rad)), Math.round(by + 14 * Math.sin(rad)), [240, 170, 40]);
  }
  filledCircle(bx - 8, by - 12, 5, [120, 125, 135]);
  filledCircle(bx + 2, by - 16, 6, [120, 125, 135]);
}

// Dymer illustration: a five-storey block at night, one corner collapsed,
// rubble at the base, a searchlight beam. Panel x..x+w, y..y+h.
function drawDymer(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [18, 26, 52]);
  // Stars.
  const stars: Array<[number, number]> = [[14, 12], [38, 22], [120, 10], [136, 30], [96, 16], [60, 8]];
  for (const [sx, sy] of stars) filledCircle(x + sx, y + sy, 1, [230, 230, 220]);
  // Searchlight beam from the top right.
  polygon(
    [
      [x + w - 6, y + 4],
      [x + w - 60, y + h - 30],
      [x + w - 34, y + h - 30],
    ],
    [240, 220, 140]
  );
  // The block: intact left part.
  const bx = x + 18;
  const by = y + 26;
  const bw = 74;
  const bh = h - 48;
  rect(bx, by, bw, bh, [58, 54, 48]);
  // Lit windows, 4 columns x 5 rows, a few dark.
  const lit: Array<[number, number]> = [
    [0, 0], [1, 0], [3, 0],
    [0, 1], [2, 1],
    [1, 2], [2, 2], [3, 2],
    [0, 3], [1, 3],
    [2, 4], [3, 4],
  ];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 4; c++) {
      const on = lit.some(([cc, rr]) => cc === c && rr === r);
      rect(bx + 8 + c * 16, by + 8 + r * Math.floor((bh - 16) / 5), 10, 9, on ? [240, 180, 60] : [28, 26, 24]);
    }
  }
  // Collapsed right corner: a tilted slab and rubble.
  polygon(
    [
      [bx + bw, by + 14],
      [bx + bw + 34, by + 40],
      [bx + bw + 26, by + 58],
      [bx + bw, by + 44],
    ],
    [44, 40, 36]
  );
  polygon(
    [
      [bx + bw - 6, by + bh - 22],
      [bx + bw + 36, by + bh - 4],
      [bx + bw + 40, by + bh],
      [bx + bw - 10, by + bh],
    ],
    [70, 64, 56]
  );
  filledCircle(bx + bw + 18, by + bh - 12, 5, [90, 84, 74]);
  filledCircle(bx + bw + 30, by + bh - 6, 4, [80, 74, 64]);
  // Ground line.
  rect(x, y + h - 10, w, 10, [40, 36, 32]);
}

// Small numbered world map: simplified continents, pins at story locations.
// Pins carry the story numbers so a reader can cross-reference the page.
function drawMiniMap(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SEA);
  const lonToX = (lon: number) => x + ((lon + 170) / 360) * w;
  const latToY = (lat: number) => y + ((80 - lat) / 135) * h;
  const poly = (pts: Array<[number, number]>) =>
    polygon(
      pts.map(([lon, lat]) => [lonToX(lon), latToY(lat)] as [number, number]),
      LAND
    );
  poly([[-168, 66], [-140, 70], [-125, 72], [-110, 68], [-95, 80], [-85, 70], [-75, 62], [-60, 47], [-70, 42], [-80, 32], [-85, 30], [-97, 26], [-105, 20], [-115, 28], [-125, 40], [-130, 55], [-150, 60], [-165, 60]]);
  poly([[-55, 60], [-45, 60], [-30, 68], [-20, 70], [-40, 76], [-58, 76]]);
  poly([[-80, 10], [-75, 5], [-60, 0], [-50, -5], [-35, -8], [-40, -20], [-48, -28], [-58, -35], [-65, -45], [-70, -55], [-73, -40], [-72, -20], [-80, -5]]);
  poly([[-17, 15], [-10, 30], [0, 35], [10, 37], [20, 32], [30, 31], [35, 28], [43, 12], [51, 11], [48, 0], [40, -10], [35, -20], [32, -29], [25, -34], [18, -35], [15, -25], [12, -18], [9, 4], [-8, 4], [-13, 8]]);
  poly([[-10, 36], [-9, 43], [-2, 48], [0, 50], [5, 53], [8, 57], [10, 59], [18, 56], [21, 55], [23, 58], [28, 60], [30, 70], [25, 71], [18, 69], [12, 65], [5, 60], [-2, 55], [-5, 50], [-10, 43]]);
  poly([[30, 70], [40, 68], [50, 70], [60, 69], [70, 72], [80, 73], [90, 75], [100, 77], [110, 74], [120, 73], [130, 72], [140, 72], [150, 70], [160, 66], [162, 60], [158, 52], [142, 50], [140, 40], [135, 35], [130, 33], [127, 38], [122, 32], [120, 25], [115, 22], [110, 20], [108, 12], [105, 8], [100, 7], [98, 10], [95, 16], [92, 21], [90, 22], [88, 22], [85, 19], [80, 15], [77, 8], [75, 10], [72, 20], [68, 23], [65, 25], [60, 25], [57, 26], [55, 26], [52, 28], [50, 29], [48, 30], [44, 29], [40, 31], [38, 36], [35, 36], [32, 36], [30, 36], [28, 41], [27, 40], [30, 45], [32, 50], [30, 55], [30, 60], [30, 65]]);
  poly([[114, -22], [114, -30], [115, -35], [120, -34], [125, -33], [130, -32], [135, -35], [140, -38], [145, -38], [150, -37], [153, -32], [153, -27], [150, -22], [146, -19], [142, -15], [142, -11], [137, -12], [135, -15], [132, -12], [130, -13], [126, -14], [122, -17], [118, -20]]);
  poly([[95, 5], [100, 0], [104, -3], [106, -6], [103, -5], [98, 2]]);
  poly([[109, 1], [113, 4], [117, 2], [118, -2], [114, -4], [110, -3]]);
  poly([[105, -7], [110, -7], [114, -8], [114, -9], [106, -8]]);
  poly([[131, -1], [136, -2], [141, -3], [145, -5], [147, -7], [141, -8], [136, -8], [132, -4]]);
  poly([[130, 31], [133, 34], [136, 35], [139, 37], [141, 39], [141, 42], [143, 44]]);
  poly([[-5, 50], [-3, 53], [-5, 56], [-2, 58], [0, 53], [1, 51]]);
  // Pins: story number at its location, in the story's region color.
  // Positions are nudged apart where stories cluster around the Mediterranean.
  const pins: Array<{ n: number; lon: number; lat: number; region: string; dx: number; dy: number }> = [
    { n: 1, lon: 30.7, lat: 36.9, region: "GLOBAL", dx: -7, dy: -3 },
    { n: 2, lon: 20.1, lat: 32.1, region: "MIDDLE EAST", dx: -8, dy: 4 },
    { n: 3, lon: 30.0, lat: 50.8, region: "EUROPE", dx: 7, dy: -5 },
    { n: 8, lon: 32.5, lat: 15.6, region: "AFRICA", dx: 7, dy: 3 },
    { n: 11, lon: 106.1, lat: -6.2, region: "ASIA-PACIFIC", dx: 0, dy: 0 },
    { n: 14, lon: -74.0, lat: 40.7, region: "AMERICAS", dx: 0, dy: 0 },
  ];
  for (const p of pins) {
    const px = lonToX(p.lon) + p.dx;
    const py = latToY(p.lat) + p.dy;
    const col = REGION_COLORS[p.region];
    filledCircle(px, py, 7, col);
    circleOutline(px, py, 7, WHITE);
    const label = String(p.n);
    drawText("sansb|1", px - Math.round(measure("sansb|1", label) / 2), py + 3, label, WHITE);
  }
}

// ---------------------------------------------------------------- layout
function drawMasthead(): void {
  rect(0, 0, W, 28, NAVY);
  drawText("sansb|2", 14, 19, "THE WORLD IN ONE DAY", WHITE);
  drawTextRight("sansb|1", 1010, 19, "25 STORIES • 6 REGIONS • ALL DATED MONDAY 23 NOVEMBER 2026", WHITE);
}

function drawDateAndSubhead(): void {
  drawTextCentered("serif|5", 512, 82, "MONDAY 23 NOVEMBER 2026", NAVY);
  drawTextCentered(
    "sansb|2",
    512,
    106,
    "COP31 COLLAPSES • UKRAINE SAYS DRONES SANK WARSHIP • S AND P 500 +5%",
    RED
  );
}

function drawNumberStrip(): void {
  const items: Array<{ num: string; label: string }> = [
    { num: "+5%", label: "S AND P 500 REBOUNDS" },
    { num: "-3.31%", label: "KOSPI SLIDES" },
    { num: "$12T", label: "AS OF FRI 20 NOV" },
    { num: "24", label: "INDONESIA FIRE" },
    { num: "11", label: "KILLED, DYMER" },
    { num: "12,000+", label: "EVACUATED, MANCHESTER" },
  ];
  const widths = items.map((it) => measure("serif|5", it.num));
  const total = widths.reduce((a, b) => a + b, 0);
  const extra = CONTENT_W - total;
  const pad = Math.floor(extra / items.length);
  let x = MARGIN;
  items.forEach((it, i) => {
    const cellW = widths[i] + pad;
    const cx = x + Math.round(cellW / 2);
    drawTextCentered("serif|5", cx, 150, it.num, RED);
    drawTextCentered("sansb|1", cx, 162, it.label, NAVY);
    if (i + 1 < items.length) vline(x + cellW, 118, 44, CREAM_LINE);
    x += cellW;
  });
}

function drawTabs(): void {
  const tabs: Array<{ label: string; count: number }> = [
    { label: "EUROPE", count: 8 },
    { label: "MIDDLE EAST", count: 2 },
    { label: "AFRICA", count: 3 },
    { label: "ASIA-PACIFIC", count: 5 },
    { label: "AMERICAS", count: 3 },
    { label: "GLOBAL", count: 4 },
  ];
  const gap = 6;
  const tabW = 161;
  let x = 14;
  for (const t of tabs) {
    rect(x, 170, tabW, 22, REGION_COLORS[t.label]);
    drawTextCentered("sansb|1", x + Math.round(tabW / 2), 185, t.label + " " + t.count, WHITE);
    x += tabW + gap;
  }
}

function drawHeroLead(): void {
  const y = 196;
  const h = 168;
  drawCop31(MARGIN, y, 330, h);
  const tx = 354;
  const tw = 1012 - tx;
  drawText("sansb|2", tx, 216, "1 • ANTALYA, TURKIYE • CLIMATE", RED);
  const tagW = measure("sansb|1", "CONFIRMED") + 12;
  drawTag(1012 - tagW, 204, "CONFIRMED", TAG_COLORS.CONFIRMED);
  drawText("serif|5", tx, 256, "COP31 ENDS WITH", NAVY);
  drawText("serif|5", tx, 298, "NO DEAL", NAVY);
  const bodyLines = drawWrapped(
    "serifr|1",
    tx,
    314,
    14,
    "THE EU, PANAMA AND ABOUT 130 PARTIES REJECTED A FINAL TEXT WITH NO FOSSIL FUELS. TALKS RAN NEARLY TWO DAYS PAST THEIR CLOSE.",
    tw,
    3,
    INK
  );
  const nuanceY = 314 + bodyLines * 14 + 6;
  drawText("sansb|1", tx, nuanceY, "FIRST COP COLLAPSE SINCE 2009. PLUS: 90 NATIONS BACK ELECTRIFICATION PLEDGE.", RED);
  drawText("sans|1", tx, nuanceY + 14, "AL JAZEERA • THE GUARDIAN", GREY);
}

function drawHeroSecondary(
  hx: number,
  kicker: string,
  tag: keyof typeof TAG_COLORS,
  headline: string,
  body: string,
  source: string,
  art: (x: number, y: number, w: number, h: number) => void
): void {
  const y = 368;
  const h = 142;
  art(hx, y, 150, h);
  // Status tag sits on the illustration (as in the winning concept), so the
  // kicker line can never collide with it.
  const tagW = measure("sansb|1", tag) + 12;
  drawTag(hx + 150 - tagW - 4, y + 4, tag, TAG_COLORS[tag]);
  const tx = hx + 162;
  const tw = hx + 496 - tx - 4;
  drawText("sansb|2", tx, 384, kicker, RED);
  const headLines = drawWrapped("serif|3", tx, 408, 25, headline, tw, 3, NAVY);
  const bodyY = 408 + (headLines - 1) * 25 + 20;
  const bodyLines = drawWrapped("serifr|1", tx, bodyY, 13, body, tw, 2, INK);
  drawText("sans|1", tx, bodyY + bodyLines * 13 + 4, source, GREY);
}

function drawModuleCell(x: number, y: number, w: number, h: number, region: string, stories: ModuleStory[]): void {
  rect(x, y, w, 20, REGION_COLORS[region]);
  drawText("sansb|1", x + 8, y + 14, region, WHITE);
  // Each story gets a 48px slot. The headline (up to 2 lines) and the one-line
  // body are vertically centered in the slot so 1-line and 2-line headlines
  // never collide with the next story.
  let sy = y + 20;
  for (const s of stories) {
    const hx = x + 18;
    const hw = w - 22;
    const headLines = wrapText("sansb|2", s.headline, hw);
    const blockH = (headLines.length - 1) * 16 + 14 + 13;
    const top = sy + Math.round((48 - blockH) / 2);
    filledCircle(x + 7, top + 8, 4, TAG_COLORS[s.tag]);
    headLines.slice(0, 2).forEach((ln, i) => drawText("sansb|2", hx, top + 14 + i * 16, ln, NAVY));
    drawText("serifr|1", hx, top + 14 + (headLines.length - 1) * 16 + 13, s.body, INK);
    sy += 48;
  }
}

function drawModulesRow(rowY: number, cells: Array<{ region: string; stories: ModuleStory[] }>): void {
  const colW = 328;
  const xs = [MARGIN, MARGIN + colW + 8, MARGIN + 2 * (colW + 8)];
  cells.forEach((cell, i) => {
    if (cell.region === "MIDDLE EAST") {
      // One story plus the numbered mini-map (the distinctive accent).
      const x = xs[i];
      rect(x, rowY, colW, 20, REGION_COLORS[cell.region]);
      drawText("sansb|1", x + 8, rowY + 14, cell.region, WHITE);
      const s = cell.stories[0];
      filledCircle(x + 7, rowY + 32, 4, TAG_COLORS[s.tag]);
      const gazaLines = wrapText("sansb|2", s.headline, colW - 22);
      gazaLines.slice(0, 2).forEach((ln, i) => drawText("sansb|2", x + 18, rowY + 36 + i * 16, ln, NAVY));
      drawText("serifr|1", x + 18, rowY + 36 + (gazaLines.length - 1) * 16 + 13, s.body, INK);
      drawText("sansb|1", x + 4, rowY + 82, "WHERE THE DAY HAPPENED", NAVY);
      drawMiniMap(x + 4, rowY + 88, colW - 8, 72);
      return;
    }
    drawModuleCell(xs[i], rowY, colW, 164, cell.region, cell.stories);
  });
}

function drawAlsoOn(): void {
  const y = 850;
  drawText("sansb|2", MARGIN, y + 18, "ALSO ON MONDAY 23 NOVEMBER", NAVY);
  drawTextRight("sansb|1", 1012, y + 18, "6 MORE STORIES", GREY);
  hline(MARGIN, y + 24, CONTENT_W, CREAM_LINE);
  const colW = 496;
  ALSO_ON.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = MARGIN + col * (colW + 8);
    const baseline = y + 40 + row * 18;
    drawText("sans|1", cx, baseline, item.n + " " + item.text, INK);
    drawTextRight("sansb|1", cx + colW, baseline, item.tag, TAG_COLORS[item.tag]);
  });
}

function drawUtcStrip(): void {
  const y = 930;
  rect(MARGIN, y, CONTENT_W, 20, NAVY);
  drawText("sansb|1", MARGIN + 10, y + 15, "THE DAY IN UTC", [240, 200, 90]);
  drawTextCentered(
    "sans|1",
    600,
    y + 15,
    "OVERNIGHT: DYMER STRIKE • MORNING: COP31 COLLAPSE • MIDDAY: INDONESIA FIRE CONFIRMED • EVENING: S AND P 500 +5%",
    WHITE
  );
}

function drawDateCheck(): void {
  const y = 952;
  const text =
    "EVERY STORY HERE HAPPENED OR WAS FIRST REPORTED ON MONDAY 23 NOVEMBER 2026 (UTC). LEFT OUT: NIKKEI -5.06% WAS FRIDAY. TOKYO CLOSED MONDAY.";
  const lines = wrapText("sans|1", text, CONTENT_W - 108);
  const firstBaseline = y + Math.round((30 - lines.length * 13) / 2) + 10;
  rect(MARGIN, y, CONTENT_W, 2, RED);
  rect(MARGIN, y + 28, CONTENT_W, 2, RED);
  rect(MARGIN, y, 2, 30, RED);
  rect(MARGIN + CONTENT_W - 2, y, 2, 30, RED);
  drawText("sansb|1", MARGIN + 8, firstBaseline, "DATE CHECK", RED);
  lines.forEach((ln, i) => drawText("sans|1", MARGIN + 96, firstBaseline + i * 13, ln, INK));
}

function drawLegend(): void {
  const y = 984;
  let x = MARGIN;
  const labelW = measure("sansb|1", "HOW TO READ THE TAGS:");
  drawText("sansb|1", x, y + 10, "HOW TO READ THE TAGS:", NAVY);
  x += labelW + 8;
  const parts: Array<{ tag: string; desc: string }> = [
    { tag: "CONFIRMED", desc: "OFFICIAL / 2+ OUTLETS" },
    { tag: "CLAIM", desc: "ONE SIDE'S CLAIM" },
    { tag: "REPORTED", desc: "ONE SOURCE / WITNESSES" },
    { tag: "ONGOING", desc: "STILL DEVELOPING" },
  ];
  for (const p of parts) {
    const w = drawTag(x, y, p.tag, TAG_COLORS[p.tag], 13);
    x += w + 5;
    drawText("sans|1", x, y + 10, p.desc, INK);
    x += measure("sans|1", p.desc) + 12;
  }
}

function drawSourcesAndFooter(): void {
  drawText(
    "sans|1",
    MARGIN,
    1008,
    "SOURCES: REUTERS, AP, AL JAZEERA, THE GUARDIAN, ONE TURN, DAILY BRIEF, IFA, BASISPOINTINSIGHT, NVIDIA. SCENES ARE DRAWN ILLUSTRATIONS, NOT PHOTOGRAPHS.",
    GREY
  );
  rect(0, 1014, W, 10, NAVY);
  drawText("sansb|1", MARGIN, 1022, "THE WORLD IN ONE DAY", WHITE);
  drawTextRight("sansb|1", 1012, 1022, "MONDAY 23 NOVEMBER 2026 • ONE PAGE", WHITE);
}

// ---------------------------------------------------------------- main
function main(): void {
  // Self-check: the claimed story count must match the stories drawn.
  const moduleCount = MODULES.reduce((a, m) => a + m.stories.length, 0);
  const totalStories = 3 + moduleCount + ALSO_ON.length;
  const tabTotal = 8 + 2 + 3 + 5 + 3 + 4;
  if (totalStories !== 25 || tabTotal !== 25 || totalStories !== tabTotal) {
    throw new Error("story count mismatch: total=" + totalStories + " tabs=" + tabTotal);
  }

  fillAll(PAPER);
  drawMasthead();
  drawDateAndSubhead();
  drawNumberStrip();
  rect(MARGIN, 166, CONTENT_W, 2, NAVY);
  drawTabs();
  drawHeroLead();
  drawHeroSecondary(
    MARGIN,
    "2 • BENGHAZI, LIBYA",
    "CLAIM",
    "UKRAINE SAYS IT SANK RUSSIAN CORVETTE",
    "ZELENSKY SAID DRONES SANK THE MERKURY. UN CALLED FOR INQUIRY.",
    "AP",
    drawMerkury
  );
  drawHeroSecondary(
    516,
    "3 • DYMER, KYIV REGION",
    "CONFIRMED",
    "DYMER STRIKE KILLS AT LEAST 11",
    "RUSSIAN STRIKE PARTLY COLLAPSED A BLOCK. BOY SAVED AFTER 14 HOURS.",
    "REUTERS",
    drawDymer
  );
  drawModulesRow(514, [MODULES[0], MODULES[1], MODULES[2]]);
  drawModulesRow(682, [MODULES[3], MODULES[4], MODULES[5]]);
  drawAlsoOn();
  drawUtcStrip();
  drawDateCheck();
  drawLegend();
  drawSourcesAndFooter();

  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch {
    // The output directory already exists in the sandbox; ignore.
  }
  const png = encodePng();
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
  console.log("stories=" + totalStories + " png_bytes=" + png.length);
}

main();
