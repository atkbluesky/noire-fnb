# 60 · Hướng dẫn cấu hình kho lưu trữ Ý kiến đóng góp (Google Sheets)

> Đối tượng: người vận hành dashboard. Không cần biết lập trình.
> Thời gian thực hiện: ~10 phút, chỉ làm **một lần**.

---

## 1. Hệ thống hoạt động thế nào

```
 Người dùng bấm "Feedback"
        │
        ▼
 ┌──────────────────────┐   ghi ngay, không bao giờ mất
 │  LocalStorage (máy)  │◄──────────────────────────────┐
 └──────────┬───────────┘                               │
            │ POST (JSON)                               │ thử lại tự động
            ▼                                           │
 ┌──────────────────────┐  thất bại / mất mạng  ────────┘
 │ Google Apps Script   │
 │      (Web App)       │
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │  Google Sheet        │  1 dòng = 1 phản hồi, 30 cột ngữ cảnh
 └──────────────────────┘
```

**Local-first**: phản hồi được lưu vào máy người dùng **trước**, sau đó mới đẩy lên
Sheet. Nếu mạng hỏng, bản ghi nằm trong hàng đợi và tự gửi lại khi:

| Thời điểm | Cơ chế |
|---|---|
| Mở lại dashboard | flush lúc widget khởi tạo |
| Có mạng trở lại | sự kiện `online` |
| Quay lại tab | `visibilitychange` |
| Đang mở app | quét nền mỗi 60 giây |
| Rời trang / đóng tab | `navigator.sendBeacon` |

Mỗi lần thử cách nhau xa dần (20s → 40s → 80s … tối đa 15 phút), tối đa 8 lần.
Apps Script khử trùng lặp theo **Mã phản hồi**, nên gửi lại nhiều lần cũng chỉ
sinh một dòng duy nhất trên Sheet.

**Chưa cấu hình webhook thì sao?** Hệ thống vẫn chạy bình thường — phản hồi lưu
trên máy, không báo lỗi cho người dùng. Cấu hình webhook chỉ là bật thêm lớp
đồng bộ đám mây.

---

## 2. Tạo Google Sheet và dán mã

### Bước 1 — Tạo bảng tính

1. Mở <https://sheets.new> → đặt tên, ví dụ **NOIRE · Feedback Dashboard**.
2. Menu **Tiện ích mở rộng (Extensions)** → **Apps Script**.

### Bước 2 — Dán mã webhook

1. Xoá toàn bộ nội dung mặc định của `Code.gs`.
2. Mở file [`tools/google_apps_script/feedback_webhook.gs`](../tools/google_apps_script/feedback_webhook.gs)
   trong repo, **copy toàn bộ** và dán vào.
3. Ctrl+S để lưu.

### Bước 3 — Đặt mã bí mật

Ở đầu file vừa dán, sửa dòng:

```js
var SHARED_SECRET = '';
```

thành một chuỗi ngẫu nhiên do bạn tự đặt, ví dụ:

```js
var SHARED_SECRET = 'NOIRE-fb-2026-x7k2m9';
```

> Ghi lại chuỗi này — bước 4 sẽ cần dán y hệt vào dashboard.
> Để trống cũng chạy được, nhưng ai biết URL cũng ghi được vào Sheet của bạn.

**Tuỳ chọn — nhận email khi có báo lỗi:**

```js
var NOTIFY_EMAIL = 'quangdai122@gmail.com';
var NOTIFY_ONLY_CATEGORIES = ['bug'];   // [] = nhận email cho MỌI phân loại
```

### Bước 4 — Chạy `setup()` một lần

1. Trên thanh công cụ Apps Script, chọn hàm **`setup`** trong danh sách thả xuống.
2. Bấm **Run (Chạy)**.
3. Google hỏi quyền: **Review permissions** → chọn tài khoản → *Advanced* →
   *Go to … (unsafe)* → **Allow**.
   (Cảnh báo "unsafe" là bình thường với script tự viết chưa qua thẩm định Google.)
4. Quay lại bảng tính: tab **Feedback** đã xuất hiện với 30 cột tiêu đề, hàng đầu
   đóng băng và có bộ lọc.

### Bước 5 — Deploy thành Web App

