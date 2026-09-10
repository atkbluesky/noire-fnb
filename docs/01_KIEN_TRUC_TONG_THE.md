# 01 · KIẾN TRÚC TỔNG THỂ — LOGIC CHẠY CỦA HỆ THỐNG

Tài liệu này mô tả **đúng luồng đang chạy trong repo**, ánh xạ sang 5 tầng của Blueprint Phần 1.

---

## 1. Sơ đồ luồng một chiều

```
┌─ L0 · INPUT ─────────────────────────────────────────────────────────────┐
│  L0_input/  (17 nguồn — data_sources.json)                               │
│  POS item · POS bill · daily · monthly · BOM · target · lead             │
│  Meta Ads · Google Ads · Budget · Voucher · Zalo OA · Member · Partner   │
│  KHÔNG SỬA TAY (NT1)                                                     │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │  check_input.py  ← soi trước, chưa đọc nội dung
                             ▼
┌─ L1 · MAPPING ───────────────────────────────────────────────────────────┐
│  DIM_STORE (11 cửa hàng, khớp bằng ALIAS — tuyệt đối không dò chuỗi)     │
│  NATURE_RULES (4 bản chất CTKM)   DAYPARTS (5 khung giờ)                 │
│  TARGET_ALIAS (tên trong file target viết khác POS)                      │
│  dim_product (BOM) · dim_budget · dim_partner                            │
└────────────────────────────┬─────────────────────────────────────────────┘
                             ▼
┌─ L2 · FACT ──────────────────────────────────────────────────────────────┐
│  fact_item  229.368 dòng   grain: 1 món trong 1 hoá đơn   ← HẠT NHÂN     │
│  fact_bill   73.652 dòng   grain: 1 hoá đơn                              │
│  fact_sales_daily · fact_sales_monthly (ĐỐI SOÁT)                        │
│  fact_lead · fact_ads · fact_voucher · fact_oa · fact_member             │
│  ─ làm sạch: loại dòng tổng · map store · ký tự vô hình · dwell ─         │
└────────────────────────────┬─────────────────────────────────────────────┘
                             ▼
┌─ L3 · METRIC (khoá cứng) ────────────────────────────────────────────────┐
│  Net · Guest · TC · TA · AOV · Discount% · Voucher Load                  │
│  MoM · YoY same-store · Achv% · Contribution%                            │
│  CM% · Menu Class · Ad Cost Ratio · Redeem% · Repeat Rate · CPL          │
└──────────────┬──────────────────────────────────┬────────────────────────┘
               │                                  │
               ▼                                  ▼
    ┌─ 11 CHỐT QA ─────────┐          ┌─ L3.5 · BASELINE ENGINE ─┐
    │ fail ⇒ ghi qa_log,   │          │ (chưa dựng — xem P5.5)   │
    │ không âm thầm bỏ qua │          │ nuôi M6 Pre-Analytics    │
    └──────────┬───────────┘          └────────────┬─────────────┘
               ▼                                   ▼
┌─ L4 · OUTPUT ────────────────────────────────────────────────────────────┐
│  data.json (35 khoá)  +  data_mkt.json (26 khoá)                         │
│         └── tools/build_month.py → data_input/monthly/YYYY-MM.xlsx       │
│                    → scripts/build-data.mjs → src/data/*.json            │
│                    → React + Vite → localhost:3001 → Vercel              │
└──────────────────────────────────────────────────────────────────────────┘
```

**Luồng một chiều, không có vòng ngược.** Tầng dưới không bao giờ đọc lên tầng trên.
Ngoại lệ duy nhất đã thiết kế trước: vòng học của `lib_benchmark` (Blueprint 10.5) — chưa dựng.

---

## 2. Ba đảo chiều quan trọng so với thiết kế v1

Đây là điểm dễ hiểu nhầm nhất khi đọc code, cần nắm trước:

**❶ `fact_item` là nguồn chính, `fact_sales_monthly` là nguồn đối soát.**
v1.0 lấy số từ báo cáo tháng. v2.0 trở đi lấy số từ dòng món, rồi **dùng báo cáo tháng để bắt lỗi ETL**.
Trong code: `build_hub.py` chốt QA #4 so `fact_bill` rollup với `MO` (monthly) — lệch >0,5% là báo đỏ.

**❷ Cột `Tổng tiền` chính là Doanh thu Net.** Không phải `Thành tiền`, không phải `Tổng tiền (không VAT)`.
Chọn nhầm cột lệch 5–12%. Trong code: `IT["net"] = num(IT["Tổng tiền"])` và `BL["net"] = num(BL["Tổng tiền"])`.
`Thành tiền` được gán vào `line_rev` và **chỉ dùng cho cơ cấu menu**, không dùng cho doanh thu.

**❸ Pre-analytics không phải tầng L5.** Nó là nhánh thứ hai của L3, đọc thẳng `fact_item`/`fact_bill`.
Nếu đặt sau L4 thì mất chi tiết khung giờ và không trả lời được “TC khung sáng 7–11h là bao nhiêu”.

---

## 3. Hai script ETL — phân vai

