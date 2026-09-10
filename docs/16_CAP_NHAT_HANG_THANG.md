# 16 · CẬP NHẬT SỐ LIỆU HẰNG THÁNG — MỘT THÁNG, MỘT FILE

> **Câu ngắn nhất:** thả `data_input/monthly/YYYY-MM.xlsx` vào, chạy `npm run build:data`, `git push`. Hết.
>
> Không sửa code. Không đụng `src/`. Không commit JSON.

---

## 0. Ba tầng file — nhớ đúng một hình này

```
data_input/
│
├── 01_master.xlsx          TẦNG A · CHIỀU & KẾ HOẠCH
│                           sửa khi: mở cửa hàng mới · chốt target quý · duyệt ngân sách · thêm đối tác
│                           KHÔNG phải file hằng tháng
│
├── 02_snapshot.xlsx        TẦNG C · BẢNG LUỸ KẾ TOÀN KỲ
│                           product · category · group · heat · zone · staff · payment · dwell · repeat
│                           nộp lại là THAY THẾ toàn bộ, không nối thêm
│
└── monthly/                TẦNG B · SỰ THẬT THEO THÁNG  ← 95% công việc hằng tháng nằm ở đây
    ├── 2026-07.xlsx
    ├── 2026-08.xlsx
    └── 2026-09.xlsx        ← tháng mới chỉ là MỘT file mới
```

**Vì sao tách ba tầng.** Ba loại dữ liệu này có nhịp thay đổi khác nhau. Ép chung một file
thì mỗi tháng phải mở bốn workbook, nối dòng vào hai chục sheet, và không ai dám xoá gì vì
sợ đụng tháng cũ. Tách ra: tháng mới là một file mới, tháng cũ không bị chạm tới.

**Hợp đồng cột đầy đủ:** [`../data_contract.json`](../data_contract.json) — cùng một file mà
`scripts/build-data.mjs` và `tools/*.py` cùng đọc. Sửa schema thì sửa ở đó, không sửa rải rác.

---

## 1. Quy trình 5 bước

### Bước 1 — Thả dữ liệu thô vào đúng chỗ

| Khối | Thư mục nguồn | File cần có |
|---|---|---|
| **Doanh thu · Target · AOV · TC · TA** | `09 Tracking Sales Tool/` | `NOIRE_Tracking_Sales_2026.xlsx` (đã chạy lại tới tháng mới) |
| **POS chi tiết** | `05 Data Raw/1. Sales Revenue/` | `2. Báo Cáo bán hàng 2026/Báo cáo bán hàng tháng N.2026.xlsx`<br>`1. Bảng Kê HD 2026/accounting_sale TN.2026.xlsx` |
| **CRM · Voucher · Zalo OA** | `05 Data Raw/2. Data Khách Hàng CRM/` | `…/01. OA Zalo/OA Zalo TN.2026.xls`<br>`…/02. Member Đăng Ký/member_actual_iPOS_CRM_updateTN.2026.xlsx` |
| **Digital Ads** | `05 Data Raw/3. Digital Ads/` | `Facebook Ads/1. Raw Ads 2026/YYYY-MM_report.xlsx`<br>`Google Ads/Tháng N.2026/` (5 file báo cáo) |
| **Social** | `05 Data Raw/4. Social Media/Facebook/Tháng N.2026/<BRAND>/` | 6 file CSV export từ Meta Business Suite |
| **Booking & Event** | `05 Data Raw/10. Booking & Event/` | `NOIRE Booking Tiec Sales 2026.xlsx` |
| **Partnership** | `05 Data Raw/Partnership/` | `eVoucher … _TN.2026.xlsx` |
| **Promotion · Aggregator · POSM** | `05 Data Raw/Promotion-AGG/` | `NOIRE_Bao_Cao_Promotion AGG - MKT_TN-2026.xlsx` |

**Đặt tên đúng quy ước là điều kiện đủ.** Script dò file theo tháng trong TÊN file và TÊN thư
mục — `Tháng 8.2026`, `T8.2026`, `2026-08`. Đặt sai tên thì script báo "không thấy … của
2026-08" chứ không âm thầm lấy nhầm tháng khác.

