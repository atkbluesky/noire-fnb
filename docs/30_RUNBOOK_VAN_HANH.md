# 30 · RUNBOOK VẬN HÀNH — HẰNG THÁNG & ĐƯA LÊN VERCEL

---

## 0. Hai lane — dùng cái nào

| Bạn có gì | Dùng lane | Đọc |
|---|---|---|
| **Dữ liệu thô của tháng mới** *(thường gặp)* | ETL Python → gói tháng | [`16_CAP_NHAT_HANG_THANG.md`](16_CAP_NHAT_HANG_THANG.md) |
| **Excel số liệu đã tổng hợp sẵn** | điền tay vào gói tháng | [`15_PROCESSED_INPUT_CONTRACT.md`](15_PROCESSED_INPUT_CONTRACT.md) |

Cả hai đều kết thúc ở cùng một chỗ: `data_input/monthly/YYYY-MM.xlsx`. Từ đó Node lo phần
còn lại và chạy được cả ở máy local lẫn trên Vercel.

**Lane ETL Python chỉ chạy ở máy local** — nó là nơi *sinh ra* gói tháng, không phải nơi
dashboard đọc số.

---

## 1. Chuẩn bị một lần

```bash
npm install            # đủ cho toàn bộ phần dashboard
pip install openpyxl   # chỉ cần cho ETL Python
```

Không cần `pandas`, không cần `lxml`. `tools/monthly_lib.py` đọc CSV UTF-16 của Meta và file
`OA Zalo *.xls` (thật ra là HTML) bằng thư viện chuẩn của Python.

---

## 2. Quy trình hằng tháng — 5 bước

### Bước 1 · Thả dữ liệu thô vào đúng thư mục

Bảng đầy đủ ở [`16_CAP_NHAT_HANG_THANG.md`](16_CAP_NHAT_HANG_THANG.md) §1. Tóm tắt:

| Thả vào | Tên file |
|---|---|
| `09 Tracking Sales Tool/` | `NOIRE_Tracking_Sales_2026.xlsx` *(đã chạy lại tới tháng mới)* |
| `05 Data Raw/1. Sales Revenue/2. Báo Cáo bán hàng 2026/` | `Báo cáo bán hàng tháng 9.2026.xlsx` |
| `05 Data Raw/1. Sales Revenue/1. Bảng Kê HD 2026/` | `accounting_sale T9.2026.xlsx` |
| `05 Data Raw/3. Digital Ads/Facebook Ads/1. Raw Ads 2026/` | `2026-09_report.xlsx` |
| `05 Data Raw/3. Digital Ads/Google Ads/` | `Tháng 9.2026/` (5 file báo cáo) |
| `05 Data Raw/4. Social Media/Facebook/` | `Tháng 9.2026/<BRAND>/*.csv` |
| `05 Data Raw/2. Data Khách Hàng CRM/…/01. OA Zalo/` | `OA Zalo T9.2026.xls` |
| `05 Data Raw/2. Data Khách Hàng CRM/…/02. Member Đăng Ký/` | `member_actual_iPOS_CRM_updateT9.2026.xlsx` |
| `05 Data Raw/Promotion-AGG/` → `L0_input/03_MARKETING/08_Bao_Cao_MKT_Thang/` | `NOIRE_Bao_Cao_Promotion AGG - MKT_T9-2026.xlsx` |
| `05 Data Raw/Partnership/` | `eVoucher … _T9.2026.xlsx` |
| `05 Data Raw/10. Booking & Event/` | `NOIRE Booking Tiec Sales 2026.xlsx` *(ghi đè bản cũ)* |

**Đặt tên đúng quy ước là điều kiện đủ.** Script dò tháng trong TÊN file và TÊN thư mục.
Sai tên thì script báo "không thấy … của 2026-09" chứ không âm thầm lấy nhầm tháng khác.

### Bước 2 · Dựng gói tháng

```bash
python tools/build_month.py 2026-09
```

Xem trước mà chưa ghi file: thêm `--dry`. Dựng lại toàn bộ: `--all`.

