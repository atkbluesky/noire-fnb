/**
 * M4 · Ngân sách Q4/2026 — đọc file phân bổ digital Q4 → src/data/budget_q4.json
 *
 *   node scripts/build-budget-q4.mjs
 *
 * Nguồn: L0_input/03_MARKETING/04_Ngan_Sach/NOIRE_Q4_Digital_Monthly_Allocation_*.xlsx
 *   01_TongHop_ChiPhi_Q4   brand × hạng mục (Digital, KOC & PR, FOC, Decoration, POSM, Activation, Dự phòng)
 *   06_Monthly_ByOutlet    Digital theo cửa hàng × tháng × kênh (Meta Promo / Google)
 *   07_Monthly_ByBrand     Digital theo brand × tháng, gồm Meta Booking Tiệc (cấp brand, không chia cửa hàng)
 *
 * Hạng mục ngoài Digital CHỈ có số cả quý theo brand — file nguồn không chia tháng, không chia cửa hàng.
 * File json được commit (L0_input không lên GitHub); không có file nguồn thì giữ bản cũ.
 *
 * THỰC CHI ngoài Digital: NOIRE_Q4_ThucChi_*.xlsx cùng thư mục, sheet `ThucChi`
 *   Tháng (2026-10) | Brand | Hạng mục | Số tiền | Ghi chú
 * Thực chi Digital KHÔNG nhập ở đây — M4 lấy thẳng từ /api/ads/performance (Meta + Google).
 *   node scripts/build-budget-q4.mjs --template   tạo file nhập thực chi trống (không ghi đè file đã có)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'L0_input', '03_MARKETING', '04_Ngan_Sach');
const OUT = path.join(ROOT, 'src', 'data', 'budget_q4.json');
const MONTHS = ['2026-10', '2026-11', '2026-12'];
const MON_KEY = { 'oct-26': '2026-10', 'nov-26': '2026-11', 'dec-26': '2026-12' };

const ITEMS_NON_DIGITAL = ['KOC & PR', 'FOC Production', 'Decoration Xmas', 'POSM & Merchandise', 'Activation', 'Dự phòng'];

if (process.argv.includes('--template')) {
  const out = path.join(DIR, 'NOIRE_Q4_ThucChi_2026.xlsx');
  if (fs.existsSync(out)) { console.log(`[budget-q4] đã có ${path.basename(out)} — không ghi đè`); process.exit(0); }
  const t = new ExcelJS.Workbook();
  const ws = t.addWorksheet('ThucChi');
  ws.columns = [
    { header: 'Tháng', key: 'm', width: 10 }, { header: 'Brand', key: 'b', width: 8 },
    { header: 'Hạng mục', key: 'i', width: 22 }, { header: 'Số tiền', key: 'v', width: 16 }, { header: 'Ghi chú', key: 'n', width: 48 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getColumn('v').numFmt = '#,##0';
  for (let r = 2; r <= 300; r++) {
    ws.getCell(r, 1).dataValidation = { type: 'list', allowBlank: true, formulae: ['"2026-10,2026-11,2026-12"'] };
    ws.getCell(r, 2).dataValidation = { type: 'list', allowBlank: true, formulae: ['"NCB,NDC,NJFB"'] };
    ws.getCell(r, 3).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${ITEMS_NON_DIGITAL.join(',')}"`] };
  }
  const g = t.addWorksheet('HuongDan');
  [
    'Mỗi dòng = một khoản đã chi (hoặc gộp theo tháng × brand × hạng mục).',
    'Tháng nhập dạng 2026-10 / 2026-11 / 2026-12. Brand: NCB, NDC, NJFB. Hạng mục chọn từ danh sách.',
    'KHÔNG nhập Digital Ads — thực chi Meta/Google lấy tự động từ API.',
    'Lưu file xong chạy: npm run build:budget-q4',
  ].forEach((x, i) => { g.getCell(i + 1, 1).value = x; });
  g.getColumn(1).width = 100;
  await t.xlsx.writeFile(out);
  console.log(`[budget-q4] tạo ${path.basename(out)}`);
  process.exit(0);
}

const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter((f) => /^NOIRE_Q4_Digital.*\.xlsx$/i.test(f) && !f.startsWith('~$'))
  : [];
if (!files.length) { console.log('[budget-q4] không thấy file Q4 — giữ nguyên budget_q4.json'); process.exit(0); }
files.sort((a, b) => fs.statSync(path.join(DIR, b)).mtimeMs - fs.statSync(path.join(DIR, a)).mtimeMs);
const file = files[0];

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.join(DIR, file));

const val = (c) => { const v = c?.value; return v && typeof v === 'object' && 'result' in v ? v.result : v; };
const num = (c) => { const v = Number(val(c)); return Number.isFinite(v) ? Math.round(v) : 0; };
const str = (c) => String(val(c) ?? '').trim();
const sheet = (name) => { const ws = wb.getWorksheet(name); if (!ws) throw new Error(`thiếu sheet ${name}`); return ws; };
const BRANDS = ['NCB', 'NDC', 'NJFB'];

/* 01 — brand × hạng mục: tìm dòng tiêu đề có "Brand" + "Digital Ads" */
const s1 = sheet('01_TongHop_ChiPhi_Q4');
let hr = 0;
s1.eachRow((row, i) => { if (!hr && str(row.getCell(1)) === 'Brand' && /digital ads/i.test(str(row.getCell(2)))) hr = i; });
if (!hr) throw new Error('01: không thấy dòng tiêu đề hạng mục');
const heads = [];
for (let c = 2; c < 20; c++) { const h = str(s1.getRow(hr).getCell(c)); if (!h || /^ghi ch/i.test(h)) break; heads.push({ c, h }); }
const totalCol = heads.find((x) => /^tổng/i.test(x.h));
const itemCols = heads.filter((x) => x !== totalCol);
const brands = [];
for (let r = hr + 1; r <= hr + 6; r++) {
  const b = str(s1.getCell(r, 1));
  if (!BRANDS.includes(b)) continue;
  const items = {};
  itemCols.forEach((x) => { items[x.h] = num(s1.getCell(r, x.c)); });
  brands.push({ brand: b, items, total: num(s1.getCell(r, totalCol.c)) });
}
/* Mức "MKT Budget 2%" — khối riêng bên dưới, 3 khối cạnh nhau (A/B, D/E, G/H) */
const cap = {};
s1.eachRow((row) => {
  [[1, 2], [4, 5], [7, 8]].forEach(([k, v], i) => {
    if (/^MKT Budget 2%/i.test(str(row.getCell(k)))) cap[BRANDS[i]] = num(row.getCell(v));
  });
});
brands.forEach((b) => { b.cap2pct = cap[b.brand] ?? null; });

