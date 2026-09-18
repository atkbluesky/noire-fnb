/**
 * NOIRE ANALYTICS HUB — LOADER TẦNG L1-PROCESSED
 * ==============================================
 * Đọc mọi workbook trong  data_input/*.xlsx  →  sinh  src/data/data.json + data_mkt.json
 *
 * Chạy tự động trước `npm run dev` và `npm run build` (npm lifecycle predev/prebuild),
 * nên Vercel chỉ cần kéo repo từ GitHub là có số mới — không cần Python, không cần commit JSON.
 *
 *   npm run build:data          chạy tay
 *   npm run build:data -- --v   in chi tiết từng sheet
 *
 * Hợp đồng dữ liệu: docs/15_PROCESSED_INPUT_CONTRACT.md
 * Nguyên tắc NT2  : công thức chỉ tồn tại ở tầng này, view không được tính lại.
 */
import ExcelJS from 'exceljs';
import { readdir, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN = path.join(ROOT, 'data_input');
const OUT = path.join(ROOT, 'src', 'data');
const VERBOSE = process.argv.includes('--v');

const log = (...a) => console.log(...a);
const vlog = (...a) => VERBOSE && console.log(...a);

/** Hợp đồng dữ liệu — dùng chung với tools/*.py. Sửa schema thì sửa ở đó, không sửa ở đây. */
const CONTRACT = JSON.parse(readFileSync(path.join(ROOT, 'data_contract.json'), 'utf8'));
const SPEC = CONTRACT.sheets;

/* ════════════════════════════════════════════════════════════════════
   1. ĐỌC WORKBOOK — gộp mọi sheet cùng tên từ mọi file
   ════════════════════════════════════════════════════════════════════ */

/** Ô rỗng của Excel về `null`; chuỗi rỗng cũng là null. `—` khác `0`. */
function cell(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.result !== undefined) return cell(v.result);   // ô công thức
    if (v.text !== undefined) return cell(v.text);       // rich text / hyperlink
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    return null;
  }
  if (typeof v === 'string') {
    const s = v.replace(/​|﻿/g, '').trim();
    return s === '' || s === '—' || s === '-' ? null : s;
  }
  return v;
}

/** Quét đệ quy data_input/ — trả về đường dẫn TƯƠNG ĐỐI, xếp theo alphabet.
 *  Thứ tự này quyết định ai thắng khi trùng khoá: file đọc SAU thắng.
 *  `01_master` < `02_snapshot` < `monthly/…` nên số liệu tháng luôn đè lên bản khai chung. */
async function listWorkbooks(dir, base = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) { out.push(...(await listWorkbooks(path.join(dir, e.name), rel))); continue; }
    if (!e.name.toLowerCase().endsWith('.xlsx') || e.name.startsWith('~$')) continue;
    out.push(rel);
  }
  return out.sort((a, b) => a.localeCompare(b, 'en'));
}

/** `monthly/2026-08.xlsx` · `monthly/2026-08_v2.xlsx` → '2026-08'. Không có thì null. */
const monthFromName = (rel) => (path.basename(rel).match(/(\d{4})-(\d{2})/) || [])[0] ?? null;

async function readWorkbooks() {
  if (!existsSync(IN)) throw new Error(`Không thấy thư mục data_input/ tại ${IN}`);
  const files = await listWorkbooks(IN);
  if (!files.length) throw new Error('data_input/ chưa có file .xlsx nào');

  const tables = {};                            // { sheetName: [row, …] }
  const unknown = new Set();
  const stray = [];                             // dòng lạc tháng — báo ở chốt QA #14

  for (const f of files) {
    const fileMonth = monthFromName(f);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(IN, f));
    let n = 0;
    wb.eachSheet((ws) => {
      const name = ws.name.trim();
      if (name.startsWith('_HƯỚNG DẪN') || name.startsWith('_huong')) return;
      if (!SPEC[name]) unknown.add(name);

      const header = [];
      ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => {
        header[i - 1] = String(cell(c.value) ?? '').trim();
      });
      if (!header.filter(Boolean).length) return;

      const mc = SPEC[name]?.monthCol ?? null;
      const stampable = fileMonth && mc && mc !== 'date';

      const rows = [];
      ws.eachRow({ includeEmpty: false }, (row, idx) => {
        if (idx === 1) return;
        const o = {};
        let any = false;
        header.forEach((h, i) => {
          if (!h) return;
          const v = cell(row.getCell(i + 1).value);
          o[h] = v;
          if (v !== null) any = true;
        });
        if (!any) return;

        // ── Tháng lấy từ TÊN FILE ─────────────────────────────────────────
        // Đây là cơ chế khiến 'mỗi tháng chỉ cần thả một file' chạy được:
        // người nộp không phải gõ lại YYYY-MM vào từng dòng của 20 sheet.
        if (stampable) {
          if (o[mc] === null || o[mc] === undefined) o[mc] = fileMonth;
          else if (String(o[mc]).slice(0, 7) !== fileMonth) {
            stray.push(`${f} :: ${name} :: ${o[mc]}`);
          }
        }
        if (fileMonth && mc === 'date' && o.date && String(o.date).slice(0, 7) !== fileMonth) {
          stray.push(`${f} :: ${name} :: ${o.date}`);
        }
        rows.push(o);
      });
      if (!rows.length) return;
      (tables[name] ||= []).push(...rows);
      n += rows.length;
      vlog(`      ${f} :: ${name.padEnd(22)} ${rows.length} dòng`);
    });
    log(`   ✔ ${f.padEnd(30)} ${n.toLocaleString('vi-VN')} dòng`);
  }

  // ── Khử trùng theo khoá tự nhiên khai ở hợp đồng ────────────────────────
  // Nộp lại một tháng (file _v2) là THAY THẾ đúng những dòng đó, không cộng thêm.
  for (const [name, rows] of Object.entries(tables)) {
    const key = SPEC[name]?.key;
    if (!key?.length) continue;
    const before = rows.length;
    tables[name] = dedupe(rows, key);
    const dropped = before - tables[name].length;
    if (dropped) vlog(`      khử trùng ${name}: ${before} → ${tables[name].length} (−${dropped})`);
  }

  return { tables, unknown: [...unknown], stray, files };
}

/* ════════════════════════════════════════════════════════════════════
   2. TIỆN ÍCH
   ════════════════════════════════════════════════════════════════════ */
const T = (tables, name) => tables[name] ?? [];
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const n0 = (v) => Number(v) || 0;
const sum = (a, f) => a.reduce((s, r) => s + n0(f(r)), 0);
const div = (a, b) => (b ? a / b : null);          // chia 0 trả null, KHÔNG trả 0

