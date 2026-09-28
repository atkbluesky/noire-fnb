/**
 * M8.2 · Phase 0 — thăm dò Facebook Graph API trước khi viết pipeline Fanpage → Zalo OA.
 *
 *   node scripts/fb-probe.mjs debug                      soi token hiện có: scope + hạn dùng + app
 *   node scripts/fb-probe.mjs token                      đổi short-lived user token → long-lived
 *   node scripts/fb-probe.mjs pages                      Page mà token quản trị (id + page token)
 *   node scripts/fb-probe.mjs posts   [--limit=10]       bài published gần nhất + attachment
 *   node scripts/fb-probe.mjs reels   [--limit=5]        reels của Page
 *   node scripts/fb-probe.mjs source  <video_id>         soi field source / length / format
 *   node scripts/fb-probe.mjs download <video_id>        tải file thật về _cache/fb/ + đo dung lượng
 *   node scripts/fb-probe.mjs all                        debug → pages → reels → source → download
 *
 * Đọc biến môi trường, không có thì đọc .env.local / .env. KHÔNG in full token ra màn hình.
 * Chỉ gọi endpoint ĐỌC — không đăng bài, không xoá, không đổi gì trên Page.
 * Dữ liệu thô ghi vào _cache/fb/ (nhớ thêm vào .gitignore).
 *
 * Tài liệu: https://developers.facebook.com/docs/video-api/guides/reels-publishing
 *           https://developers.facebook.com/docs/graph-api/reference/video/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_cache', 'fb');

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
const VER = (ENV.FB_GRAPH_VERSION || 'v23.0').trim();
const APP_ID = (ENV.FB_APP_ID || '').trim();
const APP_SECRET = (ENV.FB_APP_SECRET || '').trim();
const USER_TOKEN = (ENV.FB_USER_TOKEN || '').trim();
const PAGE_ID = (ENV.FB_PAGE_ID || '').trim();
const PAGE_TOKEN = (ENV.FB_PAGE_TOKEN || '').trim();

const mask = (t) => (!t ? '(trống)' : `${t.slice(0, 8)}…${t.slice(-4)} (${t.length} ký tự)`);
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const die = (msg) => { console.error(`\n✗ ${msg}\n`); process.exit(1); };

// ─── graph ──────────────────────────────────────────────────────────────────
async function graph(node, params = {}, token = PAGE_TOKEN) {
  const url = new URL(`https://graph.facebook.com/${VER}/${node}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error || {};
    die(`Graph ${res.status} · ${e.type || ''} ${e.code || ''}${e.error_subcode ? `/${e.error_subcode}` : ''}\n  ${e.message || JSON.stringify(body)}`);
  }
  return body;
}

function save(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, name);
  fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  console.log(`   ↳ ghi ${path.relative(ROOT, p)}`);
}

// ─── commands ───────────────────────────────────────────────────────────────
async function cmdDebug() {
  if (!APP_ID || !APP_SECRET) die('Thiếu FB_APP_ID / FB_APP_SECRET trong .env.local');
  const target = PAGE_TOKEN || USER_TOKEN;
  if (!target) die('Thiếu FB_PAGE_TOKEN hoặc FB_USER_TOKEN');
  console.log(`\nToken đang soi: ${mask(target)}`);
  const { data } = await graph('debug_token', { input_token: target }, `${APP_ID}|${APP_SECRET}`);
  const exp = data.expires_at ? new Date(data.expires_at * 1000).toISOString() : 'KHÔNG HẾT HẠN';
  console.log(`  type        ${data.type}`);
  console.log(`  app_id      ${data.app_id}`);
  console.log(`  valid       ${data.is_valid ? 'OK' : 'KHONG HOP LE'}`);
  console.log(`  expires_at  ${exp}`);
  console.log(`  scopes      ${(data.scopes || []).join(', ') || '(không có)'}`);
  const miss = ['pages_show_list', 'pages_read_engagement'].filter((s) => !(data.scopes || []).includes(s));
  if (miss.length) console.log(`  ⚠ thiếu scope: ${miss.join(', ')}`);
}

async function cmdToken() {
  if (!APP_ID || !APP_SECRET) die('Thiếu FB_APP_ID / FB_APP_SECRET');
  if (!USER_TOKEN) die('Thiếu FB_USER_TOKEN (lấy từ Graph API Explorer)');
  console.log('\n① Đổi short-lived → long-lived user token (60 ngày)…');
  const ll = await graph('oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: APP_ID, client_secret: APP_SECRET, fb_exchange_token: USER_TOKEN,
  }, USER_TOKEN);
  console.log(`   long-lived user token: ${mask(ll.access_token)}`);
  console.log('\n② Lấy Page token (sinh từ long-lived user token thì KHÔNG hết hạn)…');
  const { data = [] } = await graph('me/accounts', { fields: 'id,name,access_token,tasks' }, ll.access_token);
  if (!data.length) die('Token không quản trị Page nào. Kiểm tra quyền admin Page + scope pages_show_list.');
  for (const p of data) console.log(`   • ${p.name}\n     FB_PAGE_ID=${p.id}\n     FB_PAGE_TOKEN=${mask(p.access_token)}`);
  save('tokens.json', { long_lived_user_token: ll.access_token, pages: data });
  console.log('\n   ⚠ tokens.json chứa token THẬT — copy vào .env.local rồi XOÁ file, đừng commit.');
}

async function cmdPages() {
  const { data = [] } = await graph('me/accounts', { fields: 'id,name,category,tasks' }, USER_TOKEN || PAGE_TOKEN);
  console.log('');
  for (const p of data) console.log(`  ${p.id}  ${p.name}  [${(p.tasks || []).join(',')}]`);
  if (!data.length) console.log('  (không có Page nào)');
}

async function cmdPosts(limit) {
  if (!PAGE_ID) die('Thiếu FB_PAGE_ID');
  const r = await graph(`${PAGE_ID}/published_posts`, {
    limit,
    fields: 'id,message,created_time,permalink_url,full_picture,shares,'
      + 'attachments{type,media_type,url,media,subattachments},'
      + 'reactions.summary(true).limit(0),comments.summary(true).limit(0)',
  });
  console.log('');
  for (const p of r.data || []) {
    const a = p.attachments?.data?.[0] || {};
    const sub = a.subattachments?.data?.length || 0;
    console.log(`  ${(p.created_time || '').slice(0, 16)}  ${p.id}`);
    console.log(`    type=${a.type || '-'} media=${a.media_type || '-'}${sub ? ` sub=${sub}` : ''}`
      + `  react=${p.reactions?.summary?.total_count ?? 0} cmt=${p.comments?.summary?.total_count ?? 0} share=${p.shares?.count ?? 0}`);
    console.log(`    ${(p.message || '(không có caption)').replace(/\s+/g, ' ').slice(0, 90)}`);
  }
  save('posts.json', r);
}

async function cmdReels(limit) {
  if (!PAGE_ID) die('Thiếu FB_PAGE_ID');
  const r = await graph(`${PAGE_ID}/video_reels`, {
    limit, fields: 'id,description,created_time,permalink_url,length,updated_time',
  });
  console.log('');
  if (!(r.data || []).length) console.log('  (Page chưa có reel nào, hoặc token thiếu quyền)');
  for (const v of r.data || []) {
    console.log(`  ${v.id}  ${(v.created_time || '').slice(0, 16)}  ${v.length ? `${v.length}s` : ''}`);
    console.log(`    ${(v.description || '(không mô tả)').replace(/\s+/g, ' ').slice(0, 90)}`);
  }
  save('reels.json', r);
  return (r.data || [])[0]?.id || null;
}

async function cmdSource(videoId) {
  const v = await graph(videoId, { fields: 'id,source,length,created_time,picture,permalink_url,format' });
  console.log('');
  console.log(`  id       ${v.id}`);
  console.log(`  length   ${v.length ?? '?'}s`);
  console.log(`  format   ${(v.format || []).map((f) => `${f.width}x${f.height}`).join(' · ') || '-'}`);
  console.log(`  source   ${v.source ? 'CÓ — pipeline tải file trực tiếp được' : 'KHÔNG TRẢ VỀ — phải fallback HLS/DASH'}`);
  if (v.source) console.log(`           ${v.source.slice(0, 110)}…`);
  save(`video_${videoId}.json`, v);
  return v.source || null;
}

async function cmdDownload(videoId) {
  const src = await cmdSource(videoId);
  if (!src) die('Không có field source → phải dùng fallback HLS/DASH, ghi lại kết quả này vào docs.');
  console.log('\n  Đang tải…');
  const res = await fetch(src, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) die(`Tải thất bại HTTP ${res.status} (URL CDN có thể đã hết hạn — gọi lại source)`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, `${videoId}.mp4`);
  fs.writeFileSync(p, buf);
  console.log(`   ↳ ${path.relative(ROOT, p)}  ${mb(buf.length)}`);
  console.log(buf.length <= 50 * 1048576
    ? '   OK ≤ 50MB — nạp thẳng lên Zalo preparevideo được, khỏi transcode'
    : `   ⚠ > 50MB — BẮT BUỘC transcode xuống ~45MB trước khi lên Zalo (dư ${mb(buf.length - 50 * 1048576)})`);
}

// ─── main ───────────────────────────────────────────────────────────────────
const [cmd = 'debug', ...rest] = process.argv.slice(2);
const limit = Number((rest.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 5;
const arg = rest.find((a) => !a.startsWith('--'));

console.log(`\n── fb-probe · Graph ${VER} · page=${PAGE_ID || '(chưa set)'} ──`);
switch (cmd) {
  case 'debug': await cmdDebug(); break;
  case 'token': await cmdToken(); break;
  case 'pages': await cmdPages(); break;
  case 'posts': await cmdPosts(limit === 5 ? 10 : limit); break;
  case 'reels': await cmdReels(limit); break;
  case 'source': await cmdSource(arg || die('Thiếu <video_id>')); break;
  case 'download': await cmdDownload(arg || die('Thiếu <video_id>')); break;
  case 'all': {
    await cmdDebug();
    await cmdPages();
    const first = await cmdReels(3);
    if (first) await cmdDownload(first);
    else console.log('\n  Không có reel để test tải.');
    break;
  }
  default: die(`Lệnh lạ: ${cmd}. Xem header file để biết các lệnh.`);
}
console.log('');
