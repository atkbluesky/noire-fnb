/**
 * ════════════════════════════════════════════════════════════════════════════
 * NOIRE ANALYTICS HUB — WEBHOOK LƯU Ý KIẾN ĐÓNG GÓP VỀ GOOGLE SHEETS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Dán TOÀN BỘ file này vào Apps Script của Google Sheet, chạy `setup()` một
 * lần, rồi Deploy dạng Web App. Chi tiết từng bước:
 *   docs/60_HUONG_DAN_FEEDBACK_GOOGLE_SHEET.md
 *
 * Nguồn gửi: src/components/common/FeedbackWidget.tsx
 * ──────────────────────────────────────────────────────────────────────────── */


/* ─── 1. CẤU HÌNH ─────────────────────────────────────────────────────────── */

/** Để trống nếu script gắn TRỰC TIẾP vào bảng tính (Extensions → Apps Script). */
var SHEET_ID = '';

/** Tên tab chứa dữ liệu. Script tự tạo nếu chưa có. */
var SHEET_NAME = 'Feedback';

/**
 * Mã bí mật chống spam. PHẢI khớp với VITE_FEEDBACK_SECRET của dashboard.
 * Để trống = không kiểm tra (chỉ nên dùng khi test).
 */
var SHARED_SECRET = '';

/** Email nhận thông báo mỗi khi có phản hồi mới. Để trống = tắt. */
var NOTIFY_EMAIL = '';

/** Chỉ gửi email cho các phân loại này. Để mảng rỗng = gửi cho mọi phân loại. */
var NOTIFY_ONLY_CATEGORIES = ['bug'];

/** Chặn spam làm đầy Sheet: tối đa bao nhiêu bản ghi được ghi trong 1 request. */
var MAX_ITEMS_PER_REQUEST = 50;

/** Cắt bớt nội dung quá dài — tránh một ô chiếm dung lượng bất thường. */
var MAX_FIELD_LENGTH = 5000;


/* ─── 2. ĐỊNH NGHĨA CỘT ───────────────────────────────────────────────────── */

/**
 * Thứ tự cột trên Sheet. Muốn thêm cột: bổ sung một phần tử vào mảng này rồi
 * chạy lại `setup()` — hàm đó sẽ ghi lại hàng tiêu đề cho khớp.
 * `pick` nhận (item, envelope) và trả về giá trị của ô.
 */
var COLUMNS = [
  { header: 'Ghi nhận lúc',      pick: function (it, en) { return new Date(); } },
  { header: 'Mã phản hồi',       pick: function (it)     { return it.id || ''; } },
  { header: 'Thời gian gửi',     pick: function (it)     { return toDate_(it.createdAtISO); } },
  { header: 'Thời gian (VN)',    pick: function (it)     { return it.createdAt || ''; } },
  { header: 'Phân loại',         pick: function (it)     { return it.categoryLabel || ''; } },
  { header: 'Mã phân loại',      pick: function (it)     { return it.category || ''; } },
  { header: 'Nội dung',          pick: function (it)     { return it.content || ''; } },
  { header: 'Liên hệ',           pick: function (it)     { return it.contact || ''; } },
  { header: 'Màn hình',          pick: function (it)     { return joinPart_([ctx_(it).viewCode, ctx_(it).viewTitle], ' · '); } },
  { header: 'Nhóm màn hình',     pick: function (it)     { return ctx_(it).viewGroup || ''; } },
  { header: 'Phạm vi lọc',       pick: function (it)     { return ctx_(it).scope || ''; } },
  { header: 'Thương hiệu',       pick: function (it)     { return ctx_(it).brand || ''; } },
  { header: 'Kỳ dữ liệu',        pick: function (it)     { return joinPart_([ctx_(it).from, ctx_(it).to], ' → '); } },
  { header: 'Per-day',           pick: function (it)     { return ctx_(it).perday ? 'Có' : 'Không'; } },
  { header: 'Giao diện',         pick: function (it)     { return ctx_(it).theme || ''; } },
  { header: 'Mã thiết bị',       pick: function (it)     { return meta_(it).deviceId || ''; } },
  { header: 'Mã phiên',          pick: function (it)     { return meta_(it).sessionId || ''; } },
  { header: 'Thiết bị',          pick: function (it)     { return deviceKind_(meta_(it).userAgent); } },
  { header: 'Trình duyệt',       pick: function (it)     { return browserName_(meta_(it).userAgent); } },
  { header: 'Nền tảng',          pick: function (it)     { return meta_(it).platform || ''; } },
  { header: 'Ngôn ngữ',          pick: function (it)     { return meta_(it).language || ''; } },
  { header: 'Múi giờ',           pick: function (it)     { return meta_(it).timezone || ''; } },
  { header: 'Độ phân giải',      pick: function (it)     { return meta_(it).screen || ''; } },
  { header: 'Khung nhìn',        pick: function (it)     { return meta_(it).viewport || ''; } },
  { header: 'URL',               pick: function (it)     { return meta_(it).url || ''; } },
  { header: 'Nguồn truy cập',    pick: function (it)     { return meta_(it).referrer || ''; } },
  { header: 'Phiên bản app',     pick: function (it)     { return meta_(it).appVersion || ''; } },
  { header: 'Lần gửi',           pick: function (it)     { return (Number(it.attempts) || 0) + 1; } },
  { header: 'User-Agent',        pick: function (it)     { return meta_(it).userAgent || ''; } },
  { header: 'Trạng thái xử lý',  pick: function ()       { return 'Mới'; } }
];

