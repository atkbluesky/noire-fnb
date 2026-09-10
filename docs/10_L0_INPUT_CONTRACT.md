# 10 · TẦNG L0 — HỢP ĐỒNG DỮ LIỆU VÀO

> **Đây là tài liệu bạn mở mỗi tháng.** Thả file đúng chỗ, đúng tên → hệ thống tự lấy.
> Thả sai → `check_input.py` báo lỗi rõ ràng thay vì âm thầm bỏ qua.

---

## 1. Dữ liệu thô nằm ở đâu

Hệ thống tìm **gốc dữ liệu** theo thứ tự ưu tiên sau (`find_root()` trong cả `build_hub.py`, `build_mkt.py`, `check_input.py`):

| Ưu tiên | Gốc | Dùng khi nào |
|---|---|---|
| 1 | biến môi trường `NOIRE_ROOT` | trỏ sang ổ khác / máy khác / server |
| 2 | **`L0_input/` ngay trong dự án** | ← **mặc định, dùng cái này** |
| 3 | thư mục cha của dự án | khi repo nằm trong cây `HIGHGATE` gốc |
| 4 | `D:\PROJECT\3. HIGHGATE 5.2026` | dự phòng máy cũ |

Quy tắc chọn gốc: **ưu tiên gốc có file Excel thật.** Thư mục khung rỗng không được chiếm chỗ
cây dữ liệu thật — nên bạn có thể giữ cả `L0_input/` rỗng lẫn cây HIGHGATE mà không sợ nhầm.

```powershell
# ví dụ trỏ sang ổ khác
$env:NOIRE_ROOT = "E:\NOIRE_DATA"
python run_pipeline.py
```

---

## 2. Cây thư mục `L0_input/`

Cây này **mirror đúng cấu trúc thư mục gốc HIGHGATE** mà ETL đang trông đợi.
Giữ nguyên tên thư mục kể cả số thứ tự và dấu tiếng Việt — đó là khoá tra cứu của code.

```
L0_input/
├── 05 Data Raw/
│   ├── 01 Sales Revenue/
│   │   ├── 1. Bảng Kê HD 2026/        ← S02 · accounting_sale TN.2026.xlsx   [BẮT BUỘC]
│   │   ├── 2. Báo Cáo bán hàng 2026/  ← S01 · Báo cáo bán hàng tháng N.2026.xlsx [BẮT BUỘC]
│   │   ├── Doanh thu 2026/            ← S03 daily + S04 monthly              [BẮT BUỘC]
│   │   ├── Doanh thu 2025/            ←      lịch sử để so YoY
│   │   ├── (file) Noire Sales Target Q3 2026.xlsx          ← S06
│   │   └── (file) DATA- SALE NOIRE- 2026 Lead Tiệc.xlsx    ← S07
│   └── 03 Digital Ads/
│       ├── Facebook Ads/1. Raw Ads 2026/   ← S08 · YYYY-MM ... .xlsx
│       ├── Facebook Ads/2. Raw Ads 2025/
│       └── Google Ads/                     ← S09 · 3 file báo cáo Google
├── 01 Strategic/03 Budget Allocation/      ← S10 · ngân sách quý
├── 02 Products/02 Costing BOM/BOM Update T7.2026/  ← S05 · COGS chuẩn
├── 03 Customer Engagement/02 Loyalty Program/Camp Loyalty report/
│   ├── 01. Data Voucher iPOS/              ← S11 · export voucher log
│   └── 02. Data CRM/
│       ├── 03. KPI Plan/                   ← S14 · KPI CRM quý
│       └── 04. KPI Actual/
│           ├── 01. OA Zalo/                ← S12 · OA Zalo T*.xls
│           └── 02. Member Đăng Ký/         ← S13 · member_actual_iPOS_CRM_v2.xlsx
├── 04 Marketing Campaigns/02 LTO Promotions/
│   ├── 2026 Q2/                            ← S17 · báo cáo LTO đã chạy
│   └── 2026 Q3/                            ← S16 · Pre-Analysis
└── 10 Partnership Analytics/               ← S15 · 00_Danh_Muc_Partnership.xlsx
```

Chi tiết đầy đủ từng nguồn (mẫu tên, sheet, dòng tiêu đề, bẫy, module tiêu thụ) nằm trong
**`data_sources.json`** — đó mới là bản gốc, bảng dưới đây chỉ là bản rút gọn để đọc nhanh.

---

## 3. Bảng 17 nguồn — quy ước tên & tần suất

