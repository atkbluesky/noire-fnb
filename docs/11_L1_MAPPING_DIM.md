# 11 · TẦNG L1 — BẢNG MASTER (MAPPING)

> Đây là trái tim hệ thống. Sửa tay, không sinh tự động.
> **NT3: mở store mới / thêm brand / thêm CTKM = sửa một dòng ở tầng này, không đụng logic.**

---

## 1. `DIM_STORE` — bảng quan trọng nhất

**Vị trí:** `build_hub.py`, ngay sau hàm `norm()`.

```python
DIM_STORE = [
    # store_code, brand, tier, alias POS (đã chuẩn hoá), tên hiển thị, mở từ
    ("NCB_MET",  "NCB",  "core",      "noire café & bistro - the mett",                "NCB · The Mett",      "2025-01"),
    …
]
```

| store_code | brand | tier | status | mở từ |
|---|---|---|---|---|
| `NCB_MET` | NCB | core | active | 2025-01 |
| `NCB_ET` | NCB | core | active | 2025-10 |
| `NCB_SKC` | NCB | core | active | 2026-02 |
| `NDC_NTMK` | NDC | flagship | active | 2025-10 |
| `NDC_BKL` | NDC | flagship | **chưa thấy trong POS** | 2026-08 |
| `NJFB_CRE` | NJFB | core | active | 2026-04 |
| `NJFB_SSV` | NJFB | core | active | 2025-12 |
| `NCB_GW` · `NCB_9ST` · `NCB_NDC` | NCB | satellite | active | 2025-03 |
| `IFC_SIG` | **OTHER** | popup | closed | 2026-02 → 04 |

### Ba cái bẫy bảng này giải quyết

**❶ SKC trong POS ghi là “Café & Lounge”, không phải “Café & Bistro”.**
Nếu gắn brand bằng cách dò chữ trong tên, SKC rớt khỏi NCB → NCB mất ~785tr/tháng.
→ **Khớp bằng bảng `ALIAS`, tuyệt đối không dò chuỗi.**

**❷ “Noire Japanese Fusion & Bar␣␣- The Crest” có HAI dấu cách** trước dấu gạch.
→ `norm()` gộp mọi khoảng trắng về một, bỏ `​`/`﻿`, NFKC, thường hoá.

**❸ `IFC Signature by Noire` là brand thứ tư đã dừng.**
→ gán `brand = OTHER` để không âm thầm cộng vào NCB làm sai tăng trưởng.

### Ba cột điều khiển hành vi dashboard

| Cột | Dùng để làm gì |
|---|---|
| `tier` | Dashboard mặc định lọc `core` + `flagship` (`CORE_STORES` trong `src/data/index.ts`). 3 store satellite chỉ 6–30tr/tháng, gộp vào sẽ làm loãng mọi chỉ số trung bình. Nút `scope` bật/tắt |
| `open` | Chỉ The Mett đủ 18 tháng lịch sử. **Mọi so sánh YoY phải chạy same-store**, nếu không tăng trưởng chuỗi bị thổi phồng bởi store mới |
| `brand` | Khoá của bộ lọc brand toàn hệ thống |

### Thêm một cửa hàng mới

Sửa **một chỗ duy nhất**:

```python
("NDC_BKL", "NDC", "flagship", "noire dining & cafe - the berkley", "NDC · The Berkley", "2026-08"),
#  mã       brand   tier        alias POS (thường hoá, đã chuẩn hoá)  tên hiển thị        mở từ
```

Alias phải khớp **chính xác** tên trong file POS **sau khi qua `norm()`**.
Cách lấy alias đúng: chạy ETL, chốt QA #2 sẽ in ra danh sách tên chưa map — copy nguyên văn từ đó.

Các cấu trúc dẫn xuất tự cập nhật theo, không phải sửa gì thêm:

```python
ALIAS      = {alias: (code, brand, tier, display)}   # khoá tra cứu chính
STORE_META = {code: {code, brand, tier, name, open}} # xuất sang data.json["stores"]
CORE7      = [code for tier in ("core","flagship")]  # xuất sang data.json["core7"]
```

---

## 2. `TARGET_ALIAS` — khớp lỏng cho file target

Tên cửa hàng trong file target viết khác POS (thiếu dấu, thiếu khoảng trắng).
`map_store_loose()` thử `map_store()` trước, không được thì dò regex:

```python
TARGET_ALIAS = [
    (r"the ?mett", "NCB_MET"), (r"empress", "NCB_ET"), (r"\bskc\b", "NCB_SKC"),
    (r"39 ?ntmk|minh khai", "NDC_NTMK"), (r"berkley", "NDC_BKL"),
    (r"cres", "NJFB_CRE"), (r"\bssv\b", "NJFB_SSV"),
    …
]
```

> Khớp lỏng **chỉ dùng cho target và ads** — hai nguồn không phải POS.
> Với `fact_item`/`fact_bill` thì luôn dùng `map_store()` khớp chính xác. Đừng đổi quy tắc này.

Google Ads có bảng riêng cùng nguyên tắc: `GSTORE` trong `build_mkt.py`.

---

## 3. `NATURE_RULES` — bốn bản chất chương trình khuyến mãi

**Vị trí:** `build_hub.py` mục 2. Đây là phát hiện có tác động lớn nhất tới độ chính xác báo cáo marketing.

48 CTKM trong một tháng, phủ 34,3% doanh thu — nhưng **không cùng bản chất**:

| nature | Khớp theo từ khoá | Ví dụ thật | Có tính vào hiệu quả MKT? |
|---|---|---|---|
| `INTERNAL` | chairman · director · manager · nội bộ · nhân viên · staff · cbnv | CHAIRMAN AND FAMILY 30% | ❌ **không** — đây là khoản mục P&L |
| `PARTNER` | skg · resident · techcombank · tcb · oneu · hdbank · grab · dining city · đối tác | SKG Members 20% | tách riêng — ghi rõ phần NOIRE trả |
| `LOYALTY` | hạng · black diamond · silver · gold · thẻ vip · thành viên · member · loyalty · tích điểm | Hạng Black Diamond | ✅ nhưng tính ở M8 |
| `COMMERCIAL` | *(mặc định — không khớp 3 nhóm trên)* | HAPPY TUESDAY | ✅ **chỉ nhóm này vào ROI marketing** |

**Vì sao quan trọng:** T7/2026 chi phí ưu đãi 221,8tr, trong đó **INTERNAL 166,4tr = 75%** chỉ cho 202 hoá đơn.
Gộp chung vào “hiệu quả khuyến mãi” thì mọi con số ROI marketing đều sai — và sai theo hướng
làm marketing trông tệ hơn thực tế.

Thứ tự khớp là INTERNAL → PARTNER → LOYALTY → COMMERCIAL. **Một CTKM chỉ được một nhãn.**
Chốt QA #9 kiểm tra không còn CTKM nào chưa gán nhãn.

**Thêm quy tắc mới:** thêm regex vào đúng nhóm trong `NATURE_RULES`, chạy lại, xem chốt #9.

---

## 4. `DAYPARTS` — năm khung giờ

```python
DAYPARTS = [(0,10,"Sáng ≤10h"), (11,14,"Trưa 11-14h"), (15,17,"Chiều 15-17h"),
            (18,21,"Tối 18-21h"), (22,23,"Khuya 22h+")]
```

Áp cho `fact_item` (theo cột `Giờ`) và `fact_bill` (theo `Giờ vào`). Nuôi module M3.
Bức tranh T1/2026: Trưa + Tối = 63,6% doanh thu; sáng và chiều là hai vùng trũng;
khung khuya chỉ 215 bill nhưng 11,8% doanh thu — AOV cao vượt trội, đặc trưng NJFB.