function median(arr) {
  const a = arr.filter((x) => x !== null && !Number.isNaN(x)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Sheet `_stats` cho phép ghi đè con số tổng mà bảng đã cắt top-N không suy lại được.
 *  Giá trị dạng JSON (list/object) được giải mã ngược. */
function statsOf(tables) {
  const out = {};
  for (const r of T(tables, '_stats')) {
    const t = r.table, f = r.field;
    if (!t || !f) continue;
    let v = r.value;
    if (typeof v === 'string' && /^[[{]/.test(v)) {
      try { v = JSON.parse(v); } catch { /* để nguyên chuỗi */ }
    }
    (out[t] ||= {})[f] = v;
  }
  return out;
}
const applyStats = (obj, over) => (over ? { ...obj, ...over } : obj);

/** Khử trùng theo khoá tự nhiên — dòng sau thắng (file mới nộp đè bản cũ). */
function dedupe(rows, keys) {
  const m = new Map();
  for (const r of rows) m.set(keys.map((k) => r[k]).join(''), r);
  return [...m.values()];
}

const daysInMonth = (m) => {
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, mm, 0).getDate();
};

/* ════════════════════════════════════════════════════════════════════
   3. KIỂM TRA SCHEMA — thay cho 9 bẫy của lane dữ liệu thô
   ════════════════════════════════════════════════════════════════════ */
const SCHEMA = {
  dim_store:   { req: ['code', 'brand', 'tier', 'name'], must: true },
  store_month: { req: ['month', 'store', 'net', 'guest', 'tc'], must: true },
  daily:       { req: ['date', 'store', 'net'], must: false },
  product:     { req: ['ma', 'name', 'qty', 'rev'], must: false },
  daypart:     { req: ['month', 'daypart', 'net', 'tc'], must: false },
  heat:        { req: ['dow', 'hour_in', 'net'], must: false },
  channel:     { req: ['month', 'channel', 'net'], must: false },
  nature:      { req: ['month', 'nature', 'brand', 'rev'], must: false },
  identify:    { req: ['month', 'bills', 'id_bills'], must: false },
  recon:       { req: ['month', 'store', 'net'], must: false },
  dim_target:  { req: ['month', 'store', 'target'], must: false },
};

/* Bản chất CTKM đọc từ hợp đồng, KHÔNG gõ lại ở đây. Trước đây danh sách này là
   một hằng cứng và nó đã lệch với lane Python thật: thêm nhãn CARE ở Python thì
   loader vẫn báo "nhãn lạ" cho tới khi có người nhớ ra phải sửa cả file này. */
const NATURE_META = CONTRACT.$promo_nature.labels;
const NATURES = new Set(NATURE_META.map((n) => n.code));
const NATURE_RULES = CONTRACT.$promo_nature.rules.map((r) => ({
  nature: r.nature,
  re: r.re.map((x) => new RegExp(x)),
}));

/** Chuan hoa ten de so khop — phai TRUNG KHOP monthly_lib.norm() ben Python. */
function normName(v) {
  return String(v ?? '')
    .normalize('NFKC')
    .replace(/[​﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Ten CTKM -> ban chat. Cung bang luat, cung thu tu voi lane Python.
 *
 *  Vi sao loader phai tu suy lai thay vi tin cot `nature` co san: sheet
 *  `campaigns` cua 02_snapshot.xlsx la anh chup do lane cu sinh ra, nature trong
 *  do dong cung theo luat CU. Sua luat o hop dong ma van doc cot cu thi bang
 *  Top 25 se hien nhan sai trong khi bieu do ben canh da hien nhan dung. */
function classifyNature(name) {
  const n = normName(name);
  if (!n) return null;
  for (const r of NATURE_RULES) if (r.re.some((x) => x.test(n))) return r.nature;
  return CONTRACT.$promo_nature.default;
}
const TIERS = new Set(['flagship', 'core', 'satellite', 'popup']);

function validate(tables, stores, over, scan = {}) {
  const qa = [];
  const add = (no, name, ok, detail) => qa.push({ no, name, ok: !!ok, detail });

  // ❶ sheet bắt buộc + cột bắt buộc
  const missing = [];
  for (const [name, s] of Object.entries(SCHEMA)) {
    const rows = T(tables, name);
    if (!rows.length) { if (s.must) missing.push(`${name} (thiếu sheet)`); continue; }
    const have = new Set(Object.keys(rows[0]));
    const lack = s.req.filter((c) => !have.has(c));
    if (lack.length) missing.push(`${name}: thiếu cột ${lack.join(', ')}`);
  }
  add(1, 'Đủ sheet và cột bắt buộc', missing.length === 0,
      missing.length ? missing.join(' · ') : `${Object.keys(tables).length} sheet hợp lệ`);

  // ❷ mọi store trong số liệu phải có trong dim_store
  const known = new Set(Object.keys(stores));
  const unk = new Set();
  for (const name of ['store_month', 'daily', 'zone', 'staff', 'recon', 'dwell', 'dim_target']) {
    for (const r of T(tables, name)) if (r.store && !known.has(r.store)) unk.add(r.store);
  }
  add(2, 'Mọi cửa hàng khớp dim_store', unk.size === 0,
      unk.size ? `chưa khai báo: ${[...unk].join(', ')}` : `${known.size} cửa hàng`);

  // ❸ tier hợp lệ
  const badTier = Object.values(stores).filter((s) => !TIERS.has(s.tier)).map((s) => s.code);
  add(3, 'tier hợp lệ (flagship/core/satellite/popup)', badTier.length === 0,
      badTier.length ? badTier.join(', ') : 'hợp lệ');

  // ❹ không trùng khoá month × store
  const sm = T(tables, 'store_month');
  const seen = new Map();
  const dup = [];
  for (const r of sm) {
    const k = `${r.month}|${r.store}`;
    if (seen.has(k)) dup.push(k); else seen.set(k, 1);
  }
  add(4, 'Không trùng khoá month × store', dup.length === 0,
      dup.length ? `${dup.length} khoá trùng — bản sau ghi đè` : `${sm.length} dòng duy nhất`);

  // ❺ net > 0 và guest/tc hợp lý
  const bad = sm.filter((r) => n0(r.net) <= 0 || n0(r.guest) < 0 || n0(r.tc) < 0);
  add(5, 'Giá trị doanh thu hợp lệ', bad.length === 0,
      bad.length ? `${bad.length} dòng net ≤ 0` : 'không có dòng bất thường');

  // ❻ chuỗi tháng liền mạch theo từng cửa hàng
  const byStore = {};
  for (const r of sm) (byStore[r.store] ||= []).push(r.month);
  const gaps = [];
  for (const [st, ms] of Object.entries(byStore)) {
    if (stores[st]?.tier === 'popup') continue;         // store đã đóng
    const s = [...new Set(ms)].sort();
    const idx = (m) => { const [y, mm] = m.split('-').map(Number); return y * 12 + mm; };
    for (let i = idx(s[0]); i <= idx(s.at(-1)); i++) {
      const y = Math.floor((i - 1) / 12), mm = ((i - 1) % 12) + 1;
      const m = `${y}-${String(mm).padStart(2, '0')}`;
      if (!s.includes(m)) gaps.push(`${st}:${m}`);
    }
  }
  add(6, 'Không có tháng thiếu trong chuỗi', gaps.length === 0,
      gaps.length ? gaps.slice(0, 8).join(' · ') : 'liền mạch');

  // ❼ đối soát rollup ↔ báo cáo tháng (bỏ tháng chưa trọn kỳ)
  const cov = Object.fromEntries(T(tables, 'coverage').map((r) => [r.month, r]));
  const rec = T(tables, 'recon').filter((r) => {
    const c = cov[r.month];
    return !c || n0(c.days_data) >= daysInMonth(r.month) - 1;
  });
  const off = rec.filter((r) => {
    const d = div(n0(r.net_bill) - n0(r.net), n0(r.net));
    return d !== null && Math.abs(d) >= 0.005;
  });
  add(7, 'Rollup khớp báo cáo tháng (<0,5%)', off.length === 0,
      rec.length ? `${rec.length - off.length}/${rec.length} dòng khớp` : 'chưa có sheet recon');

  // ❽ độ phủ giá vốn — ưu tiên số khai ở _stats vì sheet product có thể đã cắt top-N
  const pr = T(tables, 'product');
  const revAll = sum(pr, (r) => r.rev);
  const revCov = sum(pr.filter((r) => num(r.cogs) !== null && n0(r.cogs) > 0), (r) => r.rev);
  const declared = num(over?.meta?.cogs_coverage);
  const covPct = declared ?? div(revCov, revAll) ?? 0;
  add(8, 'Độ phủ giá vốn ≥ 90%', covPct >= 0.9,
      `hiện ${(covPct * 100).toFixed(1)}% doanh thu món` + (declared !== null ? ' (khai ở _stats)' : ''));

  // ❾ nhãn bản chất CTKM hợp lệ
  const badNat = [...new Set(T(tables, 'nature').map((r) => r.nature).filter((x) => x && !NATURES.has(x)))];
  add(9, 'Nhãn bản chất CTKM hợp lệ', badNat.length === 0,
      badNat.length ? `nhãn lạ: ${badNat.join(', ')}` : `${NATURES.size} nhãn chuẩn`);

  /* ⓯ khối POS phụ phải khớp store_month của CÙNG tháng
     Đây là cái bẫy đã bắt được T8/2026: store_month lấy từ file tracking (đủ 31 ngày)
     trong khi daypart/channel còn là bản cũ dựng từ export thiếu ngày. Hai khối
     lệch nhau 49,5% mà không có chốt nào kêu — biểu đồ M3 im lặng vẽ sai một nửa. */
  const netOf = (rows) => {
    const m = {};
    for (const r of rows) m[r.month] = (m[r.month] ?? 0) + n0(r.net);
    return m;
  };
  const smNet = netOf(sm);
  const drift = [];
  for (const [name, rows] of [['daypart', T(tables, 'daypart')], ['channel', T(tables, 'channel')]]) {
    if (!rows.length) continue;
    for (const [m, v] of Object.entries(netOf(rows))) {
      const base = smNet[m];
      if (!base) continue;
      const d = (v - base) / base;
      if (Math.abs(d) > 0.02) drift.push(`${name}·${m}: ${(d * 100).toFixed(1)}%`);
    }
  }
  add(15, 'Khối POS phụ khớp store_month (<2%)', drift.length === 0,
      drift.length ? drift.slice(0, 6).join(' · ') : `${Object.keys(smNet).length} tháng khớp`);

  /* ❿ hợp đồng file: sheet lạ và dòng lạc tháng
     Dòng lạc tháng = dòng nằm trong monthly/2026-08.xlsx nhưng cột month ghi tháng khác.
     Hầu như luôn là copy-paste sót, và nó âm thầm nhân đôi số của tháng bị chép nhầm. */
  const { unknown = [], stray = [] } = scan;
  const ok14 = !unknown.length && !stray.length;
  add(14, 'Hợp đồng file: sheet quen · dòng đúng tháng của file', ok14,
      ok14 ? `${Object.keys(tables).length} sheet khớp data_contract.json`
           : [unknown.length && `sheet chưa khai: ${unknown.join(', ')}`,
              stray.length && `${stray.length} dòng lạc tháng — ${stray.slice(0, 3).join(' · ')}`]
             .filter(Boolean).join(' · '));

  /* ⓰ hai lane phân loại CTKM phải cho cùng kết quả
     Bảng luật nằm ở data_contract.json, nhưng nó được THI HÀNH hai lần: một lần
     bằng Python khi dựng fact_promo_day, một lần bằng JS ngay tại file này. Hai
     engine regex không giống nhau tuyệt đối (`` cạnh ký tự có dấu là ví dụ),
     nên phải có chốt canh. `nature` trong fact là kết quả của Python; ở đây phân
     loại lại `name_pos` bằng JS rồi đối chiếu. Lệch một dòng là báo ngay. */
  const fpd = T(tables, 'fact_promo_day');
  const mismatch = [];
  const seenName = new Set();
  for (const r of fpd) {
    if (!r.name_pos || seenName.has(r.name_pos)) continue;
    seenName.add(r.name_pos);
    const js = classifyNature(r.name_pos);
    if (r.nature && js !== r.nature) mismatch.push(`${r.name_pos}: py=${r.nature} js=${js}`);
  }
  add(16, 'Phân loại CTKM: lane Python ≡ lane JS', mismatch.length === 0,
      mismatch.length ? mismatch.slice(0, 4).join(' · ')
                      : `${seenName.size} tên CTKM cho cùng kết quả`);

  return { qa, covPct };
}

/* ════════════════════════════════════════════════════════════════════
   4. DỰNG data.json  (khối POS)
   ════════════════════════════════════════════════════════════════════ */
function buildHub(tables, over, scan) {
  const stores = {};
  for (const r of T(tables, 'dim_store')) {
    if (!r.code) continue;
    stores[r.code] = {
      code: r.code, brand: r.brand, tier: r.tier,
      name: r.name, open: r.open ? String(r.open).slice(0, 7) : '',
    };
  }

  const { qa, covPct } = validate(tables, stores, over, scan);

  // ---- store_month + chỉ số dẫn xuất (NT2: tính đúng một lần, ở đây) ----
  const store_month = dedupe(T(tables, 'store_month'), ['month', 'store']).map((r) => ({
    month: r.month, store: r.store,
    net: n0(r.net), guest: n0(r.guest), tc: n0(r.tc),
    gross: num(r.gross), disc: num(r.disc), voucher: num(r.voucher),
    ta: div(n0(r.net), n0(r.guest)),
    aov: div(n0(r.net), n0(r.tc)),
    brand: stores[r.store]?.brand ?? null,
    tier: stores[r.store]?.tier ?? null,
  })).sort((a, b) => a.month.localeCompare(b.month) || a.store.localeCompare(b.store));

  const months = [...new Set(store_month.map((r) => r.month))].sort();
  const days = Object.fromEntries(months.map((m) => [m, daysInMonth(m)]));

  // ---- coverage: ưu tiên sheet khai báo, không có thì suy từ daily ----
  const daily = T(tables, 'daily').map((r) => ({
    date: String(r.date).slice(0, 10), store: r.store,
    net: n0(r.net), guest: n0(r.guest), tc: n0(r.tc),
  }));
  const coverage = {};
  for (const r of T(tables, 'coverage')) {
    const dm = n0(r.days_month) || daysInMonth(r.month);
    coverage[r.month] = {
      days_data: n0(r.days_data), days_month: dm,
      first: r.first ?? null, last: r.last ?? null,
      partial: n0(r.days_data) < dm - 1,
    };
  }
  for (const m of months) {
    if (coverage[m]) continue;
    const ds = [...new Set(daily.filter((d) => d.date.startsWith(m)).map((d) => d.date))].sort();
    const dm = days[m];
    coverage[m] = ds.length
      ? { days_data: ds.length, days_month: dm, first: ds[0], last: ds.at(-1), partial: ds.length < dm - 1 }
      : { days_data: dm, days_month: dm, first: null, last: null, partial: false };
  }

  // ---- product + menu engineering (cắt tại TRUNG VỊ của nhóm có giá vốn) ----
  const product = T(tables, 'product').map((r) => {
    const rev = n0(r.rev), cogs = num(r.cogs);
    const has = cogs !== null && cogs > 0;
    return {
      ma: r.ma, name: r.name, cat: r.cat ?? null, grp: r.grp ?? null,
      qty: n0(r.qty), rev, cogs: has ? cogs : 0, has_cogs: has,
      cm: has ? rev - cogs : null,
      cm_pct: has && rev > 0 ? (rev - cogs) / rev : null,
    };
  }).sort((a, b) => b.rev - a.rev);

  // Trung vị cắt ma trận: ưu tiên số khai ở _stats — sheet product có thể đã cắt top-N,
  // tính lại trên tập đã cắt sẽ đẩy trung vị lên và xếp sai hạng món.
  const withCogs = product.filter((p) => p.has_cogs && p.qty > 0);
  const qMed = num(over.menu_median?.qty) ?? median(withCogs.map((p) => p.qty));
  const mMed = num(over.menu_median?.cm_pct) ?? median(withCogs.map((p) => p.cm_pct));
  for (const p of product) {
    if (!p.has_cogs || p.cm_pct === null) { p.mclass = 'Chưa xếp hạng'; continue; }
    const hq = p.qty >= qMed, hm = p.cm_pct >= mMed;
    p.mclass = hq && hm ? 'Star' : hq ? 'Plow-horse' : hm ? 'Puzzle' : 'Dog';
  }

  const px = product.filter((p) => p.cat !== 'NO SERVICE CHARGE');
  const totRev = sum(px, (p) => p.rev);
  const n20 = Math.max(1, Math.round(px.length * 0.2));
  let acc = 0, n80 = 0;
  for (const p of px) { acc += p.rev; n80++; if (acc / totRev >= 0.8) break; }
  const slow = px.filter((p) => p.qty < 10 * months.length);
  const cls = {}, cls_rev = {};
  for (const p of px) { cls[p.mclass] = (cls[p.mclass] ?? 0) + 1; cls_rev[p.mclass] = (cls_rev[p.mclass] ?? 0) + p.rev; }

  const product_stat = applyStats({
    sku: px.length, sku_cogs: px.filter((p) => p.has_cogs).length,
    rev: totRev, rev20: div(sum(px.slice(0, n20), (p) => p.rev), totRev) ?? 0,
    n20, n80, slow: slow.length, slow_rev: div(sum(slow, (p) => p.rev), totRev) ?? 0,
    cls, cls_rev, months: months.length,
  }, over.product_stat);

  // ---- gộp theo loại món / nhóm món ----
  // Ưu tiên sheet khai sẵn (tính trên TOÀN BỘ SKU); không có thì suy từ sheet product.
  const rollup = (key, sheetName) => {
    const declared = T(tables, sheetName);
    if (declared.length) {
      return declared.map((r) => ({ [key]: r[key], qty: n0(r.qty), rev: n0(r.rev) }))
        .sort((a, b) => b.rev - a.rev);
    }
    const m = new Map();
    for (const p of product) {
      const k = p[key] ?? '(không rõ)';
      const o = m.get(k) ?? { [key]: k, qty: 0, rev: 0 };
      o.qty += p.qty; o.rev += p.rev; m.set(k, o);
    }
    return [...m.values()].sort((a, b) => b.rev - a.rev);
  };

  // ---- dwell: dòng không có store là số toàn chuỗi ----
  const dwRows = T(tables, 'dwell');
  const chain = dwRows.find((r) => !r.store);
  const dwell_store = dwRows.filter((r) => r.store)
    .map((r) => ({ store: r.store, dwell: num(r.mean) }))
    .sort((a, b) => (b.dwell ?? 0) - (a.dwell ?? 0));
  const dwell = chain
    ? { n: n0(chain.n), mean: num(chain.mean), median: num(chain.median) }
    : { n: dwell_store.length, mean: median(dwell_store.map((d) => d.dwell)), median: null };

  const identify = T(tables, 'identify').map((r) => ({
    month: r.month, bills: n0(r.bills), id_bills: n0(r.id_bills), items: num(r.items),
    rate: div(n0(r.id_bills), n0(r.bills)) ?? 0,
  })).sort((a, b) => a.month.localeCompare(b.month));
  // Đếm dòng đã xử lý suy từ chính dữ liệu. Bản trước khai cứng ở `_stats`, nên
  // thẻ đếm ở tab D1 đóng băng ở kỳ mà lane cũ chạy lần cuối.
  const rowsBill = sum(identify, (r) => r.bills) || null;
  const rowsItem = identify.some((r) => r.items !== null)
    ? sum(identify, (r) => r.items) : null;

  const repeat = T(tables, 'repeat').map((r) => ({ label: r.label, n: n0(r.n) }));
  const totCust = sum(repeat, (r) => r.n);
  const rep2 = sum(repeat.filter((r) => !/^1 /.test(String(r.label))), (r) => r.n);
  const repeat_stat = applyStats(
    { customers: totCust, repeat: rep2, rate: div(rep2, totCust) ?? 0, max: null },
    over.repeat_stat);

  const D = {
    meta: applyStats({
      built: new Date().toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }),
      months, latest: months.at(-1) ?? null,
      cogs_coverage: Number(covPct.toFixed(4)),
      source: 'data_input/**/*.xlsx (L1-processed)',
      rows_item: rowsItem, rows_bill: rowsBill,
    }, over.meta),
    qa,
    stores,
    core7: Object.values(stores).filter((s) => ['core', 'flagship'].includes(s.tier)).map((s) => s.code),
    days,
    coverage,
    store_month,
    daily: daily.sort((a, b) => a.date.localeCompare(b.date)),
    daypart: T(tables, 'daypart').map((r) => ({
      month: r.month, daypart: r.daypart, net: n0(r.net), tc: n0(r.tc), guest: n0(r.guest),
    })),
    daypart_order: [...new Set(T(tables, 'daypart').map((r) => r.daypart))].filter(Boolean),
    heat: T(tables, 'heat').map((r) => ({
      dow: n0(r.dow), hour_in: n0(r.hour_in), net: n0(r.net), tc: n0(r.tc),
    })),
    channel: T(tables, 'channel').map((r) => ({
      month: r.month, channel: r.channel, net: n0(r.net), tc: n0(r.tc),
    })),
    menu_median: { qty: qMed, cm_pct: mMed },
    product,
    product_stat,
    category: rollup('cat', 'category'),
    group: rollup('grp', 'group').slice(0, 30),
    cogs_cov: T(tables, 'cogs_cov').map((r) => ({
      month: r.month, rev: n0(r.rev), rev_cov: n0(r.rev_cov),
      sku: n0(r.sku), sku_cov: n0(r.sku_cov),
      pct: div(n0(r.rev_cov), n0(r.rev)) ?? 0,
    })).sort((a, b) => a.month.localeCompare(b.month)),
    cogs_flags: T(tables, 'dim_cogs')
      .filter((r) => num(r.pct) !== null)
      .sort((a, b) => n0(b.pct) - n0(a.pct)).slice(0, 12)
      .map((r) => ({ brand: r.brand, ma: r.ma, name: r.name, cogs: n0(r.cogs), pct: n0(r.pct) })),
    bom_stat: applyStats({
      rows: T(tables, 'dim_cogs').length,
      codes: new Set(T(tables, 'dim_cogs').map((r) => r.ma)).size,
      over45: T(tables, 'dim_cogs').filter((r) => n0(r.pct) > 0.45).length,
      loss: T(tables, 'dim_cogs').filter((r) => n0(r.pct) >= 1).length,
      nocost: T(tables, 'dim_cogs').filter((r) => !n0(r.cogs)).length,
    }, over.bom_stat),
    /* Nhãn, màu và THỨ TỰ hiển thị của bản chất CTKM đi kèm dữ liệu, để màn hình
       không phải khai lại lần nữa. Thêm một bản chất = sửa data_contract.json,
       không đụng tới .tsx. */
    nature_meta: NATURE_META,
    /* Doanh thu gắn CTKM theo bản chất — CÙNG ĐỊNH NGHĨA với M7.2 và store_month:
       `rev` = Σ Tổng tiền CẢ hoá đơn gắn tên CTKM (bảng kê hoá đơn, gồm VAT/phí) · `disc` = giảm giá + phiếu GG
       · `bills` = số hoá đơn. Tháng có fact_promo_day dùng số cấp hoá đơn; sheet `nature` (Thành tiền dòng món,
       trước VAT) chỉ còn làm dự phòng cho tháng chưa có bảng kê — hai nền này KHÔNG so được với nhau. */
    nature: (() => {
      const fpd = T(tables, 'fact_promo_day');
      const billMonths = new Set(fpd.map((r) => String(r.date).slice(0, 7)));
      const m = {};
      for (const r of fpd) {
        const month = String(r.date).slice(0, 7);
        const nature = classifyNature(r.name_pos) ?? r.nature;
        const k = `${month}|${nature}|${r.brand}`;
        const x = (m[k] ||= { month, nature, brand: r.brand, rev: 0, disc: 0, bills: 0, basis: 'BILL' });
        x.rev += n0(r.net); x.disc += n0(r.disc) + n0(r.voucher); x.bills += n0(r.bills);
      }
      const legacy = T(tables, 'nature').filter((r) => !billMonths.has(r.month)).map((r) => ({
        month: r.month, nature: r.nature, brand: r.brand, rev: n0(r.rev), disc: n0(r.disc), bills: n0(r.bills), basis: 'ITEM',
      }));
      return [...Object.values(m), ...legacy].sort((a, b) => (a.month + a.nature + a.brand).localeCompare(b.month + b.nature + b.brand));
    })(),
    /* CTKM theo THÁNG × tên × brand — cùng định nghĩa với M7.2: `net` = Σ Tổng tiền CẢ hoá đơn gắn
       tên CTKM (gồm VAT) · `disc` = giảm giá + chiết khấu · `voucher` = phần trả bằng phiếu GG.
       Thay cho `campaigns` (doanh thu chạm theo THÀNH TIỀN dòng món, không lọc được theo tháng). */
    promo_month: Object.values(T(tables, 'fact_promo_day').reduce((m, r) => {
      if (!n0(r.bills)) return m;
      const month = String(r.date).slice(0, 7);
      const k = `${month}|${r.name_pos}|${r.brand}`;
      const x = (m[k] ||= { month, name: r.name_pos, brand: r.brand, nature: classifyNature(r.name_pos) ?? r.nature,
        bills: 0, net: 0, disc: 0, voucher: 0 });
      x.bills += n0(r.bills); x.net += n0(r.net); x.disc += n0(r.disc); x.voucher += n0(r.voucher);
      return m;
    }, {})),
    campaigns: T(tables, 'campaigns').map((r) => ({
      name: r.name, nature: classifyNature(r.name) ?? r.nature, brand: r.brand,
      rev: n0(r.rev), bills: n0(r.bills),
    })).sort((a, b) => b.rev - a.rev),
    staff: T(tables, 'staff').map((r) => ({
      store: r.store, name: r.name, net: n0(r.net), tc: n0(r.tc), guest: n0(r.guest),
      aov: div(n0(r.net), n0(r.tc)),
    })).sort((a, b) => b.net - a.net),
    zone: T(tables, 'zone').map((r) => ({
      store: r.store, zone: r.zone, net: n0(r.net), tc: n0(r.tc),
    })).sort((a, b) => b.net - a.net),
    payment: T(tables, 'payment').map((r) => ({ pttt: r.pttt, net: n0(r.net), tc: n0(r.tc) }))
      .sort((a, b) => b.net - a.net),
    dwell,
    dwell_store,
    identify,
    repeat,
    repeat_stat,
    ...buildBooking(tables),
    target: dedupe(T(tables, 'dim_target'), ['month', 'store'])
      .map((r) => ({ month: r.month, store: r.store, target: n0(r.target) })),
    recon: T(tables, 'recon').map((r) => ({
      month: r.month, store: r.store,
      net: n0(r.net), net_item: num(r.net_item), net_bill: num(r.net_bill),
      tc: num(r.tc), tc_bill: num(r.tc_bill),
      guest: num(r.guest), guest_bill: num(r.guest_bill),
      // Chưa đối soát ≠ lệch 100%: bỏ trống net_bill thì d_bill là null, không phải −1.
      // Bản trước dùng n0() nên tháng chưa chạy bảng kê hiện thành 'lệch −100%'.
      d_bill: num(r.net_bill) === null ? null : div(n0(r.net_bill) - n0(r.net), n0(r.net)),
    })),
  };
  return D;
}

/* ════════════════════════════════════════════════════════════════════
   4b. KHỐI BOOKING TIỆC & SỰ KIỆN  (nuôi màn hình M10)
   ════════════════════════════════════════════════════════════════════

   Ba nguồn, MỘT phễu:
     ads_campaign_detail (funnel = 'booking')  → chi phí · hiển thị · click · hội thoại/lead form
     social_month (code ∈ $booking.ads.pages)   → fanpage chuyên tiệc (NEC): liên hệ, tin nhắn
     booking                                     → lead Sales ghi sổ · chốt · doanh thu

   Grain `booking`: tháng NHẬN LEAD × tháng DIỄN RA × cửa hàng × phân khúc × loại ×
   nguồn × trạng thái. Nối ba nguồn theo THÁNG NHẬN LEAD — tháng chi tiền ads mới sinh
   ra lead đó. Không nối được tới từng khách (sổ Sales không ghi mã hội thoại).

   Mọi luật (chốt là gì · đặt bàn nhỏ · ads nào là booking) ở data_contract.json →
   $booking. ETL đã gắn nhãn `stage` · `seg`; ở đây chỉ dự phòng cho sheet khai tay. */
const BK = CONTRACT.$booking;
const BK_STAGE = new Map(BK.stages.flatMap((s) => s.match.map((m) => [m, s.code])));
const BK_PAGES = new Set(BK.ads.pages.map((x) => x.toUpperCase()));
const stageOf = (status) => BK_STAGE.get(normName(status)) ?? BK.stage_default;

function buildBooking(tables) {
  const booking = T(tables, 'booking').map((r) => ({
    month: r.month, ev_month: r.ev_month ?? null,
    store: r.store ?? null, brand: r.brand ?? null, outlet: r.outlet ?? null,
    seg: r.seg ?? 'event', etype: r.etype ?? null, source: r.source ?? null,
    status: r.status ?? null, stage: r.stage ?? stageOf(r.status),
    lost_reason: r.lost_reason ?? null,
    leads: n0(r.leads), guests: n0(r.guests),
    exp: n0(r.exp), exp_n: num(r.exp_n) ?? (n0(r.exp) > 0 ? n0(r.leads) : 0),
    closed: n0(r.closed), closed_n: num(r.closed_n) ?? (n0(r.closed) > 0 ? n0(r.leads) : 0),
    inq_est: n0(r.inq_est),
  })).filter((r) => r.month);

  const booking_ads = T(tables, 'ads_campaign_detail')
    .filter((r) => r.funnel === 'booking')
    .map((r) => ({
      month: r.month, campaign: r.campaign, page: r.page ?? null, brand: r.brand ?? null,
      rkind: r.rkind ?? BK.result_default,
      spend: n0(r.spend), impr: n0(r.impr), reach: n0(r.reach), clicks: n0(r.clicks), result: n0(r.result),
    }))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)) || b.spend - a.spend);

  const booking_page = dedupe(T(tables, 'social_month'), ['month', 'platform', 'brand', 'page'])
    .filter((r) => BK_PAGES.has(String(r.code ?? '').toUpperCase()))
    .map((r) => ({
      month: r.month, code: String(r.code).toUpperCase(), page: r.page ?? null,
      views: num(r.views), reach: num(r.reach), engage: num(r.engage), clicks: num(r.clicks),
      profile_views: num(r.profile_views), follows: num(r.follows),
      contacts: num(r.contacts), msgs: num(r.msgs),
    }))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));

  const ev = booking.filter((r) => r.seg === 'event');
  const won = ev.filter((r) => r.stage === 'won');
  const leads = sum(ev, (r) => r.leads);

  return {
    booking,
    booking_ads,
    booking_page,
    /* Nhãn, màu, thứ tự đi kèm dữ liệu — màn hình không khai lại. */
    booking_meta: {
      stages: BK.stages.map(({ code, label, color, desc }) => ({ code, label, color, desc })),
      segment: { table_max_guests: BK.segment.table_max_guests, table_types: BK.segment.table_types,
                 labels: BK.segment.labels },
      mkt_sources: BK.mkt_sources,
      result_kinds: BK.result_kinds.map(({ code, label, contact }) => ({ code, label, contact })),
      lost_reasons: [...BK.lost_reasons.map((x) => x.label), BK.lost_default, BK.lost_blank],
      pages: [...BK_PAGES],
    },
    booking_stat: {
      leads,
      won: sum(won, (r) => r.leads),
      win_rate: div(sum(won, (r) => r.leads), leads),
      closed: sum(won, (r) => r.closed),
      table_rows: sum(booking.filter((r) => r.seg === 'table'), (r) => r.leads),
      ads_spend: sum(booking_ads, (r) => r.spend),
      months: [...new Set(booking.map((r) => r.month))].sort(),
    },
  };
}