| | `build_hub.py` | `build_mkt.py` |
|---|---|---|
| Khối | POS / kết quả kinh doanh | Marketing |
| Nguồn | S01–S07 | S08–S17 |
| Sản phẩm | `data.json` (35 khoá) | `data_mkt.json` (26 khoá) |
| Chốt QA | #1–#9 | #10–#11 |
| Phục vụ module | D1 · M0 · M1 · M2 · M3 · M8 · M9 · M11 · R1 | D2 · M4 · M5 · M6 · M7 · M9 · M10 · R1 |
| Thời gian chạy | 5–8 phút lần đầu, <1 phút nhờ cache | ~1 phút |

**Thứ tự bắt buộc: `build_hub.py` chạy trước.** Nó sinh `_cache/bill_index.pkl` — thứ mà
`build_mkt.py` cần để đo tỷ lệ khớp voucher ↔ hoá đơn (chốt QA #11). Chạy sai thứ tự thì chốt #11 bỏ trống.
`run_pipeline.py` đã khoá đúng thứ tự này.

Có thể sinh riêng chỉ mục hoá đơn mà không chạy hết ETL:

```bash
python build_hub.py --index
```

---

## 4. Cơ chế cache — vì sao chạy lần hai nhanh

`build_hub.py :: cached()` lưu mỗi tháng thành một pickle riêng:

```
_cache/ITEM_2026-01.pkl   _cache/BILL_2026-01.pkl   …
```

Thả file tháng mới → chỉ tháng đó bị đọc từ Excel, các tháng cũ nạp từ pickle.
Cache **tự vô hiệu khi thiếu cột** (đổi `ITEM_COLS`/`BILL_COLS` là nạp lại từ Excel).
Cache **không tự vô hiệu khi bạn sửa nội dung file cũ** — trường hợp đó phải xoá `_cache/` bằng tay.

> Số liệu trông như không cập nhật ⇒ xoá `_cache/` rồi chạy lại. Đây là nguyên nhân số 1 của “sao số không đổi”.

---

## 5. Vì sao đọc Excel bằng `openpyxl read_only`

File bán hàng chi tiết ~60MB. `pd.read_excel` ngốn ~2GB RAM và chết.
`read_xlsx_fast()` dùng `openpyxl.load_workbook(read_only=True)` streaming từng dòng, đỉnh 133MB.
Hàm này cũng nhận `usecols` để chỉ giữ cột cần — xem `ITEM_COLS` (17 cột) và `BILL_COLS` (19 cột).

**Không thay bằng `pd.read_excel` cho hai nguồn này.** Các nguồn nhỏ khác (target, BOM, budget…)
vẫn dùng `pd.read_excel` bình thường.

---

## 6. Tầng trình bày — trạng thái dùng chung

`src/context/FilterContext.tsx` là nơi duy nhất giữ trạng thái toàn app:

| Trạng thái | Ý nghĩa | Module áp dụng |
|---|---|---|
| `scope` = main \| all | main = chỉ `core` + `flagship`; all = thêm satellite + popup | M0 · M1 · M3 · R1 |
| `brand` | ALL \| NCB \| NDC \| NJFB | tất cả module có dữ liệu tách được brand |
| `from` / `to` | khoảng tháng | tất cả |
| `perday` | chuẩn hoá theo số ngày (T7 31 ngày vs T6 30 ngày = chênh cơ học 3,3%) | M0 · M1 · R1 |
| `theme` | dark \| light, lưu `localStorage` | toàn app |
| `activeView` | mã module đang mở | routing |

`aggByMonth` là **điểm tổng hợp duy nhất** — mọi module lấy Net/Guest/TC/TA/AOV/target theo tháng
từ đây, không tự cộng lại. Đây là NT2 được thực thi ở tầng UI.

**Nguyên tắc trung thực về phạm vi lọc:** không phải khối nào cũng tách được theo brand.
`App.tsx` truyền `customNote` xuống `FilterBar` để ghi rõ ngay trên thanh lọc phần nào lọc được —
ví dụ M8 ghi *“Tỷ lệ nhận diện khách và Zalo OA là số liệu toàn chuỗi”*.

---

## 7. Điều kiện “không lệch số” giữa các công cụ

Kiểm toán ở Blueprint Phần 13 phát hiện 6 hệ thống chạy song song, 4 bảng map cửa hàng riêng,
ít nhất 3 cơ sở doanh thu khác nhau. Cách chặn tái diễn trong repo này:

1. **Một `DIM_STORE` duy nhất** — trong `build_hub.py`. Không tool nào tự map lại.
2. **Một định nghĩa Net duy nhất** — cột `Tổng tiền`, ghi rõ ở `13_L3_METRIC.md`.
3. **Một bộ chốt QA duy nhất** — 11 chốt, ghi ra `qa_log_*.txt` mỗi lần chạy.
4. **Một cache duy nhất** — `_cache/`, đổi được bằng biến `NOIRE_CACHE`.
5. **`run_pipeline.py` tự đồng bộ `data*.json` → `src/data/`** — trước đây chép tay nên hai bản dễ lệch.

Tool chuyên sâu bên ngoài (Ads, CRM, Partnership, Basket-RFM) **không viết lại** — chỉ đổi đầu vào
sang đọc `data.json` của Hub. Analytics Hub là nơi **tra số**; các dashboard chuyên sâu là nơi **đào sâu**.
