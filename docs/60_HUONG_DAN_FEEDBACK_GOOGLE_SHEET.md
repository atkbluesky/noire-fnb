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
            │ POST /api/feedback (cùng domain)          │ thử lại tự động
            ▼                                           │
 ┌──────────────────────┐  thất bại / mất mạng  ────────┘
 │ Cổng trung gian      │  api/feedback.ts — chạy PHÍA SERVER trên Vercel
 │ (Vercel Function)    │  kiểm tra nguồn gửi · giới hạn tần suất · làm sạch dữ liệu
 └──────────┬───────────┘
            │ POST kèm mã bí mật (trình duyệt không bao giờ thấy)
            ▼
 ┌──────────────────────┐
 │ Google Apps Script   │
 │      (Web App)       │
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │  Google Sheet        │  1 dòng = 1 phản hồi, 30 cột ngữ cảnh
 └──────────────────────┘
```

> **Vì sao phải qua cổng trung gian?** Mọi thứ trong `src/` — kể cả biến môi trường
> `VITE_*` — đều bị đóng gói vào file JS công khai. Nếu trình duyệt gọi thẳng Apps
> Script thì URL và mã bí mật nằm sẵn trong file JS, ai mở DevTools cũng lấy được
> và ghi thẳng vào Sheet. Qua cổng, hai giá trị này chỉ nằm ở biến môi trường phía
> server trên Vercel.

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

**Chưa cấu hình webhook thì sao?** Hệ thống vẫn chạy bình thường — cổng trả lỗi
503, phản hồi nằm trên máy người dùng ở trạng thái chờ và tự gửi lại khi cấu hình
xong. Người dùng chỉ thấy dòng "Đã lưu trên máy".

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

thành một chuỗi **ngẫu nhiên, dài**. Đừng tự nghĩ ra hay chép ví dụ trên mạng — sinh
bằng lệnh sau (mở terminal ở thư mục dự án):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

```js
var SHARED_SECRET = '<chuỗi vừa sinh>';
```

> Ghi lại chuỗi này — mục 3 sẽ cần dán y hệt vào biến môi trường `FEEDBACK_SECRET`.
> Không bao giờ dán chuỗi này vào file nào trong `src/`, và không commit lên GitHub.

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

Dashboard **không** chứa URL Apps Script hay mã bí mật. Hai giá trị này khai ở biến
môi trường **phía server**, do cổng [`api/feedback.ts`](../api/feedback.ts) đọc:

| Biến | Giá trị |
|---|---|
| `FEEDBACK_WEBHOOK_URL` | Web app URL ở Bước 5 (`https://script.google.com/macros/s/…/exec`) |
| `FEEDBACK_SECRET` | Chuỗi đã đặt cho `SHARED_SECRET` ở Bước 3 |

> ⛔ **Không** đặt tên có tiền tố `VITE_` (kiểu `VITE_FEEDBACK_SECRET`). Vite nhúng
> mọi biến `VITE_*` vào file JS công khai — đúng thứ cổng trung gian sinh ra để tránh.

**Trên Vercel:** Project → **Settings** → **Environment Variables** → thêm hai biến
trên, tick *Production* và *Preview* → **Save** → tab **Deployments** → **Redeploy**.
Nếu còn biến cũ `VITE_FEEDBACK_WEBHOOK_URL` / `VITE_FEEDBACK_SECRET` thì **xoá đi**.

**Chạy máy local:** tạo file `.env.local` ở thư mục gốc dự án (đã nằm trong
`.gitignore`, không bị commit):

```bash
FEEDBACK_WEBHOOK_URL=https://script.google.com/macros/s/…/exec
FEEDBACK_SECRET=<chuỗi bí mật>
```

Rồi chạy lại `npm run dev` — dev server tự gắn cổng `/api/feedback` giống Vercel.

### Cổng trung gian chặn những gì

