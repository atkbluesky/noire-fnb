# 12 · TẦNG L2 — BẢNG SỰ KIỆN (FACT)

> Mỗi bảng **một grain duy nhất**, khai báo rõ ngay đầu mục.
> Đây là nơi phần lớn lỗi phân tích sinh ra nếu không kỷ luật.

---

## 1. `fact_item` — HẠT NHÂN CỦA HỆ THỐNG

**Grain:** 1 dòng = **1 món trong 1 hoá đơn**
**Nguồn:** S01 · **Quy mô hiện tại:** 229.368 dòng (T1–T8/2026)
**Code:** `build_hub.py :: load_items()` + mục 4.1

### Cột gốc giữ lại (`ITEM_COLS`, 17 cột)

`Cửa hàng · Mã hàng · Tên hàng · Nhóm món · Loại món · Mã combo · Mã hoá đơn · Thời gian · Giờ ·
Số lượng · Giá · Giá bán · Thành tiền · Giảm giá · Tổng tiền · Tên CTKM · Mã voucher`

### Cột dẫn xuất

| Cột | Công thức | Ghi chú |
|---|---|---|
| `store · brand · tier · sname` | `map_store(Cửa hàng)` | khớp chính xác qua `ALIAS` |
| `qty` | `Số lượng` | |
| `line_rev` | `Thành tiền` | **doanh thu món trước phí DV & VAT — CHỈ dùng cho cơ cấu menu** |
| `net` | `Tổng tiền` | **= Doanh thu Net, đã xác minh khớp tuyệt đối báo cáo tháng** |
| `ma` | `Mã hàng`.strip() | khoá join với BOM |
| `hour` | 2 ký tự đầu của `Giờ` | |
| `daypart` | `daypart(hour)` | 5 khung giờ |
| `date · dow` | `Thời gian` dạng `%d/%m/%Y` | |
| `nature` | `classify_nature(Tên CTKM)` | 4 bản chất |
| `cogs_unit · has_cogs · cogs_amt` | join BOM theo `ma` | phủ 46,3% |

### Quy tắc nạp bắt buộc

- **Loại dòng tổng:** `store_norm ∈ TOTAL_MARKERS` (`tổng`, `tong`, `tổng:`, `tại chỗ`, `mang về`, `grab`, `corporate`, rỗng).
  Không loại → nhân đôi toàn bộ số liệu.
- **Store không có trong `dim_store` → bị bỏ và chốt QA #2 báo đỏ.** Không tự động cho qua.

> ⚠️ **Đừng nhầm `line_rev` với `net`.** `Thành tiền` là giá trị dòng món trước phí dịch vụ và VAT;
> `Tổng tiền` là Net. Dùng `line_rev` để đo doanh thu chuỗi sẽ lệch 5–12%.

---

## 2. `fact_bill` — bảng kê hoá đơn

**Grain:** 1 dòng = **1 hoá đơn**
**Nguồn:** S02 · **Quy mô:** 73.652 hoá đơn
**Code:** `build_hub.py :: load_bills()` + mục 4.2

### Cột gốc giữ lại (`BILL_COLS`, 19 cột)

`Cửa hàng · Mã hoá đơn · Số HĐ · Số khách · Nguồn · Khu vực · Ngày chứng từ · Giờ vào · Giờ ra ·
Bàn · PTTT · Giảm giá · Chiết khấu · Phiếu GG · Hoa hồng · Tổng tiền · Tên khách · Nhân viên · Số điện thoại`

### Cột dẫn xuất

| Cột | Công thức |
|---|---|
| `net` | `Tổng tiền` |
| `guest` | `Số khách` |
| `date · dow` | `Ngày chứng từ` (đã bỏ `​`) |
| `hour_in · daypart` | 2 ký tự đầu `Giờ vào` |
| `min_in · min_out` | `HH:MM` → phút |
| `dwell` | `min_out − min_in`, **loại giá trị < 0 hoặc > 480 phút** |
| `phone` | `Số điện thoại` sau `clean_txt()` |

### Ba việc làm sạch bắt buộc

1. **Dòng tổng trá hình:** dòng đầu mỗi cửa hàng ghi `TẠI CHỖ` ở cột *Mã hoá đơn* và chứa số cộng dồn
   (1,21 tỷ ở NJFB T7). Lọc bằng `inv_norm ∈ TOTAL_MARKERS` **và** `Số HĐ` rỗng. Đã loại 150 dòng.
2. **Ký tự vô hình:** iPOS xuất ô rỗng thành `​`/`﻿`. `notna()` sẽ báo nhầm là có dữ liệu.
   `clean_txt()` áp cho `Số điện thoại · Tên khách · Nhân viên · Khu vực · Bàn · Nguồn · PTTT`.
   Không làm bước này thì **tỷ lệ nhận diện khách báo 100% thay vì 8,6%**.
3. **Thời gian ngồi bàn phi lý:** âm hoặc > 8 giờ → `NaN`, không đưa vào trung bình.

### Sản phẩm phụ quan trọng

```python
_bidx = BL[["Mã hoá đơn","store","month","net"]]  →  _cache/bill_index.pkl
```