/* 06 — cửa hàng × tháng × kênh */
const s6 = sheet('06_Monthly_ByOutlet');
const stores = [];
s6.eachRow((row) => {
  const b = str(row.getCell(1));
  if (!BRANDS.includes(b)) return;
  const m = {};
  MONTHS.forEach((mo, i) => { m[mo] = { meta: num(row.getCell(4 + i * 3)), google: num(row.getCell(5 + i * 3)) }; });
  stores.push({ brand: b, store: str(row.getCell(2)), base: num(row.getCell(3)), months: m });
});

/* 07 — brand × tháng: Meta Promo / Google / Booking Tiệc */
const s7 = sheet('07_Monthly_ByBrand');
const brandMonth = [];
s7.eachRow((row) => {
  const b = str(row.getCell(1)); const mo = MON_KEY[str(row.getCell(2)).toLowerCase()];
  if (!BRANDS.includes(b) || !mo) return;
  brandMonth.push({ brand: b, month: mo, meta: num(row.getCell(3)), google: num(row.getCell(4)), booking: num(row.getCell(6)), focus: str(row.getCell(11)) });
});

/* Kiểm tra chéo — sai là dừng, không ghi file */
const errs = [];
for (const b of brands) {
  const sum = Object.values(b.items).reduce((a, x) => a + x, 0);
  if (sum !== b.total) errs.push(`${b.brand}: Σ hạng mục ${sum} ≠ tổng ${b.total}`);
  const dg = b.items['Digital Ads'] ?? 0;
  const bm = brandMonth.filter((x) => x.brand === b.brand);
  const dg2 = bm.reduce((a, x) => a + x.meta + x.google + x.booking, 0);
  if (Math.abs(dg - dg2) > 3) errs.push(`${b.brand}: Digital ${dg} ≠ Σ brand×tháng ${dg2}`);
  const st = stores.filter((x) => x.brand === b.brand).reduce((a, x) => a + MONTHS.reduce((s, m) => s + x.months[m].meta + x.months[m].google, 0), 0);
  const pool = bm.reduce((a, x) => a + x.meta + x.google, 0);
  if (Math.abs(st - pool) > 3) errs.push(`${b.brand}: Σ cửa hàng ${st} ≠ store pool ${pool}`);
}
if (brands.length !== 3 || stores.length !== 7 || brandMonth.length !== 9) errs.push(`đếm sai: ${brands.length} brand · ${stores.length} cửa hàng · ${brandMonth.length} dòng brand×tháng`);
if (errs.length) { console.error('[budget-q4] LỆCH SỐ:\n  ' + errs.join('\n  ')); process.exit(1); }