| Mã | Nguồn | Thư mục | Mẫu tên | Tần suất | Bắt buộc |
|---|---|---|---|---|---|
| S01 | POS bán hàng chi tiết | `2. Báo Cáo bán hàng 2026/` | `Báo cáo bán hàng tháng 8.2026.xlsx` | tháng | ✅ |
| S02 | Bảng kê hoá đơn | `1. Bảng Kê HD 2026/` | `accounting_sale T8.2026.xlsx` | tháng | ✅ |
| S03 | Doanh thu theo ngày | `Doanh thu 2026/` | `revenue-report-group-by-date*.xlsx` | tháng | — |
| S04 | Doanh thu theo tháng *(đối soát)* | `Doanh thu 2026/` | `revenue-report tháng 8.2026.xlsx` | tháng | ✅ |
| S05 | BOM / COGS | `BOM Update T7.2026/` | `NOIRE_COGS_CHUAN_ALL_BRANDS_2026_CleanData.xlsx` | khi Bếp cập nhật | — |
| S06 | Sales target | `01 Sales Revenue/` | `Noire Sales Target Q3 2026.xlsx` | quý | — |
| S07 | Lead tiệc | `01 Sales Revenue/` | `DATA- SALE NOIRE- 2026 Lead Tiệc.xlsx` | tuần | — |
| S08 | Meta Ads | `1. Raw Ads 2026/` | `2026-08 ….xlsx` | tháng | — |
| S09 | Google Ads | `Google Ads/` | `Báo cáo chiến dịch.xlsx` + 2 file cụm từ | tháng | — |
| S10 | Ngân sách MKT | `03 Budget Allocation/` | `NOIRE_MKT_Q3_2026_Checked_….xlsx` | quý | — |
| S11 | Voucher iPOS | `01. Data Voucher iPOS/` | `exportVoucherLogOfCampaign_*.xlsx` | tuần | — |
| S12 | Zalo OA | `01. OA Zalo/` | `OA Zalo T8.2026.xls` | tháng | — |
| S13 | Member đăng ký | `02. Member Đăng Ký/` | `member_actual_iPOS_CRM_v2.xlsx` | tháng | — |
| S14 | KPI CRM | `03. KPI Plan/` | `NOIRE Q3. 2026 KPI CRM PhanBoNgay V2.xlsx` | quý | — |
| S15 | Partnership | `10 Partnership Analytics/` | `00_Danh_Muc_Partnership.xlsx` | khi có đối tác mới | — |
| S16 | Pre-Analytics | `2026 Q3/` | `NOIRE_Promotion_Pre-Analysis_Q3_2026.xlsx` | quý | — |
| S17 | Báo cáo LTO đã chạy | `2026 Q2/` | `NOIRE_Bao_Cao_Hieu_Qua_LTO_*.xlsx` | sau campaign | — |

**“Bắt buộc”** = thiếu thì `check_input.py` trả mã lỗi và `build_hub.py` không có dữ liệu để chạy.
Các nguồn còn lại thiếu thì module tương ứng hiện khung rỗng, phần còn lại vẫn chạy.

---

## 4. Cách hệ thống nhận ra “tháng nào”

Không có bảng khai báo tháng. **Tháng được rút thẳng từ tên file** bằng regex:

| Nguồn | Regex | Khớp ví dụ |
|---|---|---|
| S01 · S02 | `(?:tháng\|thang\|T)\s*(\d{1,2})[\.\s]*(\d{4})` | `…tháng 8.2026.xlsx` · `…T8.2026.xlsx` |
| S08 Meta | `(\d{4})-(\d{2})` | `2026-08 report.xlsx` |
| S12 Zalo OA | `T(\d{1,2})\.(\d{4})` | `OA Zalo T8.2026.xls` |

**Hệ quả:** đặt tên sai định dạng → file bị bỏ qua **im lặng** ở bước gom tháng.
Đây là lý do phải chạy `check_input.py` trước — nó in ra đúng dải tháng đã nhận diện được
và cảnh báo tháng bị hụt giữa chuỗi.

---

## 5. Bốn quy tắc bắt buộc khi thả file

**❶ File mới không ghi đè file cũ.** Trùng tên → thêm hậu tố `_v2`. Lịch sử là tài sản.

**❷ Không xoá file cũ.** Chuỗi lịch sử càng dài, phân tích mùa vụ và benchmark càng đúng.

**❸ Ba tầng doanh thu phải đối soát nhau.**
`fact_item` rollup ≈ `fact_bill` rollup ≈ báo cáo tháng. Lệch > 0,5% → chốt QA #4 báo đỏ, **dừng, không tin số**.

**❹ Cửa hàng mới phải khai báo có ý thức.** Store không có trong `DIM_STORE` sẽ làm chốt QA #2 báo đỏ,
không tự động bỏ qua. Xem cách thêm ở [`11_L1_MAPPING_DIM.md`](11_L1_MAPPING_DIM.md).