/** Cột dùng để khử trùng lặp (1-based, khớp vị trí 'Mã phản hồi' ở trên). */
var ID_COLUMN = 2;


/* ─── 3. ĐIỂM VÀO HTTP ────────────────────────────────────────────────────── */

/**
 * Nhận phản hồi từ dashboard.
 * Chấp nhận cả hai dạng payload:
 *   { secret, items: [ {...}, {...} ] }   ← dạng lô (mặc định)
 *   { ...một bản ghi... }                 ← dạng đơn lẻ (tương thích ngược)
 */
function doPost(e) {
  /* Khoá chỉ để giảm rủi ro ghi trùng khi hai request đến sát nhau — không
     phải điều kiện bắt buộc, vì `readExistingIds_` đã khử trùng theo Mã phản
     hồi. Nếu không lấy được khoá trong 10 giây (ví dụ do một lượt gọi khác
     đang chạy), vẫn tiếp tục ghi bình thường thay vì báo lỗi cho người dùng. */
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    locked = lock.tryLock(10000);
  } catch (lockErr) {
    locked = false;
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: 'Payload rỗng' });
    }

    var envelope;
    try {
      envelope = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return json_({ ok: false, error: 'Payload không phải JSON hợp lệ' });
    }

    if (SHARED_SECRET && String(envelope.secret || '') !== SHARED_SECRET) {
      return json_({ ok: false, error: 'Sai mã bí mật' });
    }

    var items = envelope.items;
    if (!items) items = envelope.content ? [envelope] : [];
    if (!Array.isArray(items)) items = [items];
    if (items.length === 0) return json_({ ok: false, error: 'Không có bản ghi nào' });

    /* Chặn payload cố tình gửi hàng nghìn bản ghi trong một request để làm
       đầy Sheet hoặc cạn hạn mức Apps Script. Client hợp lệ chỉ gửi tối đa
       20 bản ghi/lô (xem FeedbackWidget.tsx). */
    if (items.length > MAX_ITEMS_PER_REQUEST) {
      items = items.slice(0, MAX_ITEMS_PER_REQUEST);
    }

    var sheet = getSheet_();
    var existingIds = readExistingIds_(sheet);

    var rows = [];
    var inserted = [];
    var skipped = 0;

    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {};
      var id = String(item.id || '');
      if (!item.content) { skipped++; continue; }
      if (id && existingIds[id]) { skipped++; continue; }   // đã ghi ở lần gửi trước

      rows.push(buildRow_(item, envelope));
      if (id) existingIds[id] = true;
      inserted.push(item);
    }

    if (rows.length > 0) {
      sheet
        .getRange(sheet.getLastRow() + 1, 1, rows.length, COLUMNS.length)
        .setValues(rows);
      notify_(inserted);
    }

    return json_({ ok: true, inserted: rows.length, skipped: skipped });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (locked) {
      try { lock.releaseLock(); } catch (releaseErr) { /* đã hết hạn, bỏ qua */ }
    }
  }
}

/** Kiểm tra sức khoẻ webhook: mở URL /exec trên trình duyệt phải thấy ok:true. */
function doGet() {
  var sheet = getSheet_();
  return json_({
    ok: true,
    service: 'NOIRE Feedback Webhook',
    sheet: sheet.getName(),
    rows: Math.max(0, sheet.getLastRow() - 1),
    time: new Date().toISOString()
  });
}


/* ─── 4. THIẾT LẬP BẢNG TÍNH ──────────────────────────────────────────────── */

/**
 * Chạy MỘT LẦN từ trình soạn thảo Apps Script: tạo tab, ghi tiêu đề, định dạng,
 * đóng băng hàng đầu và bật bộ lọc. Chạy lại cũng an toàn — không xoá dữ liệu.
 */
function setup() {
  var sheet = getSheet_();
  var headers = COLUMNS.map(function (c) { return c.header; });

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var head = sheet.getRange(1, 1, 1, headers.length);
  head.setFontWeight('bold')
      .setBackground('#1A1A1F')
      .setFontColor('#DFBF7A')
      .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);
  sheet.setFrozenRows(1);

  // Cột Nội dung xuống dòng cho dễ đọc; các cột còn lại để mặc định.
  var contentIdx = headers.indexOf('Nội dung') + 1;
  if (contentIdx > 0) {
    sheet.setColumnWidth(contentIdx, 420);
    sheet.getRange(1, contentIdx, sheet.getMaxRows(), 1).setWrap(true);
  }
  sheet.setColumnWidth(1, 150);   // Ghi nhận lúc
  sheet.setColumnWidth(3, 150);   // Thời gian gửi

  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).createFilter();
  }

  SpreadsheetApp.flush();
  Logger.log('Đã thiết lập xong tab "%s" với %s cột.', SHEET_NAME, headers.length);
}

