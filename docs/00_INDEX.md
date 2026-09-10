# NOIRE ANALYTICS HUB — BẢN ĐỒ TÀI LIỆU HỆ THỐNG

**Phiên bản tài liệu:** 2.0 · 10/09/2026 — cấu trúc `data_input/` ba tầng, một tháng một file
**Đối tượng:** người vận hành hệ thống + người nâng cấp code
**Quan hệ với Blueprint:** `00_BLUEPRINT_He_Thong_Dashboard_NOIRE.md` là tài liệu **kiến trúc và lý do**.
Bộ `docs/` này là tài liệu **hiện trạng code** — mô tả đúng những gì đang chạy trong repo, ánh xạ 1-1 sang blueprint.

> Blueprint trả lời *“vì sao thiết kế như vậy”*. Bộ docs này trả lời *“nó nằm ở dòng nào, đọc file nào, sửa ở đâu”*.

---

## Đọc theo thứ tự nào

| Bạn đang cần | Đọc file |
|---|---|
| Hiểu tổng thể hệ thống trong 5 phút | [`01_KIEN_TRUC_TONG_THE.md`](01_KIEN_TRUC_TONG_THE.md) |
| **Cập nhật số liệu tháng mới — làm gì, theo thứ tự nào** | [`16_CAP_NHAT_HANG_THANG.md`](16_CAP_NHAT_HANG_THANG.md) ← **bắt đầu ở đây** |
| Tra cột của một sheet cụ thể | [`15_PROCESSED_INPUT_CONTRACT.md`](15_PROCESSED_INPUT_CONTRACT.md) *(sinh từ `data_contract.json`)* |
| Thả file THÔ từ iPOS/Meta/Google *(lane cũ)* | [`10_L0_INPUT_CONTRACT.md`](10_L0_INPUT_CONTRACT.md) |
| Biết một con số đến từ đâu | [`12_L2_FACT.md`](12_L2_FACT.md) → [`13_L3_METRIC.md`](13_L3_METRIC.md) |
| Sửa/thêm cửa hàng, brand, phân loại CTKM | [`11_L1_MAPPING_DIM.md`](11_L1_MAPPING_DIM.md) |
| Biết `data.json` có gì, ai dùng khoá nào | [`14_L4_OUTPUT_CONTRACT.md`](14_L4_OUTPUT_CONTRACT.md) |
| **Nâng cấp một tab cụ thể (M1, M2…)** | [`20_BAN_DO_MODULE.md`](20_BAN_DO_MODULE.md) → `modules/<Mã>.md` |
| Chạy hệ thống hằng tháng · đưa lên Vercel | [`30_RUNBOOK_VAN_HANH.md`](30_RUNBOOK_VAN_HANH.md) |
| Một chốt QA báo đỏ, xử lý ra sao | [`40_QA_GATES.md`](40_QA_GATES.md) |
| Việc còn lại theo giai đoạn P1–P9 | [`50_LO_TRINH_GIAI_DOAN.md`](50_LO_TRINH_GIAI_DOAN.md) |

---

## Bốn tài sản gốc của hệ thống

| Tài sản | File | Vai trò |
|---|---|---|
| **Nguồn sự thật** | `data_input/**/*.xlsx` | Excel đã xử lý — thứ duy nhất cần commit khi số thay đổi |
| **Bảng master** | sheet `dim_store` trong `01_master.xlsx` + `STORE_ALIAS` trong `tools/monthly_lib.py` | Sửa 2 chỗ là mở được cửa hàng mới |
| **Hợp đồng dữ liệu vào** | **`data_contract.json`** — Node và Python cùng đọc | Sheet, cột, khoá tự nhiên, cột dẫn xuất |
| **Từ điển chỉ số** | `docs/13_L3_METRIC.md` | Công thức khoá cứng, không tab nào được tự tính lại |
| **Hợp đồng dữ liệu ra** | `docs/14_L4_OUTPUT_CONTRACT.md` | 35 khoá `data.json` + 26 khoá `data_mkt.json` |

---

## Năm nguyên tắc chi phối (kế thừa Blueprint Phần 0 + 12.1)

