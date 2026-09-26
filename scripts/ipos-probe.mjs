/**
 * M10.1 · Phase 0 — thăm dò iPOS Booking Open API trước khi viết migration.
 *
 *   node scripts/ipos-probe.mjs auth                    lấy URL để admin brand bấm duyệt → sinh access token
 *   node scripts/ipos-probe.mjs brands                  liệt kê brand đã kết nối (pos_parent)
 *   node scripts/ipos-probe.mjs outlets [brand]         danh sách nhà hàng (pos_id / reference_pos)
 *   node scripts/ipos-probe.mjs sources [brand]         danh mục nguồn đặt bàn + soi code trùng tên
 *   node scripts/ipos-probe.mjs tags    [brand]         danh mục thẻ
 *   node scripts/ipos-probe.mjs pull    [brand] --days=90    kéo đơn theo created_at + in thống kê
 *   node scripts/ipos-probe.mjs pull    --fixture=_cache/ipos/<file>.json   chạy lại thống kê, không gọi API
 *   node scripts/ipos-probe.mjs day     <pos_id> [--date=YYYY-MM-DD]  đơn 1 ngày + SỐ CHỖ NGỒI (probe cho M3)
 *   node scripts/ipos-probe.mjs all     [brand] --days=90    chạy brands → outlets → sources → pull
 *
 * Đọc biến môi trường, không có thì đọc .env.local / .env. KHÔNG in khoá ra màn hình.
 * Chỉ gọi endpoint ĐỌC — không tạo đơn, không đổi trạng thái đơn.
 * Dữ liệu thô ghi vào _cache/ipos/ (đã nằm trong .gitignore).
 *
 * Tài liệu: https://documenter.getpostman.com/view/2386655/2s83t9LZno
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_cache', 'ipos');

// ─── env ────────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = {};
  for (const f of ['.env', '.env.local']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) };
}
const ENV = loadEnv();
const API = (ENV.IPOS_API_URL || 'https://booking.ipos.vn/api').replace(/\/+$/, '');
const APP_KEY = (ENV.IPOS_APP_KEY || '').trim();
const TOKEN = (ENV.IPOS_PARTNER_ACCESS_TOKEN || '').trim();

// ─── thời gian ──────────────────────────────────────────────────────────────
// iPOS: mọi mốc là unix giây. `meal_day` = 00:00 UTC của NGÀY PHỤC VỤ theo giờ địa phương;
// `created_at` / `meal_start_*` là mốc thật, hiển thị theo Asia/Bangkok (+7).
const ICT = 7 * 3600;
const nowSec = () => Math.floor(Date.now() / 1000);
const pad = (n) => String(n).padStart(2, '0');

function localDayStart(ts = nowSec()) {
  const d = new Date((ts + ICT) * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
}
function fmtDay(ts) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}
function fmtDT(ts) {
  if (!ts) return '—';
  const d = new Date((ts + ICT) * 1000);
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// ─── in ấn ──────────────────────────────────────────────────────────────────
const n = (v) => (v ?? 0).toLocaleString('vi-VN');
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
const head = (t) => console.log(`\n${t}\n${'─'.repeat(Math.max(t.length, 48))}`);

function table(rows, cols) {
  if (!rows.length) return console.log('  (trống)');
  const w = cols.map((c) => Math.max(c.label.length, ...rows.map((r) => String(c.get(r) ?? '').length)));
  const line = (cells) => '  ' + cells.map((c, i) => (cols[i].right ? String(c).padStart(w[i]) : String(c).padEnd(w[i]))).join('  ');
  console.log(line(cols.map((c) => c.label)));
  console.log('  ' + w.map((x) => '─'.repeat(x)).join('  '));
  for (const r of rows) console.log(line(cols.map((c) => c.get(r) ?? '')));
}

function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// ─── gọi API ────────────────────────────────────────────────────────────────
/**
 * Tài liệu iPOS không nhất quán tên header: chỗ `access-token`, chỗ `access_token`,
 * có endpoint gửi cả `token`.
 *
 * ⚠ KHÔNG được gửi cả ba cùng lúc: iPOS chuẩn hoá `_` ↔ `-` nên `access-token` và
 * `access_token` gộp thành một giá trị nối đôi → 401 "Định dạng partner_key không hợp lệ".
 * Đã đo trên production 26/09/2026: gửi riêng từng cái đều 200.
 * Vì vậy gửi MỘT header, gặp 401/403 thì thử tên tiếp theo.
 */