### Bước 2 — Dựng gói tháng

```bash
python tools/build_month.py 2026-09
```

Muốn xem trước mà chưa ghi file: thêm `--dry`. Muốn dựng lại toàn bộ các tháng: `--all`.

Script in ra từng khối đọc được. Khối nào thiếu nguồn thì ghi `– chưa có dữ liệu` và **giữ
nguyên** phần đã có sẵn trong file tháng đó — chạy lại không xoá mất phần nhập tay.

Gốc dữ liệu thô: biến môi trường `NOIRE_ROOT`, không có thì script tự suy lên ba cấp thư mục.

> **Không có Python?** Bỏ qua bước này. Chép `data_input/monthly/2026-08.xlsx` thành
> `2026-09.xlsx`, mở ra và thay số bằng tay. Cấu trúc sheet giống hệt nhau.

### Bước 3 — Kiểm tra

```bash
npm run build:data          # in 15 chốt QA
npm run build:data -- --v   # thêm chi tiết từng sheet đọc được
```

Đọc bảng chốt QA. **Chốt 1–4 là chốt gác cổng: fail thì build DỪNG** và Vercel báo lỗi
deploy — thà không deploy còn hơn phát tán số sai. Chốt 5–15 fail thì vẫn build nhưng
hiện đỏ ở tab D1.

### Bước 4 — Xem thử

```bash
npm run dev                 # → http://localhost:3001
```

Mở tab **D1 Kho dữ liệu & QA** trước. Chốt nào đỏ thì xử lý trước khi tin số.

### Bước 5 — Đẩy lên

```bash
git add data_input && git commit -m "so lieu T9.2026" && git push
```

Vercel kéo repo → `npm run build` → bước `prebuild` chạy `scripts/build-data.mjs` đọc
`data_input/` sinh `src/data/*.json` (0,7 giây) → deploy. **Không cần Python trên Vercel.**

---

## 2. Sáu quy tắc điền số

**❶ Cột `month` để trống cũng đúng.** Loader lấy tháng từ **TÊN FILE**. Đây chính là cơ chế
khiến "mỗi tháng một file" chạy được: bạn không phải gõ lại `2026-09` vào từng dòng của
hai chục sheet. Nếu bạn có điền mà điền lệch tháng của file, **chốt #14 sẽ bắt** — vì lỗi
copy-paste sót là cách phổ biến nhất để nhân đôi số của một tháng.

**❷ Ô trống ≠ số 0.** Trống nghĩa là *chưa đo được* — màn hình hiện `—`. Số 0 nghĩa là *đã
đo và bằng không*. Ví dụ: Zalo Ads chưa chạy thì **để trống**, đừng điền 0; điền 0 là khai
rằng đã chạy và không tốn đồng nào.

**❸ Đừng điền cột dẫn xuất.** `ta` · `aov` · `cm_pct` · `mclass` · `rate` · `d_bill` · `cpa` ·
`cpr` · `er` · `net_follow` · `take_rate` — loader tự tính. Điền tay sẽ bị ghi đè, và nếu
công thức của bạn khác thì số sẽ lệch với phần còn lại của hệ thống.

**❹ Giữ nguyên tên sheet và tên cột.** Cột lạ được bỏ qua im lặng — thoải mái thêm cột ghi
chú riêng. Sheet lạ thì **chốt #14 báo** để bạn biết mình gõ sai tên sheet chứ không phải
loader bỏ quên.

**❺ Ngày `YYYY-MM-DD`, tháng `YYYY-MM`.** Loader nhận cả ô Date của Excel.

**❻ Ô công thức đọc theo kết quả.** Không cần dán-giá-trị trước khi nộp.

---

## 3. Nộp lại bản sửa

Đặt tên `2026-09_v2.xlsx` và để **cạnh** file gốc. Loader đọc theo thứ tự alphabet nên file
`_v2` đọc sau và **thắng** ở mọi khoá tự nhiên trùng nhau. File cũ giữ nguyên làm bằng chứng.

