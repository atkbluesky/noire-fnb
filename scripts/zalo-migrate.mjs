/**
 * M8.1 · chạy migration PostgreSQL cho Zalo OA.
 *   node scripts/zalo-migrate.mjs            chạy mọi file database/migrations/*.sql theo thứ tự
 *   node scripts/zalo-migrate.mjs --check    chỉ kiểm tra kết nối + liệt kê bảng zalo_oa_*
 * Đọc DATABASE_URL từ biến môi trường, không có thì từ .env.local / .env. Không in chuỗi kết nối.
 * Các file migration viết kiểu `if not exists` / `create or replace` nên chạy lại an toàn.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function envUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(/^DATABASE_URL=(.*)$/m);
    if (m && m[1].trim()) return m[1].trim();
  }
  return '';
}

const url = envUrl();
if (!url || /USER:PASSWORD@HOST/.test(url)) {
  console.error('✗ Chưa có DATABASE_URL thật trong .env.local');
  process.exit(1);
}
const host = url.replace(/^[a-z]+:\/\/[^@]*@/, '').replace(/[/:?].*$/, '');
const sql = postgres(url, {
  max: 1, prepare: false, connect_timeout: 15, onnotice: () => {},
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require',
});

try {
  const [{ version }] = await sql`select version()`;
  console.log(`✓ Kết nối được · host ${host} · ${version.split(' ').slice(0, 2).join(' ')}`);
  if (!process.argv.includes('--check')) {
    const dir = path.join(ROOT, 'database', 'migrations');
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) {
      await sql.unsafe(fs.readFileSync(path.join(dir, f), 'utf8'));
      console.log(`✓ migration ${f}`);
    }
  }
  const tables = await sql`select table_name from information_schema.tables
    where table_schema = 'public' and table_name like 'zalo_oa_%' order by 1`;
  console.log(`  bảng: ${tables.map(t => t.table_name).join(' · ') || '(chưa có)'}`);
} catch (error) {
  console.error('✗', error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