/* ════════════════════════════════════════════════════════════════════
   5. DỰNG data_mkt.json  (khối marketing)
   ════════════════════════════════════════════════════════════════════ */
function buildMkt(tables, over) {
  const qa = [];
  const add = (no, name, ok, detail) => qa.push({ no, name, ok: !!ok, detail });

  const social = buildSocial(tables, over);
  const AGG = buildAggregator(tables);

  const detail = T(tables, 'ads_campaign_detail');
  const groupBy = (rows, keyFn, agg) => {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (k === null) continue;
      m.set(k, agg(m.get(k), r));
    }
    return [...m.values()];
  };

  const ads_month = T(tables, 'ads_month').map((r) => ({
    month: r.month, spend: n0(r.spend), reach: n0(r.reach), impr: n0(r.impr), n: n0(r.n),
  })).sort((a, b) => String(a.month).localeCompare(String(b.month)));

  const ads_campaign = detail.length
    ? groupBy(detail, (r) => `${r.campaign}|${r.brand}|${r.objective}`,
        (o, r) => ({
          campaign: r.campaign, brand: r.brand, objective: r.objective,
          spend: n0(o?.spend) + n0(r.spend), result: n0(o?.result) + n0(r.result),
          reach: n0(o?.reach) + n0(r.reach),
        }))
        .map((r) => ({ ...r, cpr: div(r.spend, r.result) }))
        .sort((a, b) => b.spend - a.spend)
    : [];

  const totSpend = ads_month.length ? sum(ads_month, (r) => r.spend) : sum(ads_campaign, (r) => r.spend);
  const unknown = div(sum(ads_campaign.filter((r) => r.brand === 'Không xác định'), (r) => r.spend), totSpend) ?? 0;
  add(10, 'Nhận diện brand từ tên chiến dịch', unknown < 0.05,
      `${(unknown * 100).toFixed(1)}% chi tiêu chưa gán được brand`);

  const gads = T(tables, 'ads_google').map((r) => ({
    month: r.month ?? null,
    campaign: r.campaign, store: r.store ?? null, brand: r.brand, status: r.status,
    budget_day: n0(r.budget_day), spend: n0(r.spend), conv: n0(r.conv),
    clicks: n0(r.clicks), impr: n0(r.impr), cpa: div(n0(r.spend), n0(r.conv)),
  })).sort((a, b) => String(a.month).localeCompare(String(b.month)) || b.spend - a.spend);
  const gadsMonths = [...new Set(gads.map((r) => r.month).filter(Boolean))].sort();

  const vj = T(tables, 'voucher_join').map((r) => ({
    m: r.m, n: n0(r.n), hit: n0(r.hit), rate: div(n0(r.hit), n0(r.n)) ?? 0,
  })).sort((a, b) => String(a.m).localeCompare(String(b.m)));
  const vjTot = sum(vj, (r) => r.n), vjHit = sum(vj, (r) => r.hit);
  const joinRate = div(vjHit, vjTot) ?? 0;
  if (vj.length) {
    add(11, `Voucher khớp hoá đơn (${vj[0].m}–${vj.at(-1).m})`, joinRate > 0.9,
        `${vjHit}/${vjTot} lượt khớp = ${(joinRate * 100).toFixed(1)}%`);
  }

  // BẪY: báo cáo Google có xen các dòng cộng dồn 'Tổng số: …' ở cả bảng kênh
  // lẫn bảng cụm từ. Không loại thì đứng đầu bảng xếp hạng là mấy dòng tổng.
  const isTotalRow = (v) => /^tổng số\s*:/i.test(String(v ?? '').trim());
  const kwRows = T(tables, 'gads_kw')
    .filter((r) => !isTotalRow(r.kw))
    .map((r) => ({
      kw: r.kw, clicks: n0(r.clicks), impr: n0(r.impr), spend: n0(r.spend), conv: n0(r.conv),
    }))
    .sort((a, b) => b.clicks - a.clicks);

  const voucher_prog = T(tables, 'voucher_prog').map((r) => ({
    prog: r.prog, brand: r.brand, issued: n0(r.issued), used: n0(r.used),
    rev: n0(r.rev), disc: n0(r.disc), rate: div(n0(r.used), n0(r.issued)) ?? 0,
  })).sort((a, b) => b.issued - a.issued);

  const bRows = (n) => T(tables, n);

  /* Chi phí NGOÀI media (KOL/KOC · POSM & in ấn · sản xuất nội dung · sự kiện).
     Tách khỏi media spend vì Ad Cost Ratio chỉ được tính trên tiền MUA lượt tiếp cận —
     gộp tiền in POSM vào đó là thổi phồng chi phí quảng cáo. */
  const nonmedia = T(tables, 'budget_nonmedia').map((r) => ({
    month: r.month, item: r.item, budget: num(r.budget), actual: num(r.actual),
    use_rate: div(n0(r.actual), n0(r.budget)),
  })).sort((a, b) => String(a.month).localeCompare(String(b.month)) || n0(b.actual) - n0(a.actual));

  const budget = {
    ...applyStats({ total: null, plan: null }, over.budget),
    brand: bRows('budget_brand'), extra: bRows('budget_extra'),
    channel: bRows('budget_channel'), store_ads: bRows('budget_store'),
    nonmedia,
    nonmedia_stat: {
      months: [...new Set(nonmedia.map((r) => r.month))].sort(),
      budget: sum(nonmedia, (r) => r.budget),
      actual: sum(nonmedia, (r) => r.actual),
      use_rate: div(sum(nonmedia, (r) => r.actual), sum(nonmedia, (r) => r.budget)),
    },
  };
  budget.gap = budget.total !== null && budget.plan !== null ? n0(budget.plan) - n0(budget.total) : null;

  const partnerCamp = T(tables, 'partner_camp');
  const partner_month = T(tables, 'partner_month').map((r) => ({
    month: r.month, code: r.code,
    issued: num(r.issued), used: num(r.used), rev: num(r.rev), disc: num(r.disc),
    // Chưa đo lượt dùng ≠ dùng 0 lượt. File eVoucher của đối tác chỉ là danh sách
    // mã ĐÃ PHÁT; hiện '0,0%' là kết luận chương trình thất bại khi chưa có số.
    use_rate: num(r.used) === null ? null : div(n0(r.used), n0(r.issued)),
  })).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const partners = T(tables, 'partners').map((r) => ({
    ...r,
    media: n0(r.media), issued: n0(r.issued), used: n0(r.used),
    rev: n0(r.rev), disc: n0(r.disc),
    use_rate: div(n0(r.used), n0(r.issued)),
  }));

  // Kế hoạch khuyến mãi đọc từ `pre_plan` (tools/campaign.py đọc thẳng file Pre-Analysis S16).
  // Sheet `pre_analytics` trong 01_master chép tay — không dùng nữa, tránh hai nguồn lệch nhau.
  const pre_q3 = T(tables, 'pre_plan').map((r) => ({
    name: r.name, brand: r.brand, kind: r.kind, roi: num(r.roi), nc: n0(r.net_contrib),
  }));
  const neg = pre_q3.filter((r) => r.roi !== null && r.roi < 0);

  const sysRows = T(tables, 'system_tools');
  const system = applyStats({
    tools: sysRows.map((r) => ({
      root: r.root, files: n0(r.files), loc: n0(r.loc),
      dirs: String(r.dirs ?? '').split(' · ').filter(Boolean),
    })),
    dashboards: T(tables, 'system_dashboards'),
    caches: T(tables, 'system_caches'),
    total_py: sum(sysRows, (r) => r.files),
    total_loc: sum(sysRows, (r) => r.loc),
    cache_mb: null, dup_json: {},
  }, over.system);

  qa.push(...social.qa);

  return {
    meta: { built: new Date().toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) },
    qa,
    ads_month,
    ads_brand: T(tables, 'ads_brand').map((r) => ({
      month: r.month, brand: r.brand, spend: n0(r.spend), reach: n0(r.reach),
    })),
    ads_objective: T(tables, 'ads_objective').map((r) => ({
      month: r.month, objective: r.objective, spend: n0(r.spend), result: n0(r.result),
    })),
    ads_campaign,
    ads_stat: applyStats({ spend: totSpend, unknown, campaigns: ads_campaign.length }, over.ads_stat),
    gads,
    gads_month: gadsMonths.map((m) => {
      const rs = gads.filter((r) => r.month === m);
      return {
        month: m, spend: sum(rs, (r) => r.spend), conv: sum(rs, (r) => r.conv),
        clicks: sum(rs, (r) => r.clicks), impr: sum(rs, (r) => r.impr),
        cpa: div(sum(rs, (r) => r.spend), sum(rs, (r) => r.conv)),
      };
    }),
    gads_stat: applyStats({
      // `period` suy từ chính dữ liệu — bản trước khai cứng ở _stats nên đóng băng
      // ở kỳ 01–26/08 và nói dối mỗi lần nộp tháng mới.
      period: gadsMonths.length
        ? (gadsMonths.length === 1 ? gadsMonths[0] : `${gadsMonths[0]} → ${gadsMonths.at(-1)}`)
        : '',
      months: gadsMonths,
      n: new Set(gads.map((r) => r.campaign)).size,
      spend: sum(gads, (r) => r.spend), conv: sum(gads, (r) => r.conv),
      clicks: sum(gads, (r) => r.clicks), impr: sum(gads, (r) => r.impr),
      cpa: div(sum(gads, (r) => r.spend), sum(gads, (r) => r.conv)),
      paused_spend: sum(gads.filter((r) => /tạm dừng|paused/i.test(String(r.status))), (r) => r.spend),
      unmapped: gads.filter((r) => !r.store).map((r) => r.campaign),
    }, over.gads_stat),
    gads_channel: T(tables, 'gads_channel')
      .filter((r) => !isTotalRow(r.channel))
      .map((r) => ({
        channel: r.channel, impr: n0(r.impr), clicks: n0(r.clicks), conv: n0(r.conv), spend: n0(r.spend),
      })).sort((a, b) => b.spend - a.spend),
    gads_kw: kwRows,
    gads_kw_stat: applyStats({
      terms: kwRows.length,
      brand_terms: kwRows.filter((r) => /noire/i.test(String(r.kw))).length,
    }, over.gads_kw_stat),
    budget,
    voucher_prog,
    voucher_month: T(tables, 'voucher_month').map((r) => ({
      m: r.m, brand: r.brand, used: n0(r.used), rev: n0(r.rev), disc: n0(r.disc),
    })),
    voucher_stat: applyStats({
      progs: voucher_prog.length,
      issued: sum(voucher_prog, (r) => r.issued),
      used: sum(voucher_prog, (r) => r.used),
      rate: div(sum(voucher_prog, (r) => r.used), sum(voucher_prog, (r) => r.issued)) ?? 0,
      rev: sum(voucher_prog, (r) => r.rev), disc: sum(voucher_prog, (r) => r.disc),
    }, over.voucher_stat),
    voucher_join: applyStats({
      rate: joinRate, in_window: vjTot, in_matched: vjHit,
      window: vj.length ? [vj[0].m, vj.at(-1).m] : [], by_month: vj,
    }, over.voucher_join),
    oa: T(tables, 'oa').map((r) => ({
      month: r.month, follows: n0(r.follows), msgs: n0(r.msgs), views: n0(r.views),
      menu: n0(r.menu), content: n0(r.content), days: n0(r.days),
    })).sort((a, b) => String(a.month).localeCompare(String(b.month))),
    member_month: T(tables, 'member').map((r) => ({
      month: r.month, member: n0(r.member), oa: n0(r.oa), days: n0(r.days),
    })),
    member_stat: applyStats({
      months_filled: T(tables, 'member').filter((r) => n0(r.member) || n0(r.oa)).length,
      total: sum(T(tables, 'member'), (r) => r.member),
      months_template: null,
    }, over.member_stat),
    crm_target: T(tables, 'crm_target').map((r) => ({
      month: r.month, kpi: r.kpi, target: n0(r.target),
    })),
    partners,
    partner_camp: partnerCamp,
    partner_month,
    aggregator: AGG.rows,
    aggregator_stat: AGG.stat,
    pre_q3,
    pre_stat: applyStats({
      n: pre_q3.length, neg: neg.length,
      neg_nc: sum(neg, (r) => r.nc),
      pos_nc: sum(pre_q3.filter((r) => r.roi !== null && r.roi >= 0), (r) => r.nc),
    }, over.pre_stat),
    system,
    social,
  };
}