Script in ra từng khối đọc được. Khối nào thiếu nguồn thì ghi `– chưa có dữ liệu` và **giữ
nguyên** phần đã có trong file tháng đó — chạy lại không xoá mất phần nhập tay.

Thời gian: khoảng 1 phút cho một tháng (đọc bảng kê hoá đơn là phần lâu nhất).

### Bước 3 · Đọc các chốt QA rồi mới tin số

```bash
npm run build:data
```

Chốt nào ✖ thì xử lý theo [`40_QA_GATES.md`](40_QA_GATES.md) **trước khi** gửi số cho ai.
Chốt 1–4 đỏ thì build tự dừng — Vercel cũng sẽ báo lỗi deploy.

### Bước 4 · Xem thử ở máy local

```bash
npm run dev          # → http://localhost:3001
```

Mở tab **D1 · Kho dữ liệu & QA** trước.

### Bước 5 · Đẩy lên

```bash
git add data_input && git commit -m "so lieu T9.2026" && git push
```

---

## 3. Xem kết quả

```bash
npm run dev          # → http://localhost:3001
```

Bản HTML tĩnh chạy offline **đã ngừng dùng** (10/09/2026) và nằm trong `_archive/`:
nó dựng từ `data.json` ở gốc dự án, không phải từ `data_input/`, nên số có thể lệch
với bản web. Cần gửi báo cáo cho người ngoài thì dùng nút **In Báo Cáo** trên thanh
tiêu đề để xuất PDF từ chính bản web.

---

## 4. Đưa lên Vercel — Excel đẩy lên GitHub, Vercel tự dựng

Từ khi có **lane dữ liệu đã xử lý** ([`15_PROCESSED_INPUT_CONTRACT.md`](15_PROCESSED_INPUT_CONTRACT.md)),
Vercel **tự đọc Excel và dựng lại số** — không cần chạy Python, không cần commit JSON.

```
   data_input/01_master.xlsx · 02_snapshot.xlsx · monthly/YYYY-MM.xlsx
            │
            ▼
   git add data_input && git commit && git push
            │
            ▼
   Vercel kéo repo từ GitHub
            │
     npm run build
       ├─ prebuild → scripts/build-data.mjs → src/data/*.json   (Node · 0,7 giây)
       └─ tsc && vite build
            │
            ▼
        deploy xong
```

**Thứ bạn commit hằng tháng là file Excel, không phải JSON.**
`src/data/data.json` và `data_mkt.json` nằm trong `.gitignore` — chúng là sản phẩm sinh ra.

### Chốt QA vẫn chặn được, ngay trên Vercel