Nếu muốn thay hẳn: xoá file cũ đi cũng được — không có gì phụ thuộc vào nó.

---

## 4. Việc chỉ làm khi có thay đổi

### Mở cửa hàng mới

Thêm **một dòng** vào sheet `dim_store` của `01_master.xlsx`:

| code | brand | tier | name | open |
|---|---|---|---|---|
| `NDC_BKL` | NDC | flagship | NDC · The Berkley | 2026-08 |

Rồi thêm alias tên POS vào `STORE_ALIAS` trong [`../tools/monthly_lib.py`](../tools/monthly_lib.py)
để ETL nhận ra cửa hàng đó trong file export.

Nếu số liệu có cửa hàng chưa khai ở `dim_store`, **chốt #2 báo đỏ và build DỪNG** — không
âm thầm bỏ qua.

### Target quý mới

Nối dòng vào `dim_target` của `01_master.xlsx`: `month` · `store` · `target`. Được phép khai
trước cho tháng tương lai.

`tools/build_month.py` cũng tự bóc target từ sheet `By Month` của file Tracking Sales và ghi
vào gói tháng — nên nếu file tracking đã có target thì bước này tự xong. Target của nhóm
`Others · 9 Stellars + Gateway` gộp ba cửa hàng nên không tách được, vẫn phải khai tay ở master.

### Ngân sách mới

`budget_brand` · `budget_extra` · `budget_channel` · `budget_store` trong `01_master.xlsx`.
Cột tên `YYYY-MM` là ngân sách của tháng đó.

---

## 5. Khối nào lấy từ đâu — bảng tra nhanh

| Sheet trong gói tháng | Nguồn thô | Module dùng |
|---|---|---|
| `store_month` · `daily` · `coverage` · `dim_target` | Tracking Sales Tool → `Data_Daily`, `By Month` | M0 · M1 |
| `channel` · `daypart` · `identify` · `recon` | Bảng kê hoá đơn `accounting_sale` | M3 · M9 · D1 |
| `nature` | Báo cáo bán hàng (cột `Tên CTKM`) | M8 |
| `ads_month` · `ads_brand` · `ads_objective` · `ads_campaign_detail` | Meta `YYYY-MM_report.xlsx` | M5 |
| `ads_google` · `gads_channel` · `gads_kw` | Google Ads `Tháng N.YYYY/` | M5 |
| `social_month` | Fanpage CSV `Tháng N.YYYY/<BRAND>/` | M6 |
| `oa` | `OA Zalo TN.YYYY.xls` | M9 |
| `member` | `member_actual_iPOS_CRM_updateTN.YYYY.xlsx` | M9 |
| `aggregator` · `budget_nonmedia` | `NOIRE_Bao_Cao_Promotion AGG` → sheet `Aggregator` C2, sheet `Budget` C4 | M8 · M4 |
| `booking` → `lead_month` · `lead_source` · `lead_type` | `NOIRE Booking Tiec Sales 2026.xlsx` → `Sales Info` | M11 |
| `partner_month` | `eVoucher … _TN.YYYY.xlsx` | M10 |
| `voucher_month` · `voucher_join` | Log voucher iPOS (lane cũ) | M9 |

---

## 6. Bảy cái bẫy script đã chặn sẵn

Đây là những chỗ số đã từng sai. Biết để không gỡ bỏ đoạn code chặn chúng.

1. **Dòng TỔNG nằm lẫn trong dữ liệu — cả ba nguồn POS đều có.** Bảng kê ghi `TẠI CHỖ` /
   `MANG VỀ` ngay ở cột *Mã hoá đơn*. Nạp nhầm là nhân đôi toàn bộ.

2. **Từ T8/2026 iPOS xuất mỗi cửa hàng một sheet, rồi thêm sheet `Tất cả cửa hàng` ở cuối.**
   Đọc sheet đầu tiên chỉ lấy được **một** cửa hàng; đọc hết mọi sheet thì **cộng đôi**.
   Quy tắc đã cài: có sheet tổng thì chỉ đọc sheet tổng.