/** Ghi một bản ghi mẫu để kiểm tra đường ống mà không cần mở dashboard. */
function testInsert() {
  var res = doPost({
    postData: {
      contents: JSON.stringify({
        secret: SHARED_SECRET,
        source: 'apps-script-test',
        items: [{
          id: 'FB_TEST_' + Date.now(),
          category: 'feature',
          categoryLabel: '💡 Góp ý tính năng',
          content: 'Bản ghi thử nghiệm từ hàm testInsert().',
          contact: 'test@noire.vn',
          createdAt: new Date().toLocaleString('vi-VN'),
          createdAtISO: new Date().toISOString(),
          context: {
            viewId: 'm0', viewCode: 'M0', viewTitle: 'Scorecard điều hành',
            viewGroup: 'I · KẾT QUẢ KINH DOANH', scope: 'main', brand: 'ALL',
            from: '2026-01', to: '2026-08', perday: false, theme: 'dark'
          },
          meta: { deviceId: 'DV_TEST', sessionId: 'SS_TEST', appVersion: '3.0.0' },
          attempts: 0
        }]
      })
    }
  });
  Logger.log(res.getContent());
}


/* ─── 5. HÀM PHỤ TRỢ ──────────────────────────────────────────────────────── */

function getSheet_() {
  var book = SHEET_ID
    ? SpreadsheetApp.openById(SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  if (!book) {
    throw new Error('Không mở được bảng tính. Hãy điền SHEET_ID hoặc gắn script vào Google Sheet.');
  }

  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, COLUMNS.length)
         .setValues([COLUMNS.map(function (c) { return c.header; })])
         .setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Tập hợp mã phản hồi đã có — chặn ghi trùng khi client gửi lại/sendBeacon. */
function readExistingIds_(sheet) {
  var map = {};
  var last = sheet.getLastRow();
  if (last < 2) return map;

  var values = sheet.getRange(2, ID_COLUMN, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var id = String(values[i][0] || '');
    if (id) map[id] = true;
  }
  return map;
}

function buildRow_(item, envelope) {
  var row = [];
  for (var i = 0; i < COLUMNS.length; i++) {
    var value;
    try {
      value = COLUMNS[i].pick(item, envelope);
    } catch (err) {
      value = '';
    }
    if (value === undefined || value === null) value = '';
    if (typeof value === 'string') value = sanitizeCell_(value);
    row.push(value);
  }
  return row;
}

/**
 * Chống "Formula Injection": một ô bắt đầu bằng = + - @ bị Google Sheets
 * hiểu là công thức và THỰC THI (vd =IMPORTXML(...) có thể rò rỉ dữ liệu ra
 * ngoài). Vì phản hồi đến từ người dùng ẩn danh trên Internet, mọi chuỗi đều
 * phải được ép về dạng văn bản thuần trước khi ghi vào Sheet.
 */
function sanitizeCell_(text) {
  var s = String(text);
  if (s.length > MAX_FIELD_LENGTH) {
    s = s.slice(0, MAX_FIELD_LENGTH) + '… (đã cắt bớt)';
  }
  if (/^[=+\-@]/.test(s)) {
    s = "'" + s; // dấu nháy đơn ép Sheets coi là text, không tính công thức
  }
  return s;
}

function ctx_(item)  { return item && item.context ? item.context : {}; }
function meta_(item) { return item && item.meta ? item.meta : {}; }

function joinPart_(parts, sep) {
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    if (parts[i]) out.push(parts[i]);
  }
  return out.join(sep);
}

/** Chuỗi ISO → Date để Sheets sắp xếp/lọc theo thời gian thật. */
function toDate_(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : d;
}

function browserName_(ua) {
  if (!ua) return '';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Khác';
}

function deviceKind_(ua) {
  if (!ua) return '';
  if (/iPad|Tablet/i.test(ua)) return 'Máy tính bảng';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'Điện thoại';
  return 'Máy tính';
}

function notify_(items) {
  if (!NOTIFY_EMAIL || !items || items.length === 0) return;

  var selected = items.filter(function (it) {
    if (!NOTIFY_ONLY_CATEGORIES || NOTIFY_ONLY_CATEGORIES.length === 0) return true;
    return NOTIFY_ONLY_CATEGORIES.indexOf(String(it.category)) >= 0;
  });
  if (selected.length === 0) return;

  var lines = selected.map(function (it) {
    return [
      '• [' + (it.categoryLabel || it.category) + '] ' + (it.content || ''),
      '  Màn hình: ' + joinPart_([ctx_(it).viewCode, ctx_(it).viewTitle], ' · '),
      '  Liên hệ: ' + (it.contact || '(không cung cấp)'),
      '  Lúc: ' + (it.createdAt || it.createdAtISO)
    ].join('\n');
  });

  try {
    MailApp.sendEmail(
      NOTIFY_EMAIL,
      '[NOIRE Dashboard] ' + selected.length + ' phản hồi mới',
      lines.join('\n\n')
    );
  } catch (err) {
    Logger.log('Không gửi được email thông báo: %s', err);
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