---

## 6. Chín cái bẫy đã chặn sẵn trong code

Đây là những lỗi đã từng xảy ra trên dữ liệu thật. Code đã xử lý — **liệt kê ở đây để đừng ai gỡ ra**.

| # | Bẫy | Nguồn | Chặn ở đâu |
|---|---|---|---|
| 1 | **Dòng tổng lẫn trong dữ liệu — cả 3 nguồn đều có.** File tháng có `TỔNG`, file bán hàng có `Tổng`, bảng kê ghi `TẠI CHỖ` ở cột *Mã hoá đơn*. Nạp nhầm là nhân đôi toàn bộ | S01·S02·S04 | `TOTAL_MARKERS` + lọc `Số HĐ` rỗng |
| 2 | **Tên cửa hàng không nhất quán.** SKC trong POS là “Café & **Lounge**”; JFB The Crest có **hai dấu cách** trước dấu gạch | S01·S02 | `norm()` + bảng `ALIAS` — tuyệt đối không dò chuỗi |
| 3 | **Ô rỗng của iPOS là ký tự vô hình `\u200b`.** Không làm sạch thì tỷ lệ nhận diện khách báo 100% thay vì 8,6% | S02 | `clean_txt()` |
| 4 | **Export Meta có cả dòng cấp `campaign` lẫn `adset`** (có tháng tách theo tuổi × giới tính). Cộng tất cả ra 549tr thay vì 157tr — sai 3,5 lần | S08 | lọc `Cấp độ phân phối = campaign` |
| 5 | **File `OA Zalo *.xls` thật ra là HTML**, không phải Excel | S12 | `pd.read_html` (cần `lxml`) |
| 6 | **Chiến dịch tuyển dụng nhân sự nằm chung tài khoản quảng cáo** (6,99tr) — không phải marketing thương hiệu | S08 | `HR_PAT`, tách khỏi Ad Cost Ratio |
| 7 | **Báo cáo Google cụm từ tìm kiếm có xen dòng `Tổng số: Chiến dịch`** — không loại là nhân đôi chi phí (6,28tr thay vì 3,14tr) | S09 | lọc chuỗi `Tổng số` |
| 8 | **Sheet ngân sách có dòng trống xen giữa tiêu đề và bảng** — đọc cứng `header=1` ra toàn cột `Unnamed` | S10 | `find_header()` dò theo từ khoá |
| 9 | **Ad Cost Ratio phải tính trên tháng trọn kỳ.** Chi ads T8 đủ tháng nhưng doanh thu T8 mới 18/31 ngày → ra 1,55% thay vì 0,74% thật | S08+S02 | `coverage[].partial` + `LAST_FULL_MONTH` |

Ngoài ra hai bẫy kỹ thuật:

- **Không dùng `pd.read_excel` cho file bán hàng 60MB** → dùng `read_xlsx_fast()` (openpyxl read_only).
- **Sheet `01_COGS_ALL` có tiêu đề ở dòng 4** → `header=3`. Sheet `1. Tổng hợp (Master)` của Pre-Analysis cũng vậy.

---

## 7. Kiểm tra trước khi chạy

```bash
python check_input.py
```

Kết quả in ra:

- gốc dữ liệu đang dùng và trạng thái của nó;
- từng nguồn: `[OK]` / `[TRỐNG]` (không bắt buộc) / `[THIẾU]` (bắt buộc);
- với nguồn theo tháng: dải kỳ nhận diện được + **cảnh báo tháng bị hụt giữa chuỗi**;
- kỳ có đủ mọi nguồn theo tháng;
- sổ thiếu dữ liệu — quyết định module nào chạy được.

Mã thoát `1` nghĩa là còn nguồn bắt buộc chưa có. `run_pipeline.py` vẫn chạy tiếp để bạn thấy
lỗi cụ thể của ETL, nhưng đừng tin số cho tới khi `check_input.py` sạch.

---

## 8. Thêm một nguồn mới — làm gì

1. Tạo thư mục trong `L0_input/` theo đúng cây của tổ chức nguồn.
2. Thêm một khối vào mảng `sources` của `data_sources.json` (id, layer, produces, dir, pattern, feeds_modules, traps).
3. Chỉ khi ETL cần đọc nội dung mới → viết loader trong `build_hub.py` hoặc `build_mkt.py`.
4. Nếu nguồn sinh khoá mới trong JSON → khai báo type trong `src/types/hub.ts` hoặc `mkt.ts`.
5. Cập nhật `docs/14_L4_OUTPUT_CONTRACT.md` và file `docs/modules/<module>.md` tiêu thụ nó.