`build_mkt.py` cần file này để join voucher ↔ hoá đơn (chốt QA #11).
Sinh riêng: `python build_hub.py --index`.

---

## 3. `fact_sales_monthly` — ĐỔI VAI THÀNH NGUỒN ĐỐI SOÁT

**Grain:** tháng × cửa hàng · **Nguồn:** S04 · **Code:** `load_monthly()`

Từ v2.0 trở đi đây **không còn là nơi lấy số** — nó là **thước đo kiểm chứng để bắt lỗi ETL**.

Cột đọc: `Số khách · Số HĐ · Doanh thu Gross · Doanh thu Net · Giảm giá · Chiết khấu · Hoa hồng · Phiếu GG`

### Công thức Net đã xác minh 100% trên dữ liệu thật

```
net_sales = gross_sales − disc_giamgia − disc_chietkhau − commission
```

Ban đầu chỉ khớp 84%. Truy ra 17 dòng lệch **đều là The Mett**, độ lệch **bằng đúng cột Hoa hồng**
từng đồng. Thêm `− commission` thì khớp tuyệt đối. The Mett là store duy nhất có hoa hồng
(mặt bằng trung tâm thương mại). → chốt QA #3.

### Hệ quả then chốt

**`Phiếu GG` và `Thuế` KHÔNG bị trừ khỏi Net.** Nghĩa là giá trị voucher đã dùng vẫn nằm nguyên
trong doanh thu — đây chính là **cầu nối để đo đóng góp thật của CRM sang doanh thu ở M8
mà không lo double-count**.

---

## 4. `fact_sales_daily`

**Grain:** ngày × cửa hàng · **Nguồn:** S03 · **Code:** `load_daily()`
Gộp file dải nhiều tháng (`revenue-report-group-by-date T1-T7`) và file tháng lẻ (`revenue_by_stores_per_day Tháng 8`).
Nuôi biểu đồ đường theo ngày ở M1.

---

## 5. Kiến trúc đối soát 3 tầng

```
fact_item  ──rollup──►  net_item   ┐
fact_bill  ──rollup──►  net_bill   ├──►  so với  ──►  fact_sales_monthly (net)
                                    ┘
                    lệch < 0,5%  ⇒  ĐẠT (chốt QA #4)
```

Bảng `recon` trong `data.json` giữ toàn bộ kết quả đối soát theo `month × store`
để module D1 vẽ ra được — đây là bằng chứng khi bị chất vấn số.

**Tháng chưa trọn kỳ tự động bị loại khỏi đối soát** (`PARTIAL`), vì bảng kê ít ngày hơn báo cáo tháng
là chuyện bình thường, không phải lỗi.

---

## 6. Các bảng fact còn lại

| Bảng | Grain | Nguồn | Code | Nuôi module |
|---|---|---|---|---|
| `fact_lead` | 1 lead | S07 | `build_hub.py` mục L | M10 |
| `fact_ads` (Meta) | campaign × tháng | S08 | `build_mkt.py` §1 | M5 |
| `fact_ads` (Google) | campaign × kỳ | S09 | `build_mkt.py` §1b | M5 |
| `fact_voucher` | 1 mã voucher | S11 | `build_mkt.py` §2 | M9 · M10 |
| `fact_oa` | ngày → rollup tháng | S12 | `build_mkt.py` §3 | M8 |
| `fact_member` | ngày | S13 | `build_mkt.py` §4 | M8 |

### `fact_lead` — ba việc làm sạch bắt buộc

- `Number of Guests` đang là text (`"50 pax "`) → parse ra số nguyên.
- `Expected Revenue` ô rỗng → **giữ `NULL`, không điền 0**. Điền 0 sẽ kéo giá trị trung bình lead xuống sai.
- `Outlet` ghi `"NOIRE DINING"` → map về `NDC_NTMK`/`NDC_BKL` qua `dim_store`.

Cột `Source` (MKT / Hotline / …) là **nguồn duy nhất trong toàn hệ thống cho phép quy doanh thu thật
về marketing**. Khi thiếu `Inquiry Date`, code lấy `Start Date` thay thế.

### `fact_voucher` — khử trùng và join

Nhiều file là bản export lại của cùng campaign → khử trùng theo `Mã khuyến mãi`, giữ bản mới nhất theo tên file.
Join với hoá đơn: `Mã giao dịch` ↔ `Mã hoá đơn`.

> **Một hiểu lầm đã được đính chính:** trước đây ghi nhận liên kết voucher ↔ hoá đơn “gần như chết (2/95)”.
> Kiểm tra lại trên toàn bộ 19 file log với đúng khoá join: **tỷ lệ khớp 99,0%** trong phạm vi có dữ liệu hoá đơn.
> 873 lượt không khớp đều là voucher dùng **năm 2025**, trước khi bảng kê bắt đầu — giới hạn phạm vi, không phải lỗi chất lượng.
>
> Điều này đảo hẳn câu chuyện đo lường: **attribution quảng cáo bị chặn ở 8,6% nhận diện khách,
> nhưng attribution qua voucher gần như hoàn hảo.** Cơ chế có phát mã nên được ưu tiên hơn giảm giá
> trực tiếp tại quầy — không chỉ vì kiểm soát chi phí, mà vì **đo được**.

---

## 7. Ba bảng fact còn thiếu để hoàn thiện kiến trúc

| Bảng | Chặn module | Điều kiện |
|---|---|---|
| `fact_cost` (nhân sự · mặt bằng · vận hành theo store × tháng) | M0 Prime Cost · M4 lãi gộp | Kế toán cấp nguồn |
| `dim_zone_table.số_chỗ_ngồi` | M3 vòng quay bàn · doanh thu/chỗ | Ops cung cấp sơ đồ mặt bằng |
| `lib_benchmark` (lift thật của campaign đã chạy) | M6 kịch bản 3 mức | Tích luỹ sau mỗi campaign |