/* Thực chi ngoài Digital (nhập tay) */
const actual = []; const warn = [];
const af = fs.readdirSync(DIR).filter((f) => /^NOIRE_Q4_ThucChi.*\.xlsx$/i.test(f) && !f.startsWith('~$'))
  .sort((a, b) => fs.statSync(path.join(DIR, b)).mtimeMs - fs.statSync(path.join(DIR, a)).mtimeMs)[0];
if (af) {
  const aw = new ExcelJS.Workbook();
  await aw.xlsx.readFile(path.join(DIR, af));
  const ws = aw.getWorksheet('ThucChi');
  if (!ws) errs.push(`${af}: thiếu sheet ThucChi`);
  ws?.eachRow((row, i) => {
    if (i === 1) return;
    let m = val(row.getCell(1));
    if (m instanceof Date) m = m.toISOString().slice(0, 7);
    m = String(m ?? '').trim(); const b = str(row.getCell(2)); const it = str(row.getCell(3)); const v = num(row.getCell(4));
    if (!m && !b && !it && !v) return;
    if (!MONTHS.includes(m) || !BRANDS.includes(b) || !ITEMS_NON_DIGITAL.includes(it)) { warn.push(`${af} dòng ${i}: bỏ qua (tháng/brand/hạng mục không hợp lệ: ${m} · ${b} · ${it})`); return; }
    actual.push({ month: m, brand: b, item: it, amount: v, note: str(row.getCell(5)) });
  });
}
if (errs.length) { console.error('[budget-q4] LỖI:\n  ' + errs.join('\n  ')); process.exit(1); }
warn.forEach((w) => console.warn('[budget-q4] ⚠ ' + w));

fs.writeFileSync(OUT, JSON.stringify({ file, actualFile: af ?? null, quarter: '2026-Q4', months: MONTHS, items: itemCols.map((x) => x.h), brands, stores, brandMonth, actual }, null, 1));
console.log(`[budget-q4] ${file}${af ? ` + ${af} (${actual.length} dòng thực chi)` : ' · chưa có file thực chi'} → ${brands.length} brand · ${stores.length} cửa hàng · ${brandMonth.length} dòng brand×tháng · tổng ${brands.reduce((a, b) => a + b.total, 0).toLocaleString('en')} đ`);