---

## 5. `dim_product` — bảng COGS

**Nguồn:** S05 · sheet `01_COGS_ALL`, tiêu đề ở dòng 4 (`header=3`).
**Join:** theo `Mã hàng` đã `.strip()`. Khi một mã có nhiều dòng, giữ dòng có `GIÁ VỐN > 0`.

```python
IT["cogs_unit"] = IT["ma"].map(...)      # giá vốn đơn vị
IT["has_cogs"]  = IT["cogs_unit"].notna()
IT["cogs_amt"]  = IT["cogs_unit"].fillna(0) * IT["qty"]
```

⚠️ **Đây là điểm chặn lớn nhất của hệ thống.** Độ phủ hiện **46,3% doanh thu món** (chốt QA #8 báo đỏ).
Nhóm thiếu tập trung: món Nhật NJFB, combo, dịch vụ/phụ thu, một số đồ uống thông dụng.

Hệ quả bắt buộc với thiết kế M2 (đã thực thi trong code):

1. Hiển thị **độ phủ COGS** ngay cạnh mọi chỉ số biên lợi nhuận;
2. Ma trận Menu Engineering **chỉ xếp hạng món có COGS** — phần còn lại vào ô “Chưa xếp hạng”;
3. **Không tính Prime Cost toàn chuỗi** cho tới khi độ phủ ≥ 90%.

---

## 6. Các bảng dim còn lại

| Bảng | Nguồn | Sinh ở | Ghi chú |
|---|---|---|---|
| `dim_calendar` | sinh từ ngày | `pd.Period` trong `build_hub.py` | `days` = số ngày trong tháng; `coverage` = số ngày THỰC CÓ dữ liệu |
| `dim_budget` | S10 | `build_mkt.py` §1c | 2 tầng: Brand MKT + Extra; thêm bảng kênh ads và store ads |
| `dim_partner` | S15 | `build_mkt.py` §5 | Kết quả thật gắn từ voucher qua `Campaign ID iPOS` |
| `dim_target` (sales) | S06 | `build_hub.py` mục M | grain: store × tháng |
| `dim_target` (CRM) | S14 | `build_mkt.py` §4 | grain: tháng × loại KPI |
| `dim_channel` | cột `Nguồn` của S02 | suy trực tiếp | TẠI CHỖ · MANG VỀ · CORPORATE · GRAB |
| `dim_zone_table` | cột `Khu vực`/`Bàn` của S02 | suy trực tiếp | ⚠️ **thiếu số chỗ ngồi** → chưa tính được vòng quay bàn |
| `dim_staff` | cột `Nhân viên` của S02 | suy trực tiếp | |

---

## 7. `dim_calendar` — hai khái niệm không được lẫn

| Khái niệm | Khoá JSON | Nghĩa |
|---|---|---|
| Số ngày của tháng | `days[m]` | tháng 7 có 31, tháng 6 có 30 |
| Số ngày **thực có dữ liệu** | `coverage[m].days_data` | T8 mới có 18/31 ngày |
| Tháng chưa trọn kỳ | `coverage[m].partial` | `days_data < days_month − 1` |

**Ba hệ quả đã cài trong code:**

1. Tháng chưa trọn **bị loại khỏi đối soát** (chốt QA #4).
2. Dashboard **mở mặc định ở tháng trọn kỳ gần nhất** (`LAST_FULL_MONTH`).
3. Mọi tỷ lệ có tử số và mẫu số đến từ hai nguồn khác độ mới (ví dụ Ad Cost Ratio)
   **phải tính trên tháng trọn kỳ** — nếu không sai gấp đôi.

Chế độ `perday` chuẩn hoá theo số ngày: T7 (31 ngày) so T6 (30 ngày) chênh cơ học +3,3%.
Ví dụ thật: Net −7,69% MoM nhưng Net/ngày −10,67% — hai kết luận khác nhau.
