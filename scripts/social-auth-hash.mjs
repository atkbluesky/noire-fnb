import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

async function readHiddenPassword() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error('Chạy lệnh này trong terminal tương tác để nhập mật khẩu ẩn.');
  }
  process.stdout.write('Mật khẩu quản trị M6.2 (ít nhất 16 ký tự): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let password = '';
  try {
    for await (const chunk of process.stdin) {
      for (const char of String(chunk)) {
        if (char === '\u0003') throw new Error('Đã hủy.');
        if (char === '\r' || char === '\n') { process.stdout.write('\n'); return password; }
        if (char === '\u007f' || char === '\b') { password = password.slice(0, -1); continue; }
        if (password.length < 256) password += char;
      }
    }
    throw new Error('Không đọc được mật khẩu.');
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

try {
  const password = await readHiddenPassword();
  if (password.length < 16) throw new Error('Mật khẩu cần ít nhất 16 ký tự.');
  const salt = randomBytes(24);
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  process.stdout.write(`SOCIAL_ADMIN_PASSWORD_HASH=scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Không tạo được hash'}\n`);
  process.exitCode = 1;
}