/* ════════════════════════════════════════════════════════════════════
   5a. KHỐI AGGREGATOR — nền tảng trung gian  (nuôi màn hình M8)
   ════════════════════════════════════════════════════════════════════

   GrabFood · ShopeeFood · Dining City… bán hộ và giữ lại một phần.
   `sales` là doanh thu GHI NHẬN TRÊN NỀN TẢNG, không phải tiền về túi:
   phải trừ discount và commission mới ra `net_after`. Tỷ lệ nền tảng giữ lại
   (`take_rate`) là con số đáng theo dõi nhất — nó quyết định kênh này lãi hay lỗ.
*/
function buildAggregator(tables) {
  const rows = T(tables, 'aggregator').map((r) => {
    const sales = n0(r.sales);
    // Ô trống ≠ 0. Nếu chưa ai điền discount/commission/ads thì phần nền tảng giữ
    // lại là CHƯA ĐO ĐƯỢC, không phải bằng không — hiện '0,0%' là nói dối rằng
    // kênh đó không mất đồng nào.
    const measured = [r.discount, r.commission, r.ads_spend].some((x) => num(x) !== null);
    const cut = measured ? n0(r.discount) + n0(r.commission) + n0(r.ads_spend) : null;
    return {
      month: r.month, platform: r.platform, brand: r.brand ?? null, store: r.store ?? null,
      sales, orders: n0(r.orders), items: num(r.items), guests: num(r.guests),
      discount: num(r.discount), commission: num(r.commission), ads_spend: num(r.ads_spend),
      note: r.note ?? null,
      aov: div(sales, n0(r.orders)),
      take_rate: cut === null ? null : div(cut, sales),
      net_after: cut === null ? null : sales - cut,
    };
  }).sort((a, b) => String(a.month).localeCompare(String(b.month)) || b.sales - a.sales);

  const months = [...new Set(rows.map((r) => r.month))].sort();
  const sales = sum(rows, (r) => r.sales);
  const anyCut = rows.some((r) => r.take_rate !== null);
  const cut = sum(rows, (r) => r.discount) + sum(rows, (r) => r.commission) + sum(rows, (r) => r.ads_spend);
  return {
    rows,
    stat: {
      months, platforms: [...new Set(rows.map((r) => r.platform))].filter(Boolean),
      sales, orders: sum(rows, (r) => r.orders),
      aov: div(sales, sum(rows, (r) => r.orders)),
      discount: sum(rows, (r) => r.discount),
      commission: sum(rows, (r) => r.commission),
      take_rate: anyCut ? div(cut, sales) : null,
      net_after: anyCut ? sales - cut : null,
      by_month: months.map((m) => {
        const rs = rows.filter((r) => r.month === m);
        return {
          month: m, sales: sum(rs, (r) => r.sales), orders: sum(rs, (r) => r.orders),
          aov: div(sum(rs, (r) => r.sales), sum(rs, (r) => r.orders)),
        };
      }),
      empty: rows.length === 0,
    },
  };
}