const HEADER_NAMES = ['access-token', 'access_token', 'token'];

async function call(method, route, { body, appKey = false } = {}) {
  const token = appKey ? APP_KEY : TOKEN;
  if (!token) {
    throw new Error(appKey
      ? 'Chưa có IPOS_APP_KEY (Khoá ứng dụng) trong .env.local'
      : 'Chưa có IPOS_PARTNER_ACCESS_TOKEN — chạy `node scripts/ipos-probe.mjs auth` trước');
  }
  const payloadBody = body ? JSON.stringify(body) : undefined;
  let lastError;

  for (const name of HEADER_NAMES) {
    const res = await fetch(`${API}${route}`, {
      method,
      headers: { [name]: token, ...(payloadBody ? { 'Content-Type': 'application/json' } : {}) },
      ...(payloadBody ? { body: payloadBody } : {}),
    });
    const text = await res.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${res.status} · phản hồi không phải JSON: ${text.slice(0, 200)}`);
    }
    if (res.status === 401 || res.status === 403) {
      lastError = `HTTP ${res.status} · ${payload.message || text.slice(0, 200)} (header "${name}")`;
      continue; // endpoint này dùng tên header khác — thử tiếp
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} · ${payload.message || text.slice(0, 200)}`);
    if (payload.error) throw new Error(`error=${payload.error} · ${payload.message || '(không có message)'}`);
    return payload.data;
  }
  throw new Error(`${lastError} — đã thử cả ${HEADER_NAMES.length} tên header`);
}