| # | Nguyên tắc | Hệ quả kỹ thuật trong repo |
|---|---|---|
| **NT1** | Raw là bất khả xâm phạm | `L0_input/` chỉ đọc. Mọi làm sạch nằm ở `build_hub.py` §4 |
| **NT2** | Một chỉ số định nghĩa đúng một lần | Công thức chỉ tồn tại ở tầng L3. View **không** được tính lại |
| **NT3** | Thêm dữ liệu không đụng code | Thêm nguồn → sửa `data_sources.json`; thêm store → sửa `DIM_STORE` |
| **NT4** | Mọi con số trace được về dòng raw | KPI ← khoá `data.json` ← bảng fact ← file nguồn (bảng trace ở mỗi `modules/*.md`) |
| **NT5** | Báo cáo tháng là một OUTPUT, không phải quy trình riêng | R2 — Trung tâm báo cáo tháng, xem `50_LO_TRINH_GIAI_DOAN.md` |

---

## Bản đồ file trong repo

```
Dashboard System FnB/
│
├── data_input/                  ← ★ LANE CHÍNH · Excel ĐÃ XỬ LÝ (lên GitHub)
│   ├── 01_master.xlsx                TẦNG A · chiều & kế hoạch — đổi khi có thay đổi
│   ├── 02_snapshot.xlsx              TẦNG C · bảng luỹ kế toàn kỳ
│   └── monthly/YYYY-MM.xlsx          TẦNG B · một tháng MỘT file  ← 95% việc hằng tháng
│
├── data_contract.json           ← ★ HỢP ĐỒNG DỮ LIỆU · nguồn sự thật của schema
├── scripts/build-data.mjs       ← ★ loader Node · chạy cả local LẪN Vercel (0,7s)
│
├── tools/monthly_lib.py         ← ❶ thư viện ETL: alias cửa hàng, đọc CSV UTF-16 / HTML-giả-xls
├── tools/build_month.py         ← ❷ ETL CHÍNH: dữ liệu thô → data_input/monthly/YYYY-MM.xlsx
├── tools/split_to_monthly.py    ← ❸ di trú một lần từ bộ 4 workbook cũ
├── tools/gen_contract_doc.py    ← ❹ sinh lại §4 của docs/15 từ hợp đồng
│
├── L0_input/                    ←   lane THÔ CŨ · file gốc iPOS (chỉ ở máy local)
├── data_sources.json            ←   sổ đăng ký 17 nguồn thô (lane cũ)
├── check_input.py               ←   soi L0 (lane cũ)
├── build_hub.py · build_mkt.py  ←   ETL cũ — giữ để tra cứu, đã được tools/build_month.py thay
│
├── src/data/*.json              ← ❺ hợp đồng L4 — SINH RA TỰ ĐỘNG, không nằm trong git
│
├── src/                         ← ❻ NHÁNH RA A · app React + Vite (localhost → Vercel)
│   ├── context/FilterContext.tsx     bộ lọc dùng chung + tổng hợp theo tháng
│   ├── utils/analytics.ts            ★ engine phân tích: bóc tách nguyên nhân · bất thường · same-store
│   ├── components/                   Card · MetricCard · DataTable · EChartWrapper …
│   └── views/                        15 màn hình = 15 module
│
├── _archive/                    ← ❼ nhánh HTML tĩnh CŨ đã ngừng dùng (10/09/2026)
│                                     _template.html · build_report.py · _vendor/
│                                     NOIRE_Dashboard.html · wireframe · JSON gốc
│
├── _cache/                      ← cache pickle Excel + bill_index.pkl (tự sinh lại)
├── qa_log_*.txt                 ← nhật ký từng lần chạy — bằng chứng khi bị chất vấn số
└── docs/                        ← tài liệu này
```

**Chỉ còn MỘT nhánh ra: React/Vercel.** Nhánh HTML tĩnh đã ngừng dùng và chuyển vào `_archive/`
ngày 10/09/2026 — nó đọc `data.json` ở gốc dự án, tức nguồn số của lane thô, trong khi app đọc
`src/data/*.json` do `scripts/build-data.mjs` dựng từ `data_input/`. Hai nguồn khác nhau nên **có thể lệch số** —
đây là điều kiện đã chốt sau kiểm toán phân mảnh ở Blueprint Phần 13.

---

## Quy ước đọc tài liệu

- `L0 · L1 · L2 · L3 · L4` = 5 tầng kiến trúc (Blueprint Phần 1).
- `M0 … M11 · D1 · D2 · R1` = mã module, cũng chính là mã tab trên sidebar và `activeView` trong code.
- `P1 … P9` = giai đoạn build (Blueprint Phần 12.7).
- `S01 … S17` = mã nguồn dữ liệu trong `data_sources.json`.
- ✅ chạy đủ số · ⚠️ chạy được nhưng thiếu dữ liệu · ⛔ chưa chạy được