1. Góc phải trên: **Deploy** → **New deployment**.
2. Bấm biểu tượng ⚙ cạnh *Select type* → chọn **Web app**.
3. Điền:
   - **Description**: `NOIRE Feedback v1`
   - **Execute as**: **Me (địa chỉ email của bạn)**
   - **Who has access**: **Anyone** ← **bắt buộc**, nếu chọn khác dashboard sẽ không gửi được
4. **Deploy** → copy **Web app URL**. Dạng:

```
https://script.google.com/macros/s/AKfycb....../exec
```

> ⚠️ Phải là link kết thúc bằng `/exec`, **không phải** `/dev`.

### Bước 6 — Kiểm tra webhook sống

Dán URL đó vào trình duyệt. Thấy JSON như dưới là đạt:

```json
{"ok":true,"service":"NOIRE Feedback Webhook","sheet":"Feedback","rows":0,"time":"..."}
```

---

## 3. Nối dashboard vào webhook

Chọn **một** trong hai cách.

### Cách A — Biến môi trường (khuyến nghị, dùng cho Vercel)

**Chạy máy local:** tạo file `.env.local` ở thư mục gốc dự án:

```bash
VITE_FEEDBACK_WEBHOOK_URL=https://script.google.com/macros/s/AKfycb....../exec
VITE_FEEDBACK_SECRET=NOIRE-fb-2026-x7k2m9
```

Rồi chạy lại `npm run dev`.

**Trên Vercel:** Project → **Settings** → **Environment Variables** → thêm hai
biến cùng tên ở trên, tick cả *Production / Preview / Development* → **Save** →
vào tab **Deployments** bấm **Redeploy**.

> Vite chỉ nạp biến môi trường lúc **build**. Thêm biến xong **bắt buộc phải
> deploy lại**, không tự có hiệu lực trên bản đã build.

### Cách B — Dán thẳng vào mã nguồn

Mở [`src/components/common/FeedbackWidget.tsx`](../src/components/common/FeedbackWidget.tsx),
tìm gần đầu file:

```ts
const FALLBACK_WEBHOOK_URL = '';
const FALLBACK_SECRET = '';
```

Điền vào:

```ts
const FALLBACK_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycb....../exec';
const FALLBACK_SECRET = 'NOIRE-fb-2026-x7k2m9';
```

Commit và push — Vercel tự build lại.

> Lưu ý: cách B đưa URL webhook vào mã nguồn công khai trên GitHub. Ai có URL đó
> cũng gửi được dữ liệu lên Sheet (trừ khi có `SHARED_SECRET` — nhưng mã bí mật
> cũng nằm trong file này). Với repo riêng tư thì không sao; repo công khai nên
> dùng **Cách A**.

---

## 4. Nghiệm thu

1. Mở dashboard → bấm nút **FEEDBACK** dọc mép phải.
2. Chọn phân loại, nhập nội dung → **Gửi**.
3. Màn hình cảm ơn hiện dòng **"Đã đồng bộ về Google Sheets."** ✅
4. Mở Google Sheet → tab **Feedback** → dòng mới đã nằm ở cuối bảng.

Nếu dòng trạng thái ghi *"Đã lưu trên máy — hệ thống sẽ tự gửi lại khi có kết nối"*,
xem mục **Xử lý sự cố** bên dưới.

---

## 5. Bảng dữ liệu thu được

Mỗi phản hồi ghi **một dòng, 30 cột**:

| Nhóm | Cột |
|---|---|
| **Định danh** | Ghi nhận lúc · Mã phản hồi · Thời gian gửi · Thời gian (VN) |
| **Nội dung** | Phân loại · Mã phân loại · Nội dung · Liên hệ |
| **Ngữ cảnh dashboard** | Màn hình · Nhóm màn hình · Phạm vi lọc · Thương hiệu · Kỳ dữ liệu · Per-day · Giao diện |
| **Người dùng** | Mã thiết bị · Mã phiên |
| **Kỹ thuật** | Thiết bị · Trình duyệt · Nền tảng · Ngôn ngữ · Múi giờ · Độ phân giải · Khung nhìn · URL · Nguồn truy cập · Phiên bản app · Lần gửi · User-Agent |
| **Vận hành** | Trạng thái xử lý (mặc định `Mới` — bạn tự sửa thành `Đang xử lý` / `Xong`) |