function save(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n  ↳ đã ghi ${path.relative(ROOT, p)}`);
  return p;
}

// ─── lệnh ───────────────────────────────────────────────────────────────────
async function cmdAuth() {
  head('Bước 0 · xin quyền truy cập brand');
  const data = await call('GET', '/v1/partner/brands/auth', { appKey: true });
  console.log(`\n  Mở URL này và để ADMIN BRAND bấm duyệt:\n\n  ${data.url}\n`);
  console.log('  Duyệt xong, iPOS sinh access token → dán vào .env.local:');
  console.log('    IPOS_PARTNER_ACCESS_TOKEN=<token>');
  console.log('\n  Rồi chạy: node scripts/ipos-probe.mjs brands');
}

async function cmdBrands() {
  head('Brand đã kết nối');
  const data = await call('GET', '/v1/partner/brands');
  const rows = Array.isArray(data) ? data : data?.results || [];
  table(rows, [
    { label: 'pos_parent', get: (r) => r.code || r.pos_parent || r._id },
    { label: 'Tên', get: (r) => r.name },
  ]);
  return rows;
}

async function resolveBrand(arg) {
  if (arg && !arg.startsWith('--')) return arg;
  if (ENV.IPOS_BRAND?.trim()) return ENV.IPOS_BRAND.trim();
  const rows = await call('GET', '/v1/partner/brands');
  const list = Array.isArray(rows) ? rows : rows?.results || [];
  const codes = list.map((r) => r.code || r.pos_parent).filter(Boolean);
  if (codes.length === 1) return codes[0];
  throw new Error(`Cần chỉ rõ brand (pos_parent). Đang kết nối: ${codes.join(' · ') || '(chưa có)'}`);
}

async function cmdOutlets(brand) {
  head(`Nhà hàng của ${brand}`);
  const data = await call('GET', `/v1/partner/brands/${encodeURIComponent(brand)}/restaurants`);
  const rows = Array.isArray(data) ? data : data?.results || [];
  table(rows, [
    { label: 'pos_id', get: (r) => r.reference_pos ?? r.pos_id ?? '—' },
    { label: 'restaurant_id', get: (r) => r._id },
    { label: 'Tên', get: (r) => r.name },
    { label: 'Booking', get: (r) => (r.booking_activated === false ? 'TẮT' : 'bật') },
  ]);
  console.log(`\n  Tổng: ${rows.length} nhà hàng`);
  save(`restaurants_${brand}.json`, rows);
  return rows;
}

async function cmdSources(brand) {
  head(`Nguồn đặt bàn của ${brand}`);
  const rows = (await call('GET', `/v1/partner/reservations/sources?pos_parent=${encodeURIComponent(brand)}`)) || [];
  table(rows, [
    { label: 'code', get: (r) => r.code },
    { label: 'Tên hiển thị', get: (r) => r.name },
    { label: 'Loại', get: (r) => (r._id ? 'tự tạo' : 'hệ thống') },
  ]);

  // Đây là thứ cần soi nhất: dashboard iPOS đang có nhiều lát cùng tên "Google Ads".
  const byName = new Map();
  for (const r of rows) byName.set(r.name, [...(byName.get(r.name) || []), r.code]);
  const dupes = [...byName].filter(([, codes]) => codes.length > 1);
  if (dupes.length) {
    console.log('\n  ⚠ Code khác nhau nhưng TRÙNG TÊN — biểu đồ iPOS sẽ tách thành nhiều lát:');
    for (const [name, codes] of dupes) console.log(`    "${name}" ← ${codes.join(' · ')}`);
    console.log('    → gom ở dim_ipos_source.channel, KHÔNG đổi tên trong iPOS (xem M10_1 §3b)');
  }
  console.log(`\n  Tổng: ${rows.length} nguồn`);
  save(`sources_${brand}.json`, rows);
  return rows;
}

async function cmdTags(brand) {
  head(`Thẻ đơn đặt bàn của ${brand}`);
  const rows = (await call('GET', `/v1/partner/reservations/tags?pos_parent=${encodeURIComponent(brand)}`)) || [];
  table(rows, [
    { label: '_id', get: (r) => r._id },
    { label: 'Tên', get: (r) => r.name },
  ]);
  return rows;
}

async function cmdFixture(file) {
  const p = path.resolve(ROOT, file);
  head(`Thống kê lại từ ${path.relative(ROOT, p)} (không gọi API)`);
  const rows = JSON.parse(fs.readFileSync(p, 'utf8'));
  const brand = rows[0]?.brand_code || '';
  let sources = [];
  const cat = path.join(OUT, `sources_${brand}.json`);
  if (brand && fs.existsSync(cat)) sources = JSON.parse(fs.readFileSync(cat, 'utf8'));
  summarize(rows, sources, rows.length, p);
}

async function cmdPull(brand, days) {
  const to = nowSec();
  const from = to - days * 86400;
  head(`Kéo đơn ${brand} · created_at ${fmtDay(from)} → ${fmtDay(to)} (${days} ngày)`);

  const results = [];
  let total = 0;
  for (let page = 0; page < 200; page += 1) {
    const data = await call('POST', '/v1/partner/reservations/filters', {
      body: {
        pos_parent: brand,
        created_at: [from, to],
        tag_ids: [], phones: [], customers: [], sources: [], ips: [], codes: [], status: [],
        page_size: 500,
        page_index: page,
      },
    });
    total = data.total ?? 0;
    const batch = data.results || [];
    results.push(...batch);
    process.stdout.write(`\r  trang ${page + 1} · ${results.length}/${total} đơn`);
    if (!batch.length || results.length >= total) break;
    await new Promise((r) => setTimeout(r, 400)); // tài liệu không công bố rate limit
  }
  console.log('');
  if (!results.length) {
    console.log('  (không có đơn nào trong kỳ)');
    return;
  }

  const file = save(`reservations_${brand}_${fmtDay(from)}_${fmtDay(to)}.json`, results);
  let sources = [];
  try {
    sources = (await call('GET', `/v1/partner/reservations/sources?pos_parent=${encodeURIComponent(brand)}`)) || [];
  } catch { /* không có danh mục thì in code trần */ }
  summarize(results, sources, total, file);
}

function summarize(rows, sources, total, file) {
  const nameOf = new Map(sources.map((s) => [s.code, s.name]));
  const today = localDayStart();
  const seats = (r) => r.booking_seats || 0;

  head(`Tổng quan · ${n(rows.length)} đơn (API báo total ${n(total)})`);
  const created = rows.map((r) => r.created_at).filter(Boolean);
  console.log(`  Ngày tạo     ${fmtDay(Math.min(...created))} → ${fmtDay(Math.max(...created))}`);
  const meals = rows.map((r) => r.meal_day).filter(Boolean);
  console.log(`  Ngày phục vụ ${fmtDay(Math.min(...meals))} → ${fmtDay(Math.max(...meals))}`);
  console.log(`  Tổng khách đặt  ${n(rows.reduce((s, r) => s + seats(r), 0))}`);

  // ── trạng thái
  head('Theo trạng thái');
  const byStatus = group(rows, (r) => r.status || '(trống)');
  table(sortDesc(byStatus), [
    { label: 'Trạng thái', get: ([k]) => k },
    { label: 'Đơn', right: true, get: ([, v]) => n(v.length) },
    { label: '%', right: true, get: ([, v]) => pct(v.length, rows.length) },
    { label: 'Khách', right: true, get: ([, v]) => n(v.reduce((s, r) => s + seats(r), 0)) },
  ]);

  // ── kết quả: CHỈ tính trên đơn đã qua ngày phục vụ (M10_1 §1c)
  const matured = rows.filter((r) => r.meal_day && r.meal_day < today);
  const future = rows.length - matured.length;
  const cnt = (s) => matured.filter((r) => s.includes(r.status)).length;
  head(`Kết quả · mẫu số = ${n(matured.length)} đơn ĐÃ QUA ngày phục vụ`);
  console.log(`  Đến thật (RECEIVED+COMPLETED)  ${n(cnt(['RECEIVED', 'COMPLETED']))}  ${pct(cnt(['RECEIVED', 'COMPLETED']), matured.length)}`);
  console.log(`  Khách không đến (NOT_COME)     ${n(cnt(['NOT_COME']))}  ${pct(cnt(['NOT_COME']), matured.length)}`);
  console.log(`  Đã huỷ (CANCELLED)             ${n(cnt(['CANCELLED']))}  ${pct(cnt(['CANCELLED']), matured.length)}`);
  console.log(`  Còn treo (WAITING_CONFIRM)     ${n(cnt(['WAITING_CONFIRM']))}  ${pct(cnt(['WAITING_CONFIRM']), matured.length)}`);
  if (future) {
    const share = future / rows.length;
    console.log(`\n  ${share > 0.4 ? '⚠' : 'ℹ'} ${n(future)} đơn (${pct(future, rows.length)}) còn ở TƯƠNG LAI — đã loại khỏi mẫu số.`);
    if (share > 0.4) console.log('    Kỳ này chưa chín, màn hình phải ghi rõ (QA gate #11).');
  }

  // ── nguồn: khối quan trọng nhất cho phễu ads
  head('Theo nguồn đặt bàn');
  const bySource = group(rows, (r) => r.booking_source || '(trống)');
  table(sortDesc(bySource), [
    { label: 'code', get: ([k]) => k },
    { label: 'Tên', get: ([k]) => nameOf.get(k) ?? (sources.length ? '⚠ KHÔNG CÓ TRONG DANH MỤC' : '—') },
    { label: 'Đơn', right: true, get: ([, v]) => n(v.length) },
    { label: '%', right: true, get: ([, v]) => pct(v.length, rows.length) },
    { label: 'Khách', right: true, get: ([, v]) => n(v.reduce((s, r) => s + seats(r), 0)) },
    { label: 'Đến', right: true, get: ([, v]) => pct(
      v.filter((r) => ['RECEIVED', 'COMPLETED'].includes(r.status) && r.meal_day < today).length,
      v.filter((r) => r.meal_day && r.meal_day < today).length,
    ) },
  ]);
  const unknown = [...bySource.keys()].filter((k) => sources.length && !nameOf.has(k));
  if (unknown.length) console.log(`\n  ⚠ Code lạ, chưa có trong /sources: ${unknown.join(' · ')} (QA gate #7)`);
  const seen = new Map();
  for (const k of bySource.keys()) {
    const nm = nameOf.get(k);
    if (nm) seen.set(nm, [...(seen.get(nm) || []), k]);
  }
  for (const [nm, codes] of seen) {
    if (codes.length > 1) console.log(`  ⚠ "${nm}" bị tách thành ${codes.length} lát: ${codes.join(' · ')} → gom ở dim_ipos_source (QA gate #8)`);
  }

  // ── nhà hàng
  head('Theo nhà hàng');
  const byOutlet = group(rows, (r) => `${r.restaurant?.reference_pos ?? '?'} · ${r.restaurant?.name ?? '(không tên)'}`);
  table(sortDesc(byOutlet), [
    { label: 'pos_id · tên', get: ([k]) => k },
    { label: 'Đơn', right: true, get: ([, v]) => n(v.length) },
    { label: 'Khách', right: true, get: ([, v]) => n(v.reduce((s, r) => s + seats(r), 0)) },
  ]);

  // ── nhịp vận hành
  head('Nhịp vận hành');
  const lead = median(rows.map((r) => (r.meal_start_expected && r.created_at ? (r.meal_start_expected - r.created_at) / 3600 : NaN)));
  const conf = median(rows.map((r) => (r.booking_confirmed_at && r.created_at ? (r.booking_confirmed_at - r.created_at) / 60 : NaN)));
  const late = median(rows.map((r) => (r.meal_start_reality && r.meal_start_expected ? (r.meal_start_reality - r.meal_start_expected) / 60 : NaN)));
  console.log(`  Lead time (trung vị)        ${lead === null ? '—' : `${lead.toFixed(1)} giờ`}   khách đặt trước bao lâu`);
  console.log(`  Thời gian xác nhận          ${conf === null ? '—' : `${conf.toFixed(0)} phút`}   created_at → booking_confirmed_at`);
  console.log(`  Độ trễ nhận bàn             ${late === null ? '— (chưa có meal_start_reality)' : `${late.toFixed(0)} phút`}   âm = khách đến sớm`);

  // ── độ phủ trường, quyết định được migration ghi cột nào
  head('Độ phủ trường dữ liệu');
  const has = (fn) => rows.filter(fn).length;
  const cov = [
    ['SĐT khách', has((r) => r.customer_temp_phone), '→ phone_hash, nối sang bill POS'],
    ['Có ghi chú', has((r) => r.booking_note), '→ chỉ lưu cờ has_note'],
    ['Có đặt cọc', has((r) => r.deposit > 0), ''],
    ['Có món đặt trước', has((r) => r.total_amount > 0), '→ KHÔNG phải doanh thu bill'],
    ['Có gán bàn', has((r) => (r.table_ids || []).length), ''],
    ['Có thẻ (tag)', has((r) => (r.tag_ids || []).length), ''],
    ['Có CTV', has((r) => r.collaborator_id), ''],
    ['Đã xác nhận có mốc giờ', has((r) => r.booking_confirmed_at), ''],
    ['Có meal_start_reality', has((r) => r.meal_start_reality), '→ cần cho dwell & đúng giờ'],
  ];
  table(cov, [
    { label: 'Trường', get: (r) => r[0] },
    { label: 'Đơn', right: true, get: (r) => n(r[1]) },
    { label: '%', right: true, get: (r) => pct(r[1], rows.length) },
    { label: '', get: (r) => r[2] },
  ]);

  // ── cờ QA
  const failed = rows.filter((r) => (r.booking_alt?.hub_errors || []).length);
  if (failed.length) {
    head(`⚠ ${n(failed.length)} đơn KHÔNG đẩy được về POS (QA gate #9)`);
    for (const r of failed.slice(0, 5)) {
      console.log(`  ${r.booking_code} · ${fmtDT(r.created_at)} · ${(r.booking_alt.hub_errors[0].error?.message || '').split('\n')[0].trim()}`);
    }
    if (failed.length > 5) console.log(`  … và ${n(failed.length - 5)} đơn nữa — xem ${path.basename(file)}`);
  }

  head('Bước tiếp theo');
  console.log('  1. Soi file JSON vừa ghi, đối chiếu số đơn với dashboard iPOS cùng kỳ (QA gate #4)');
  console.log('  2. Gán channel/is_paid/platform cho từng source code ở bảng "Theo nguồn" phía trên');
  console.log('  3. Chốt cột → viết database/migrations/003_ipos_reservation.sql');
}

async function cmdDay(brand, posId, dateArg) {
  const ts = dateArg ? Date.parse(`${dateArg}T00:00:00Z`) / 1000 : localDayStart();
  head(`Đơn ngày ${fmtDay(ts)} · nhà hàng ${posId}`);
  const rows = (await call('GET',
    `/v1/partner/reservations/get-list-fb?pos_parent=${encodeURIComponent(brand)}&pos_id=${encodeURIComponent(posId)}&date=${ts}`)) || [];
  table(rows, [
    { label: 'Mã', get: (r) => r.booking_code },
    { label: 'Giờ', get: (r) => fmtDT(r.process_time) },
    { label: 'Khách', right: true, get: (r) => r.peo_count },
    { label: 'Trạng thái', get: (r) => r.status },
    { label: 'Bàn', get: (r) => (r.tables || []).map((t) => t.name).join(',') || '—' },
  ]);

  // Đây là lý do endpoint này đáng chạy: `filters` KHÔNG trả seats, chỉ trả table_ids.
  const tables = new Map();
  for (const r of rows) for (const t of r.tables || []) tables.set(t._id, t);
  head(`Số chỗ ngồi thu được — probe mở khoá M3 (${tables.size} bàn)`);
  table([...tables.values()], [
    { label: 'Bàn', get: (t) => t.name },
    { label: 'code', get: (t) => t.code },
    { label: 'seats', right: true, get: (t) => t.seats },
    { label: 'min', right: true, get: (t) => t.min_person },
    { label: 'max', right: true, get: (t) => t.max_person },
    { label: 'area_id', get: (t) => t.area_id ?? '—' },
  ]);
  console.log('\n  Chỉ thấy bàn ĐÃ TỪNG có đơn đặt — không thay được sơ đồ bàn của Ops (M10_1 §8).');
  save(`day_${posId}_${fmtDay(ts)}.json`, rows);
}

// ─── tiện ích gom nhóm ──────────────────────────────────────────────────────
function group(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = key(r);
    m.set(k, [...(m.get(k) || []), r]);
  }
  return m;
}
const sortDesc = (m) => [...m].sort((a, b) => b[1].length - a[1].length);