/* ════════════════════════════════════════════════════════════════════
   5b. KHỐI SOCIAL — Fanpage & TikTok  (nuôi màn hình M6)
   ════════════════════════════════════════════════════════════════════

   BẪY GỐC CỦA KHỐI NÀY: hai nền tảng KHÔNG đo cùng một thứ.
   Facebook Page Insights đếm "người tiếp cận" (reach — số TÀI KHOẢN duy nhất).
   TikTok đếm "lượt xem video" (views — một tài khoản xem 5 lần là 5 lượt).
   Cộng hai con số này thành một KPI "tổng tiếp cận" là sai về BẢN CHẤT,
   không phải sai số. Loader vì thế không bao giờ cộng chéo nền tảng:
   nó chọn đúng mẫu số cho từng nền tảng và luôn giữ `platform` trong khoá.

   Xem docs/modules/M6_Social_Media.md §2.
*/
const PLATFORMS = new Set(['FACEBOOK', 'TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'ZALO']);

/** Nền tảng nào lấy con số nào làm mẫu số của tỷ lệ tương tác. */
const audienceOf = (r) =>
  r.platform === 'TIKTOK' || r.platform === 'YOUTUBE'
    ? (n0(r.views) || n0(r.reach) || n0(r.impr))
    : (n0(r.reach) || n0(r.impr) || n0(r.views));

/** Tên đơn vị đi kèm con số — để màn hình không tự bịa nhãn. */
const audienceLabel = (p) => (p === 'TIKTOK' || p === 'YOUTUBE' ? 'lượt xem' : 'tài khoản tiếp cận');

function buildSocial(tables, over) {
  const qa = [];
  const add = (no, name, ok, detail) => qa.push({ no, name, ok: !!ok, detail });

  const raw = T(tables, 'social_month');
  if (!raw.length) {
    // Chưa nộp dữ liệu: trả khung rỗng để màn hình hiện "chưa có số" — không dựng số giả.
    return {
      qa: [], month: [], platform_month: [], page: [], post: [], format: [], target: [],
      stat: { months: [], platforms: [], pages: 0, posts: 0, spend: 0, engage: 0,
              net_follow: null, er: null, audience_by_platform: {} },
      empty: true,
    };
  }

  const norm = (v) => String(v ?? '').trim().toUpperCase();

  const month = dedupe(raw, ['month', 'platform', 'brand', 'page']).map((r) => {
    const platform = norm(r.platform);
    // Ô trống ≠ 0: chỉ cộng bốn thành phần khi có ít nhất một ô được đo.
    const detail = [r.likes, r.comments, r.shares, r.saves].some((x) => num(x) !== null)
      ? n0(r.likes) + n0(r.comments) + n0(r.shares) + n0(r.saves)
      : null;
    const engage = num(r.engage) !== null ? n0(r.engage) : detail;
    const row = {
      month: r.month, platform, brand: r.brand ?? 'OTHER', page: r.page ?? null,
      followers: num(r.followers), follows: num(r.follows), unfollows: num(r.unfollows),
      reach: num(r.reach), impr: num(r.impr), views: num(r.views),
      profile_views: num(r.profile_views), clicks: num(r.clicks),
      likes: num(r.likes), comments: num(r.comments), shares: num(r.shares), saves: num(r.saves),
      engage, posts: num(r.posts), spend: num(r.spend), days: num(r.days),
    };
    // ---- chỉ số dẫn xuất (NT2: tính đúng một lần, ở đây) ----
    row.audience = audienceOf(row) || null;
    row.unit = audienceLabel(platform);
    row.net_follow = row.follows !== null || row.unfollows !== null
      ? n0(row.follows) - n0(row.unfollows) : null;
    row.er = div(n0(engage), row.audience);                    // mẫu số ĐÚNG của từng nền tảng
    row.reach_rate = div(n0(row.reach), n0(row.followers));    // chỉ có nghĩa với Facebook
    row.per_post = div(row.audience, n0(row.posts));
    row.cpm = div(n0(row.spend) * 1000, row.audience);         // chỉ có nghĩa khi có chi boost
    return row;
  }).sort((a, b) => String(a.month).localeCompare(String(b.month))
    || a.platform.localeCompare(b.platform) || String(a.brand).localeCompare(String(b.brand)));

  const months = [...new Set(month.map((r) => r.month))].sort();
  const platforms = [...new Set(month.map((r) => r.platform))].sort();

  /* ---- gộp theo THÁNG × NỀN TẢNG — mức duy nhất được phép cộng ----
     Cộng trong cùng một nền tảng là hợp lệ (nhiều page, nhiều brand).
     Cộng chéo nền tảng thì không, nên `platform` luôn nằm trong khoá. */
  const platform_month = [...new Set(month.map((r) => `${r.month}|${r.platform}`))]
    .map((k) => {
      const [m, p] = k.split('|');
      const rs = month.filter((r) => r.month === m && r.platform === p);
      const audience = sum(rs, (r) => r.audience);
      const engage = sum(rs, (r) => r.engage);
      const posts = sum(rs, (r) => r.posts);
      return {
        month: m, platform: p, unit: audienceLabel(p),
        followers: sum(rs, (r) => r.followers),
        net_follow: rs.some((r) => r.net_follow !== null) ? sum(rs, (r) => r.net_follow) : null,
        audience, engage, posts, spend: sum(rs, (r) => r.spend),
        clicks: sum(rs, (r) => r.clicks), profile_views: sum(rs, (r) => r.profile_views),
        er: div(engage, audience), per_post: div(audience, posts),
      };
    }).sort((a, b) => a.month.localeCompare(b.month) || a.platform.localeCompare(b.platform));

  /* ---- danh mục kênh: mỗi (platform × brand × page) là một kênh ---- */
  /* Gom bằng Map giữ nguyên bộ ba, KHÔNG nối chuỗi rồi split ngược:
     tên Fanpage rất hay chứa dấu `|` ("Noire | Bistro") và split sẽ cắt nhầm. */
  const pageKeys = new Map();
  for (const r of month) {
    const t = [r.platform, r.brand, r.page ?? ''];
    pageKeys.set(JSON.stringify(t), t);
  }
  const page = [...pageKeys.values()]
    .map(([platform, brand, pg]) => {
      const rs = month.filter((r) => r.platform === platform && r.brand === brand
        && (r.page ?? '') === pg);
      const last = rs[rs.length - 1];
      const audience = sum(rs, (r) => r.audience);
      const engage = sum(rs, (r) => r.engage);
      return {
        platform, brand, page: pg || null, unit: audienceLabel(platform),
        followers: last?.followers ?? null,
        net_follow: rs.some((r) => r.net_follow !== null) ? sum(rs, (r) => r.net_follow) : null,
        audience, engage, posts: sum(rs, (r) => r.posts), spend: sum(rs, (r) => r.spend),
        clicks: sum(rs, (r) => r.clicks),
        profile_views: sum(rs, (r) => r.profile_views),
        er: div(engage, audience), months: rs.length,
      };
    }).sort((a, b) => b.audience - a.audience);

  /* ---- bài đăng / video ---- */
  const post = T(tables, 'social_post').map((r) => {
    const platform = norm(r.platform);
    const engage = num(r.engage) !== null ? n0(r.engage)
      : n0(r.likes) + n0(r.comments) + n0(r.shares) + n0(r.saves);
    const audience = audienceOf({ platform, reach: r.reach, views: r.views, impr: r.impr }) || null;
    return {
      date: r.date ? String(r.date).slice(0, 10) : null,
      month: r.date ? String(r.date).slice(0, 7) : (r.month ?? null),
      platform, brand: r.brand ?? 'OTHER', page: r.page ?? null,
      format: norm(r.format) || null, title: r.title ?? r.caption ?? null,
      reach: num(r.reach), views: num(r.views), impr: num(r.impr),
      likes: num(r.likes), comments: num(r.comments), shares: num(r.shares), saves: num(r.saves),
      clicks: num(r.clicks), watch_avg: num(r.watch_avg), spend: num(r.spend),
      link: r.link ?? null,
      engage, audience, unit: audienceLabel(platform), er: div(engage, audience),
    };
  }).sort((a, b) => (b.audience ?? 0) - (a.audience ?? 0));

  /* ---- gộp theo ĐỊNH DẠNG: ưu tiên sheet khai sẵn, không có thì suy từ post ---- */
  const declaredFmt = T(tables, 'social_format');
  const format = (declaredFmt.length
    ? declaredFmt.map((r) => {
        const audience = n0(r.reach) || n0(r.views) || n0(r.impr);
        return {
          platform: norm(r.platform), format: norm(r.format), posts: n0(r.posts),
          audience, engage: n0(r.engage), er: div(n0(r.engage), audience),
        };
      })
    : [...new Map(post.filter((p) => p.format)
        .map((p) => [JSON.stringify([p.platform, p.format]), [p.platform, p.format]])).values()]
        .map(([platform, fmt]) => {
          const rs = post.filter((p) => p.platform === platform && p.format === fmt);
          const audience = sum(rs, (r) => r.audience);
          const engage = sum(rs, (r) => r.engage);
          return { platform, format: fmt, posts: rs.length, audience, engage, er: div(engage, audience) };
        })
  ).sort((a, b) => (b.er ?? 0) - (a.er ?? 0));

  const target = T(tables, 'social_target').map((r) => ({
    month: r.month, platform: norm(r.platform) || null, kpi: r.kpi, target: n0(r.target),
  }));

  /* ════ CHỐT QA 12 — khoá và nhãn hợp lệ ════ */
  const badPlatform = [...new Set(month.map((r) => r.platform).filter((p) => !PLATFORMS.has(p)))];
  const seen = new Set(); const dup = [];
  for (const r of raw) {
    const k = JSON.stringify([r.month, norm(r.platform), r.brand, r.page ?? '']);
    if (seen.has(k)) dup.push(`${r.month}·${norm(r.platform)}·${r.brand}`); else seen.add(k);
  }
  const badMonth = [...new Set(month.map((r) => r.month)
    .filter((m) => !/^\d{4}-\d{2}$/.test(String(m))))];
  const ok12 = !badPlatform.length && !dup.length && !badMonth.length;
  add(12, 'Social: khoá month × platform × brand hợp lệ', ok12,
      ok12 ? `${month.length} dòng · ${platforms.length} nền tảng · ${page.length} kênh`
           : [badPlatform.length && `nền tảng lạ: ${badPlatform.join(', ')}`,
              dup.length && `${dup.length} khoá trùng — bản sau ghi đè`,
              badMonth.length && `tháng sai định dạng: ${badMonth.join(', ')}`]
             .filter(Boolean).join(' · '));

  /* ════ CHỐT QA 13 — số liệu tự nó nhất quán ════
     Hai phép thử rẻ nhưng bắt được gần hết lỗi dán nhầm cột của bảng làm tay:
     (a) tương tác không thể nhiều hơn mẫu số tiếp cận;
     (b) chênh lệch follower giữa hai tháng phải khớp net_follow đã khai (±10%). */
  const impossible = month.filter((r) => r.audience && n0(r.engage) > r.audience)
    .map((r) => `${r.month}·${r.platform}·${r.brand}`);
  const drift = [];
  for (const p of page) {
    const rs = month.filter((r) => r.platform === p.platform && r.brand === p.brand
      && (r.page ?? null) === p.page && r.followers !== null);
    for (let i = 1; i < rs.length; i++) {
      const declared = rs[i].net_follow;
      if (declared === null) continue;
      const actual = n0(rs[i].followers) - n0(rs[i - 1].followers);
      const base = Math.max(Math.abs(actual), Math.abs(declared));
      // Bỏ qua biến động nhỏ: trên nền vài chục follower, lệch vài đơn vị là chuyện thường.
      if (base >= 20 && Math.abs(actual - declared) / base > 0.1) {
        drift.push(`${rs[i].month}·${p.platform}·${p.brand}: khai ${declared}, thực ${actual}`);
      }
    }
  }
  const ok13 = !impossible.length && !drift.length;
  add(13, 'Social: tương tác ≤ tiếp cận · follower khớp net_follow', ok13,
      ok13 ? `${month.length} dòng nhất quán`
           : [impossible.length && `tương tác > tiếp cận: ${impossible.slice(0, 4).join(' · ')}`,
              drift.length && `lệch follower: ${drift.slice(0, 3).join(' · ')}`]
             .filter(Boolean).join(' · '));

  const audienceAll = sum(month, (r) => r.audience);
  const engageAll = sum(month, (r) => r.engage);
  const stat = applyStats({
    months, platforms, pages: page.length,
    posts: sum(month, (r) => r.posts) || post.length,
    spend: sum(month, (r) => r.spend),
    engage: engageAll,
    net_follow: month.some((r) => r.net_follow !== null) ? sum(month, (r) => r.net_follow) : null,
    er: div(engageAll, audienceAll),
    // KHÔNG khai một con số `audience` tổng: cộng chéo nền tảng là số vô nghĩa.
    audience_by_platform: Object.fromEntries(platforms.map((p) =>
      [p, sum(month.filter((r) => r.platform === p), (r) => r.audience)])),
  }, over.social_stat);

  return { qa, month, platform_month, page, post, format, target, stat, empty: false };
}

/* ════════════════════════════════════════════════════════════════════
   6. CHẠY
   ════════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════════
   6. KHỐI M7.2 · PROMOTION TRACKING  →  src/data/campaign.json
   ════════════════════════════════════════════════════════════════════
   Số đã TÍNH SẴN ở tools/campaign.py (kỳ nền · đối chứng · lift · ROI · nhãn).
   Loader chỉ ghép khai báo + kết quả + chuỗi ngày, gắn danh mục từ hợp đồng, và đo
   ĐỘ PHỦ: bao nhiêu % doanh thu CTKM thương mại đã được khai thành chương trình. */
function buildCampaign(tables) {
  const C = CONTRACT.$campaign;
  const res = T(tables, 'campaign_result');
  const dim = new Map(T(tables, 'dim_campaign').map((r) => [r.campaign_id, r]));
  const tgt = new Map(T(tables, 'campaign_target').map((r) => [r.campaign_id, r]));
  const costBy = {};
  for (const r of T(tables, 'campaign_cost')) (costBy[r.campaign_id] ||= []).push({
    type: r.cost_type, planned: num(r.planned), actual: num(r.actual), note: r.note ?? null,
  });
  const campaigns = res.map((r) => {
    const d = dim.get(r.campaign_id) || {};
    const t = tgt.get(r.campaign_id) || null;
    return {
      id: r.campaign_id, name: d.name ?? r.campaign_id, name_pos: d.name_pos ?? null,
      pre_id: d.pre_id ?? null, source: d.source ?? null, match_note: d.match_note ?? null,
      eval_scope: r.eval_scope ?? 'STORE', eval_note: r.eval_note ?? null,
      prog: {
        sales: num(r.act_sales ?? r.promo_sales), base: num(r.base_sales), plan: num(r.plan_sales),
        store_net: num(r.store_net), store_tc: num(r.store_tc), gross: num(r.promo_gross),
        basis: r.revenue_basis ?? 'CTKM', lto_qty: num(r.lto_qty), lto_rev: num(r.lto_rev), lto_items: num(r.lto_items),
        bills: num(r.promo_bills), plan_tc: num(r.plan_tc), share: num(r.promo_share),
        disc: num(r.promo_disc), voucher: num(r.promo_voucher), breakeven: num(r.breakeven_sales),
      },
      store: { incr: num(r.store_incr_net), lift: num(r.store_lift_pct), flow: num(r.store_flow_through) },
      brand: d.brand ?? null, nature: d.nature ?? null,
      lever: d.lever_primary ?? null, lever2: d.lever_secondary ?? null,
      mechanic: d.mechanic ?? null, window: d.window ?? null,
      // nhịp chạy do engine SUY từ POS (không còn là cột khai tay) — chỉ dùng chọn cách đo
      cadence: r.cadence ?? d.cadence ?? null, recur_dow: num(r.recur_dow ?? d.recur_dow),
      objective: r.objective ?? d.objective ?? null, content: d.content ?? null,
      plan_group: r.plan_group ?? null, plan_primary: r.plan_primary === undefined || r.plan_primary === null ? null : n0(r.plan_primary),
      date_from: d.date_from ?? null, date_to: d.date_to ?? null,
      status: d.status ?? null, owner: d.owner ?? null, hypothesis: d.hypothesis ?? null,
      discount_rule: d.discount_rule ?? null, cost_owner: d.cost_owner ?? null,
      label: r.label, measurable: !!n0(r.measurable), reason: r.reason ?? null,
      period_from: r.period_from ?? null, period_to: r.period_to ?? null, days_run: num(r.days_run),
      base_from: r.base_from ?? null, base_to: r.base_to ?? null,
      stores: String(r.stores ?? '').split('|').filter(Boolean),
      control: r.control_stores ?? null, control_factor: num(r.control_factor),
      overlap: String(r.overlap ?? '').split('|').filter(Boolean), ramp_warning: !!n0(r.ramp_warning),
      act: { net: num(r.act_net), tc: num(r.act_tc), guest: num(r.act_guest) },
      exp: { net: num(r.exp_net), tc: num(r.exp_tc), guest: num(r.exp_guest) },
      incr: num(r.incr_net), lift: num(r.lift_pct),
      dec: { tc: num(r.d_tc), aov: num(r.d_aov), party: num(r.d_party), ta: num(r.d_ta), mix: num(r.d_mix) },
      driver: r.driver ?? null, lever_note: r.lever_note ?? null,
      promo: { bills: num(r.promo_bills), guests: num(r.promo_guests), net: num(r.promo_net) },
      cost: {
        discount: num(r.cost_discount), voucher: num(r.cost_voucher), manual: num(r.cost_manual),
        ads_auto: num(r.cost_ads_auto), total: num(r.cost_total), planned_used: r.cost_planned_used ?? null,
        promo_actual: num(r.cost_promo_actual), fixed_actual: num(r.cost_fixed_actual),
        lines: costBy[r.campaign_id] || [],
      },
      cm_pct: num(r.cm_pct), flow: num(r.flow_through), roi: num(r.roi), breakeven: num(r.breakeven_lift),
      target: t ? {
        net: num(t.tgt_net), tc: num(t.tgt_tc), aov: num(t.tgt_aov), ta: num(t.tgt_ta),
        incr: num(t.tgt_incr_net), submitted: t.submitted ?? null, note: t.note ?? null,
        verified: r.target_verified === null || r.target_verified === undefined ? null : !!n0(r.target_verified),
      } : null,
      att: { net: num(r.att_net), tc: num(r.att_tc), aov: num(r.att_aov), ta: num(r.att_ta), incr: num(r.att_incr) },
    };
  }).sort((a, b) => String(b.period_from).localeCompare(String(a.period_from)));

  // độ phủ khai báo: doanh thu CTKM COMMERCIAL/LOYALTY/PARTNER trên POS đã được gắn vào chương trình
  const ROI_NAT = new Set(['COMMERCIAL', 'LOYALTY', 'PARTNER']);
  const fpd = T(tables, 'fact_promo_day').filter((r) => ROI_NAT.has(r.nature));
  const unmapped = T(tables, 'campaign_unmapped').map((r) => ({
    name_pos: r.name_pos, nature: r.nature, brand: r.brand, first: r.first, last: r.last,
    days: num(r.days), bills: num(r.bills), net: num(r.net), disc: num(r.disc),
  }));
  const totNet = sum(fpd, (r) => r.net);
  const unNet = sum(unmapped, (r) => r.net);

  return {
    meta: {
      demo: res.some((r) => n0(r.demo) === 1),
      empty: !res.length,
      default_cm_pct: C.default_cm_pct, maturity_days: C.maturity_days,
    },
    taxonomy: {
      levers: C.levers, mechanics: C.mechanics, windows: C.windows, cadences: C.cadences,
      cost_types: C.cost_types, labels: C.labels, natures: CONTRACT.$promo_nature.labels,
      pre_kinds: C.pre_kinds, sources: C.sources, objectives: C.objectives,
    },
    // M7.1 · kế hoạch Pre-Analysis + kết quả thực tế nối qua campaign_id
    // M7.1 · phiếu đánh giá trước khi chạy (tools/preeval.py — khung PP672 × SALES = TC × AOV)
    preeval: {
      scenarios: CONTRACT.$preeval.scenarios,
      decisions: CONTRACT.$preeval.decisions,
      gates: CONTRACT.$preeval.gates,
      programs: Object.values(T(tables, 'pre_eval').reduce((m, r) => {
        const x = (m[r.program_id] ||= {
          id: r.program_id, name: r.name, brand: r.brand, stores: String(r.stores ?? '').split('|').filter(Boolean),
          date_from: r.date_from, date_to: r.date_to, days: num(r.days), objective: r.objective ?? null,
          lever: r.lever ?? null, status: r.status ?? null, decision: r.decision, decision_note: r.decision_note ?? null,
          campaign_id: r.campaign_id ?? null, quarter: r.quarter ?? null, season_factor: num(r.season_factor),
          scheme_mode: r.scheme_mode ?? null, tc_base: num(r.tc_base), participation_src: r.participation_src ?? null,
          cannib_src: r.cannib_src ?? null, other_cogs_pct: num(r.other_cogs_pct), opex_pct: num(r.opex_pct),
          base_note: r.base_note ?? null, scn: {}, fin: {}, schemes: [], base: [],
        });
        x.scn[r.scenario] = {
          bills: num(r.bills), bills_incr: num(r.bills_incr), cannib: num(r.cannib_pct), rev_incl: num(r.rev_incl),
          net_incr: num(r.net_incr), gp_incr: num(r.gp_incr), promo_cost: num(r.promo_cost),
          program_cost: num(r.program_cost), opex_incr: num(r.opex_incr), ebitda: num(r.ebitda_incr),
          ebitda_pct: num(r.ebitda_pct), roi: num(r.roi), breakeven_bills: num(r.breakeven_bills),
          max_cannib: num(r.max_cannib), redemption_needed: num(r.redemption_needed), stock_days: num(r.stock_days),
          gate_flags: r.gate_flags ?? null, tc_share: num(r.tc_share), safety_bills: num(r.safety_bills),
        };
        return m;
      }, {})).map((p) => {
        p.fin = T(tables, 'pre_eval_fin').filter((r) => r.program_id === p.id).reduce((m, r) => {
          (m[r.scenario] ||= []).push({
            row: r.row, label: r.label, base: num(r.base), without: num(r.without), with: num(r.with_promo),
            total: num(r.total), cannib: num(r.cannib_pct), incr: num(r.incr), incr_pct: num(r.incr_pct),
          });
          return m;
        }, {});
        p.schemes = T(tables, 'pre_eval_scheme').filter((r) => r.program_id === p.id).map((r) => ({
          id: r.scheme_id, name: r.scheme_name, condition: r.condition, benefit: r.benefit, bills: num(r.bills),
          bill_value: num(r.bill_value), discount: num(r.discount), rev: num(r.rev_after_disc), ta: num(r.ta),
          cogs: num(r.cogs), cogs_pct: num(r.cogs_pct), margin_pct: num(r.margin_pct), merch: num(r.merch_cost),
          promo_cost: num(r.promo_cost), note: r.basis_note ?? null,
        }));
        p.base = T(tables, 'pre_eval_base').filter((r) => r.program_id === p.id).map((r) => ({
          store: r.store, from: r.base_from ?? null, to: r.base_to ?? null, days: num(r.base_days),
          net: num(r.net_incl), tc: num(r.tc), guests: num(r.guests), aov: num(r.aov_incl), ta: num(r.ta_incl),
          tc_day: num(r.tc_day), tax_factor: num(r.tax_factor), disc_share: num(r.disc_share), note: r.note ?? null,
        }));
        return p;
      }),
    },
    plan: T(tables, 'pre_plan').map((r) => ({
      pre_id: r.pre_id, campaign_id: r.campaign_id ?? null, name: r.name, brand: r.brand, kind: r.kind,
      plan_status: r.plan_status ?? null, est_tc: num(r.est_tc), base: num(r.base_gross), growth: num(r.growth),
      target: num(r.target_gross), incr: num(r.incr_gross), aov: num(r.target_aov), cogs: num(r.cogs_pct),
      promo_cost: num(r.promo_cost), fixed_cost: num(r.fixed_cost), total_cost: num(r.total_cost),
      nc: num(r.net_contrib), roi: num(r.roi), breakeven: num(r.breakeven_incr), driver: num(r.driver),
      assessment: r.assessment ?? null, file: r.source_file ?? null,
      label: r.label ?? null, period_from: r.period_from ?? null, period_to: r.period_to ?? null,
      act_sales: num(r.act_net), act_bills: num(r.act_promo_bills ?? r.act_tc), act_incr: num(r.incr_net),
      act_promo_net: num(r.act_promo_net),
      act_cost: num(r.cost_total), act_nc: num(r.flow_through), act_roi: num(r.roi_actual),
    })),
    // tên CTKM POS → chương trình (M7 tra ngược bảng CTKM theo doanh thu chạm)
    pos_map: Object.fromEntries(T(tables, 'dim_campaign').flatMap((d) => String(d.name_pos ?? '')
      .split('|').map((x) => x.trim()).filter(Boolean).map((x) => [x.toLowerCase(), d.campaign_id]))),
    campaigns,
    // số POS theo tháng × cửa hàng — màn hình cộng đúng kỳ + brand đang lọc
    month: T(tables, 'campaign_month').map((r) => ({
      id: r.campaign_id, m: r.month, s: r.store, bills: n0(r.bills), guests: n0(r.guests), net: n0(r.net),
      gross: n0(r.gross), disc: n0(r.disc), voucher: n0(r.voucher),
      dup_bills: n0(r.dup_bills), dup_guests: n0(r.dup_guests), dup_net: n0(r.dup_net),
    })),
    daily: T(tables, 'campaign_daily').map((r) => ({
      id: r.campaign_id, date: r.date, p: n0(r.in_period), act: num(r.act_net), exp: num(r.exp_net),
      bills: num(r.promo_bills),
    })),
    unmapped,
    issues: T(tables, 'campaign_issue').map((r) => ({ id: r.campaign_id, field: r.field, level: r.level, msg: r.msg })),
    coverage: { promo_net: totNet, unmapped_net: unNet, mapped_pct: div(totNet - unNet, totNet) },
  };
}

async function main() {
  const t0 = Date.now();
  log('─'.repeat(72));
  log('NOIRE — dựng dữ liệu từ data_input/*.xlsx');
  log('─'.repeat(72));

  const { tables, unknown, stray, files } = await readWorkbooks();
  const over = statsOf(tables);
  const hub = buildHub(tables, over, { unknown, stray });
  const mkt = buildMkt(tables, over);
  const campaign = buildCampaign(tables);

  await mkdir(OUT, { recursive: true });

  /* Hai bảng NẶNG tách ra file riêng.
     `daily` (2.373 dòng) chỉ M1 Doanh thu dùng, `product` (700 SKU) chỉ M2 Menu dùng —
     cộng lại chiếm ~80% dung lượng data.json. Để chung thì mọi người mở dashboard
     đều phải tải và phân tích cả hai, kể cả khi chỉ xem Scorecard.
     Tách ra, Rollup gói mỗi file vào đúng chunk của màn hình import nó. */
  const daily = hub.daily;
  const product = hub.product;
  delete hub.daily;
  delete hub.product;

  await writeFile(path.join(OUT, 'daily.json'), JSON.stringify(daily), 'utf8');
  await writeFile(path.join(OUT, 'product.json'), JSON.stringify(product), 'utf8');
  await writeFile(path.join(OUT, 'data.json'), JSON.stringify(hub), 'utf8');
  await writeFile(path.join(OUT, 'data_mkt.json'), JSON.stringify(mkt), 'utf8');
  await writeFile(path.join(OUT, 'campaign.json'), JSON.stringify(campaign), 'utf8');

  // Chốt của hai khối được gộp lại, sắp theo SỐ chốt — không phải theo thứ tự
  // dựng — để bảng in ra đọc được từ trên xuống.
  const allQA = [...hub.qa, ...mkt.qa].sort((a, b) => a.no - b.no);
  const pass = allQA.filter((q) => q.ok).length;

  log('');
  log(`   ${files.length} file · ${hub.meta.months.length} tháng · ` +
      `${Object.keys(hub.stores).length} cửa hàng · ${product.length} SKU · ` +
      `${hub.store_month.length} dòng store×tháng` +
      (mkt.social.empty ? '' : ` · ${mkt.social.stat.pages} kênh social`));
  log('');
  log(`   CHỐT QA: ${pass}/${allQA.length} đạt`);
  for (const q of allQA) log(`     ${q.ok ? '✔' : '✖'} ${q.no}. ${q.name} — ${q.detail}`);

  const partial = Object.entries(hub.coverage).filter(([, v]) => v.partial).map(([m]) => m);
  if (partial.length) log(`\n   Tháng chưa trọn kỳ (loại khỏi mặc định): ${partial.join(', ')}`);

  log('');
  const kb = (o) => (JSON.stringify(o).length / 1024).toFixed(0);
  log(`   → src/data/data.json      ${kb(hub)} KB   (tải ngay khi mở dashboard)`);
  log(`   → src/data/data_mkt.json  ${kb(mkt)} KB   (tải ngay khi mở dashboard)`);
  log(`   → src/data/daily.json     ${kb(daily)} KB   (chỉ tải khi mở M1 Doanh thu)`);
  log(`   → src/data/product.json   ${kb(product)} KB   (chỉ tải khi mở M2 Menu)`);
  log(`   → src/data/campaign.json  ${kb(campaign)} KB   (chỉ tải khi mở cụm M7)${campaign.meta.demo ? ' · DỮ LIỆU MẪU' : ''}`);
  log(`   xong trong ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  log('─'.repeat(72));

  const blocking = hub.qa.filter((q) => !q.ok && [1, 2, 3, 4].includes(q.no));
  if (blocking.length) {
    console.error('\n✖ Chốt gác cổng không đạt — dừng build để không phát tán số sai:');
    for (const q of blocking) console.error(`   ${q.no}. ${q.name} — ${q.detail}`);
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error('\n✖ Lỗi dựng dữ liệu:', e.message);
  const keep = path.join(OUT, 'data.json');
  if (existsSync(keep)) {
    const kb = (await readFile(keep)).length / 1024;
    console.error(`  Giữ nguyên bản cũ src/data/data.json (${kb.toFixed(0)} KB) để app vẫn chạy được.`);
    process.exit(0);
  }
  process.exit(1);
});