Giá trị lớn nhất của bộ cột này là **ngữ cảnh**: khi ai đó báo "số liệu sai",
bạn biết ngay họ đang đứng ở màn hình nào, lọc thương hiệu nào, kỳ nào — tái hiện
được đúng tình huống mà không cần hỏi lại.

**Mã thiết bị** là chuỗi ẩn danh sinh ngẫu nhiên trên máy người dùng, dùng để gom
nhiều góp ý của cùng một người. Nó **không** chứa thông tin cá nhân.

### Gợi ý khai thác

- **Lọc nhanh**: hàng tiêu đề đã bật bộ lọc — lọc `Mã phân loại = bug` để xem riêng lỗi.
- **Bảng tổng hợp**: Insert → Pivot table, hàng = `Màn hình`, giá trị = COUNT →
  biết màn hình nào bị phàn nàn nhiều nhất.
- **Thêm cột riêng**: cứ chèn thêm cột thủ công ở **bên phải** cột cuối (`Trạng thái xử lý`),
  script chỉ ghi đè đúng 30 cột đầu nên cột của bạn an toàn.

---

## 6. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Luôn báo "Đã lưu trên máy" | Chưa cấu hình URL, hoặc chưa deploy lại sau khi thêm biến môi trường | Kiểm tra mục 3, redeploy trên Vercel |
| Sheet không có dòng nào | *Who has access* không phải **Anyone** | Deploy → Manage deployments → ✏️ → sửa → Deploy |
| Console báo lỗi CORS | URL kết thúc bằng `/dev` thay vì `/exec` | Dùng đúng URL `/exec` |
| Webhook trả `{"ok":false,"error":"Sai mã bí mật"}` | `SHARED_SECRET` ≠ `VITE_FEEDBACK_SECRET` | Sửa cho khớp từng ký tự |
| Sửa mã Apps Script mà không thấy tác dụng | Bản deploy vẫn là bản cũ | Deploy → **Manage deployments** → ✏️ → *Version:* **New version** → Deploy |
| Ghi trùng dòng | Không xảy ra — script khử trùng theo Mã phản hồi | — |

### Công cụ kiểm tra trong Console trình duyệt

Mở dashboard → F12 → tab **Console**:

```js
NOIRE_FEEDBACK.list()       // toàn bộ phản hồi lưu trên máy
NOIRE_FEEDBACK.pending()    // các bản ghi đang chờ gửi lên Sheet
NOIRE_FEEDBACK.flush()      // ép gửi ngay lập tức
NOIRE_FEEDBACK.exportCSV()  // tải toàn bộ về file CSV (mở bằng Excel)
NOIRE_FEEDBACK.config       // xem cấu hình đang áp dụng
NOIRE_FEEDBACK.clear()      // xoá kho trên máy (KHÔNG ảnh hưởng Sheet)
```

`NOIRE_FEEDBACK.exportCSV()` là phương án dự phòng: kể cả webhook chết hoàn toàn,
toàn bộ phản hồi vẫn lấy ra được dưới dạng CSV.

---

## 7. Bảo trì

- **Hạn mức Apps Script** (tài khoản Gmail miễn phí): 20.000 lượt gọi/ngày,
  100 email/ngày. Dashboard nội bộ dùng không tới 1% hạn mức này.
- **Thêm cột mới**: sửa mảng `COLUMNS` trong file `.gs`, chạy lại `setup()`,
  rồi Deploy **New version**.
- **Đổi mã bí mật**: sửa cả `SHARED_SECRET` (Apps Script, nhớ deploy version mới)
  và `VITE_FEEDBACK_SECRET` (Vercel, nhớ redeploy).
- **Sao lưu**: File → Tải xuống → `.xlsx`, hoặc bật lịch sử phiên bản của Google Sheet.

---

## 8. Tệp liên quan

| Tệp | Vai trò |
|---|---|
| [`src/components/common/FeedbackWidget.tsx`](../src/components/common/FeedbackWidget.tsx) | Widget + toàn bộ tầng lưu trữ phía client |
| [`tools/google_apps_script/feedback_webhook.gs`](../tools/google_apps_script/feedback_webhook.gs) | Mã dán vào Apps Script |
| [`src/App.tsx`](../src/App.tsx) | Nơi gắn `<FeedbackWidget />` vào dashboard |