3. **Export Meta có cả dòng cấp `campaign` lẫn `adset`**, vài tháng còn tách theo tuổi ×
   giới tính. Cộng tất cả ra gấp 3,5 lần số thật. Chỉ giữ `Cấp độ phân phối = campaign`.

4. **Mọi báo cáo Google xen dòng `Tổng số: …`.** Không loại thì đứng đầu mọi bảng xếp hạng
   là mấy dòng tổng và chi phí bị nhân đôi.

5. **File `OA Zalo *.xls` mang đuôi Excel nhưng ruột là HTML.** Mở bằng openpyxl sẽ ném lỗi
   khó hiểu — script đọc bằng trình phân tích HTML của thư viện chuẩn.

6. **CSV Fanpage của Meta mã hoá UTF-16, dòng đầu là `sep=,`, dòng hai là tựa đề biểu đồ.**
   Đọc thẳng bằng `csv` mặc định ra toàn ký tự rác.

7. **Ô "rỗng" của iPOS là ký tự vô hình `U+200B`, không phải chuỗi rỗng.** Không làm sạch
   thì tỷ lệ nhận diện khách báo 100% thay vì 9,8%.

Ngoài ra: **iPOS đổi tên cột giữa các kỳ export** — T7 dùng `Thời gian` / `Mã hoá đơn`,
T8 dùng `Ngày` / `Hoá đơn`; dòng tiêu đề lúc ở dòng 1, lúc ở dòng 2. Script dò cột theo
danh sách bí danh và dò dòng tiêu đề theo nội dung, không đếm dòng cứng.

---

## 7. Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| `✖ 2. Mọi cửa hàng khớp dim_store` — build dừng | Cửa hàng mới chưa khai | Thêm dòng vào `dim_store` + alias trong `monthly_lib.py` |
| `✖ 14 … dòng lạc tháng` | Cột `month` trong file `2026-09.xlsx` ghi `2026-08` | Xoá trắng cột `month` — loader tự điền từ tên file |
| `✖ 15. Khối POS phụ khớp store_month` | `daypart`/`channel` còn là bản dựng từ export thiếu ngày | Chạy lại `python tools/build_month.py <tháng>` |
| `✖ 7. Rollup khớp báo cáo tháng` | Bảng kê hoá đơn thiếu ngày so với báo cáo tháng | Xuất lại bảng kê đủ tháng |
| `✖ 8. Độ phủ giá vốn` | 1.200 SKU chưa có COGS | Bổ sung BOM — đây là điểm chặn của toàn bộ tầng biên lợi nhuận |
| Số social không đổi sau khi nộp | Thư mục Fanpage đặt sai tên tháng | Đổi thành `Tháng N.YYYY` |
| `không thấy báo cáo Meta Ads của 2026-09` | File chưa đặt đúng `YYYY-MM_report.xlsx` | Đổi tên file export |

---

## 8. Lệnh tra nhanh

```bash
python tools/build_month.py 2026-09         # dựng gói một tháng
python tools/build_month.py 2026-08 --dry   # xem trước, không ghi file
python tools/build_month.py --all           # dựng lại mọi tháng có trong nguồn

npm run build:data                          # data_input/ → src/data/*.json + 15 chốt QA
npm run build:data -- --v                   # thêm chi tiết từng sheet
npm run dev                                 # localhost:3001 (tự chạy build:data trước)
npm run build                               # build production (Vercel dùng lệnh này)
```

---

**Xem thêm:** [`15_PROCESSED_INPUT_CONTRACT.md`](15_PROCESSED_INPUT_CONTRACT.md) — hợp đồng
cột từng sheet · [`40_QA_GATES.md`](40_QA_GATES.md) — 15 chốt kiểm tra ·
[`30_RUNBOOK_VAN_HANH.md`](30_RUNBOOK_VAN_HANH.md) — vận hành toàn hệ thống.