| Lớp | Tác dụng |
|---|---|
| Chỉ nhận request cùng domain | Trang web khác không nhúng form gửi hộ được |
| Tối đa 60 request / 10 phút / IP | Chặn vòng lặp spam làm đầy Sheet |
| Tối đa 20 bản ghi, 5.000 ký tự nội dung | Chặn payload khổng lồ |
| Ép mọi trường về chuỗi, bỏ trường lạ | Chặn kiểu lách bộ lọc công thức bằng mảng/đối tượng |
| Lỗi chi tiết chỉ ghi log server | Người ngoài không dò được cấu hình |

> Cổng vẫn **công khai** chừng nào dashboard chưa có đăng nhập: công cụ ngoài trình
> duyệt vẫn gọi được trong giới hạn trên. Lớp chặn triệt để là đăng nhập trước khi
> vào dashboard.

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
| Luôn báo "Đã lưu trên máy" | Xem mã lỗi: F12 → **Network** → request `feedback` | Tra các dòng dưới |
| `/api/feedback` trả **503** | Thiếu `FEEDBACK_WEBHOOK_URL` hoặc `FEEDBACK_SECRET`, hoặc chưa Redeploy sau khi thêm | Kiểm tra mục 3, Redeploy trên Vercel |
| `/api/feedback` trả **502** | Apps Script từ chối hoặc không phản hồi | Vercel → Project → **Logs**, tìm dòng `[feedback]` để xem lý do thật |
| Log ghi `Sai mã bí mật` | `SHARED_SECRET` ≠ `FEEDBACK_SECRET` | Sửa cho khớp từng ký tự |
| Log ghi trang HTML thay vì JSON | *Who has access* không phải **Anyone**, URL là `/dev`, hoặc deployment đã bị lưu trữ | Dùng URL `/exec` của deployment đang hoạt động |
| `/api/feedback` trả **403** | Request không phát ra từ chính domain dashboard | Bình thường nếu là công cụ ngoài; nếu từ dashboard thì kiểm tra proxy/domain tuỳ chỉnh |
| `/api/feedback` trả **429** | Một IP gửi quá 60 request trong 10 phút | Chờ 10 phút; hàng đợi tự gửi lại |
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
- **Đổi mã bí mật / đổi URL webhook** (làm ngay nếu nghi bị lộ) — theo đúng thứ tự
  để không lúc nào mất phản hồi:
  1. Sinh chuỗi mới (lệnh ở Bước 3), sửa `SHARED_SECRET` trong Apps Script → Save.
  2. **Deploy → New deployment** (không sửa deployment cũ) → copy URL `/exec` mới.
     Deployment cũ vẫn chạy phiên bản cũ nên dashboard hiện tại chưa bị gián đoạn.
  3. Vercel: cập nhật `FEEDBACK_WEBHOOK_URL` + `FEEDBACK_SECRET` → **Redeploy**.
  4. Gửi thử một phản hồi, thấy dòng mới trên Sheet.
  5. Apps Script: **Deploy → Manage deployments** → chọn deployment cũ → **Archive**.
     URL cũ ngừng hoạt động hẳn.
- **Sao lưu**: File → Tải xuống → `.xlsx`, hoặc bật lịch sử phiên bản của Google Sheet.

---

## 8. Tệp liên quan

| Tệp | Vai trò |
|---|---|
| [`src/components/common/FeedbackWidget.tsx`](../src/components/common/FeedbackWidget.tsx) | Widget + toàn bộ tầng lưu trữ phía client |
| [`api/feedback.ts`](../api/feedback.ts) | Cổng trung gian phía server — giữ URL + mã bí mật, kiểm tra và làm sạch dữ liệu |
| [`vite.config.ts`](../vite.config.ts) | Gắn cổng `/api/feedback` vào dev server khi chạy local |
| [`tools/google_apps_script/feedback_webhook.gs`](../tools/google_apps_script/feedback_webhook.gs) | Mã dán vào Apps Script |
| [`src/App.tsx`](../src/App.tsx) | Nơi gắn `<FeedbackWidget />` vào dashboard |