// ─── main ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cmd = argv[0];
const positional = argv.slice(1).filter((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const days = Math.max(1, Number(flag('days', 90)) || 90);

try {
  switch (cmd) {
    case 'auth':
      await cmdAuth();
      break;
    case 'brands':
      await cmdBrands();
      break;
    case 'outlets':
      await cmdOutlets(await resolveBrand(positional[0]));
      break;
    case 'sources':
      await cmdSources(await resolveBrand(positional[0]));
      break;
    case 'tags':
      await cmdTags(await resolveBrand(positional[0]));
      break;
    case 'pull':
      if (flag('fixture')) await cmdFixture(flag('fixture'));
      else await cmdPull(await resolveBrand(positional[0]), days);
      break;
    case 'day': {
      const posId = positional.find((a) => /^\d+$/.test(a));
      if (!posId) throw new Error('Thiếu pos_id. Ví dụ: node scripts/ipos-probe.mjs day 16933 --date=2026-09-26');
      await cmdDay(await resolveBrand(positional.find((a) => a !== posId)), posId, flag('date'));
      break;
    }
    case 'all': {
      const brand = await resolveBrand(positional[0]);
      await cmdBrands();
      await cmdOutlets(brand);
      await cmdSources(brand);
      await cmdPull(brand, days);
      break;
    }
    default:
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*\n?/, '').replace(/^ \* ?/gm, ''));
      console.log(`API      ${API}`);
      console.log(`APP_KEY  ${APP_KEY ? '✓ đã có' : '✗ thiếu IPOS_APP_KEY'}`);
      console.log(`TOKEN    ${TOKEN ? '✓ đã có' : '✗ thiếu IPOS_PARTNER_ACCESS_TOKEN — chạy lệnh `auth`'}`);
      process.exitCode = cmd ? 1 : 0;
  }
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
}