Đây là lý do trước đây phải chạy ETL ở máy: sợ file lỗi đẩy thẳng số sai lên bản dùng chung.
Loader Node giải quyết bằng cách **thoát mã 1 khi chốt gác cổng (#1–#4) không đạt** →
Vercel báo build failed và **giữ nguyên bản deploy cũ**. Không có chuyện số sai lên production im lặng.

Ngược lại, nếu loader gặp lỗi kỹ thuật mà bản JSON cũ vẫn còn, nó giữ bản cũ và cho build tiếp —
app không bao giờ trắng trang vì một file Excel hỏng.

### Thiết lập lần đầu

```bash
git init
git add .
git commit -m "NOIRE Analytics Hub v3.0"
git remote add origin https://github.com/<tài-khoản>/<repo>.git
git push -u origin main
```

Rồi trên vercel.com: **Add New → Project → Import Git Repository**.

**Repo git nằm ở thư mục cha `Code System/`**, nên khi tạo project phải đặt
**Root Directory = `Project_/Dashboard System FnB`**. Bỏ qua bước này thì Vercel không thấy
`package.json` và build fail ngay.

Vercel tự nhận Vite qua `vercel.json`, không cần cấu hình gì thêm — **không** biến môi
trường, **không** Python runtime.

`.gitignore` đã loại `node_modules/`, `dist/`, `_cache/`, `L0_input/`, `_archive/`,
`qa_log_*.txt` và bốn file JSON sinh ra trong `src/data/` — repo chỉ còn code, tài liệu và
bộ Excel trong `data_input/`.

### Cấu hình Vercel hiện tại

```json
{ "framework": "vite", "buildCommand": "npm run build", "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

`.vercelignore` loại thêm `L0_input/` · `tools/` · `docs/` · `_archive/` và script Python
khỏi gói deploy. **`data_input/` và `data_contract.json` PHẢI được giữ** — đó là đầu vào của
bước `prebuild`; loại nhầm là build fail với lỗi "không thấy thư mục data_input/".

### Dựng lại từ dữ liệu thô

Khi bạn có file gốc iPOS/Meta/Google và muốn dựng lại từ đầu:

```bash
python tools/build_month.py 2026-09   # dữ liệu thô → data_input/monthly/2026-09.xlsx
npm run build:data                    # Excel → src/data/*.json
```

---

## 5. Sự cố thường gặp

| Hiện tượng | Nguyên nhân | Xử lý |
|---|---|---|
| **Số không đổi sau khi thả file mới** | cache pickle tháng cũ vẫn được dùng | xoá `_cache/` rồi chạy lại |
| Chốt QA #11 bỏ trống | sheet `voucher_join` chưa nộp cho tháng đó | bổ sung sheet vào gói tháng |
| Chốt QA #15 đỏ | `daypart`/`channel` còn là bản dựng từ export thiếu ngày | `python tools/build_month.py <tháng>` |
| Chốt QA #14 báo "dòng lạc tháng" | chép gói tháng cũ, quên xoá cột `month` | xoá trắng cột `month` — loader tự điền từ tên file |
| Chốt QA #2 báo tên chưa map | POS có cửa hàng mới, hoặc đổi tên | copy nguyên văn tên trong log vào `DIM_STORE` |
| Chốt QA #4 lệch một store | đối soát rollup vs báo cáo tháng | xem bảng `recon` ở tab D1, truy về đúng `month × store` |
| `check_input.py` báo `[THIẾU]` dù đã thả file | tên file sai định dạng tháng | đối chiếu regex ở `10_L0_INPUT_CONTRACT.md` §4 |
| Dashboard mở ở tháng cũ | tháng mới nhất chưa trọn kỳ | đúng thiết kế — mở ở `LAST_FULL_MONTH` |
| ETL báo `MemoryError` | ai đó đổi sang `pd.read_excel` cho file 60MB | giữ nguyên `read_xlsx_fast()` |
| App React hiện số cũ | quên dựng lại JSON từ `data_input/` | `npm run build:data` |
| ETL đọc nhầm gốc dữ liệu | có nhiều cây dữ liệu trên máy | đặt `NOIRE_ROOT`, hoặc xem dòng `Gốc dữ liệu` mà `check_input.py` in ra |

---

## 6. Nhật ký chạy

Mỗi lần chạy sinh `qa_log_YYYYMMDD_HHMM.txt` ghi lại toàn bộ:
nguồn đã nạp · số dòng loại bỏ · store chưa map · độ phủ COGS · kết quả 11 chốt · tóm tắt Net/Guest/TC/TA/AOV theo tháng.

**Đây là bằng chứng khi có ai chất vấn con số.** Giữ lại, đừng dọn.

---

## 7. Nhịp vận hành gợi ý

| Khi nào | Việc |
|---|---|
| Hằng tuần | thả voucher log + lead tiệc · chạy `--hub-only` để cập nhật M10 |
| Đầu tháng (sau khi POS chốt sổ) | đủ 3 file bắt buộc → chạy full pipeline → đọc QA → push |
| Hằng quý | cập nhật target + ngân sách + pre-analytics (S06 · S10 · S16) |
| Khi Bếp cập nhật BOM | thả S05 → chạy lại → theo dõi chốt #8 tiến tới 90% |
| Sau mỗi campaign | thả báo cáo LTO (S17) — chuẩn bị cho `lib_benchmark` ở P5.5 |
