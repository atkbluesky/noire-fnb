# M11 · BOOKING & SỰ KIỆN (LEAD TIỆC)

| | |
|---|---|
| **Câu hỏi** | Mảng tiệc ra sao? |
| **`activeView`** | `m11` |
| **View** | `src/views/BookingView.tsx` |
| **ETL** | `tools/build_month.py` — `read_booking()` |
| **Nguồn** | `monthly/YYYY-MM.xlsx`: `booking` → loader tự sinh `lead_month` · `lead_source` · `lead_type` |
| **Giai đoạn** | P6 — ✅ xong |
| **Trạng thái** | ✅ đủ số · ✅ phễu chốt tiệc từ 09/2026 *(lead hiện chủ yếu NDC)* |

---

## 1. Chuỗi trace

```
S07 lead (~2.000 dòng · 39 cột)
   → giữ dòng có STT
   → Inquiry Date  (thiếu → dùng Start Date)  → inq · m
   → Expected Revenue                          → exp
   → Source                                    → src
   → Event Type                                → etype
      → lead_month[] · lead_source[] · lead_type[]
         → BookingView
```

## 2. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Tổng Lead Tiệc · Doanh Thu Kỳ Vọng · **Lead Từ Marketing** · Giá Trị TB Lead MKT |
| **Lead tiệc & doanh thu kỳ vọng theo tháng** | |
| **Cơ cấu nguồn lead (Source)** | |
| **Phân loại theo loại sự kiện (Event Type)** | |
| **Chi tiết nguồn lead & giá trị kỳ vọng** | bảng |

## 3. Vì sao cột `Source` là tài sản lớn nhất của bảng này

`Source` (MKT / Hotline / …) là **nguồn duy nhất trong toàn hệ thống cho phép quy doanh thu thật về marketing.**

Trong khi attribution quảng cáo bị chặn ở 8,6% nhận diện khách,
mảng tiệc có sẵn nguồn lead ghi tay ngay từ bước inquiry.
Đây là lý do thẻ **“Lead Từ Marketing”** và **“Giá Trị TB Lead MKT”** đứng ở vị trí nổi bật.

## 4. Ba việc làm sạch bắt buộc

| Việc | Vì sao |
|---|---|
| `Number of Guests` đang là text (`"50 pax "`, `"100 pax"`) → parse ra số nguyên | không parse thì không tính được quy mô tiệc |
| `Expected Revenue` ô rỗng → **giữ `NULL`, KHÔNG điền 0** | điền 0 sẽ kéo giá trị trung bình lead xuống sai |
| `Outlet` ghi `"NOIRE DINING"` → map về `NDC_NTMK`/`NDC_BKL` qua `dim_store` | để lọc theo cửa hàng |

Khi thiếu `Inquiry Date`, code lấy `Start Date` thay thế — dòng không có cả hai bị loại.

## 5. Bộ lọc

Brand · Từ · Đến — nhưng ghi rõ trên thanh lọc:
*“Lead tiệc hiện ghi nhận chủ yếu cho thương hiệu NDC.”*
**Toàn bộ dữ liệu chưa tách được theo brand** — đây là sự trung thực về phạm vi, không phải lỗi.

Khoảng thời gian hiển thị theo dải lead thực có, không theo dải POS.

## 6. ⛔ Đang thiếu gì

| Thiếu | Hệ quả |
|---|---|
| Cột `status` chưa được nạp | **Chưa dựng được phễu**: inquiry → báo giá → chốt → doanh thu thực |
| `actual_revenue` chưa được nạp | Chưa tính được **Lead → Revenue** thật, mới có doanh thu kỳ vọng |
| Chưa gắn chi phí ads nhóm LEAD | Chưa tính được **CPL** |
| `sales_rep` chưa được nạp | Chưa bóc được theo nhân sự sale |

Dữ liệu gốc **có đủ 39 cột** — đây là việc mở rộng ETL, không phải thiếu nguồn.

## 7. Checklist nâng cấp

- [ ] Nạp thêm `status` · `actual_revenue` · `sales_rep` · `outlet` · `guest_count` từ file gốc
- [ ] **Dựng phễu**: inquiry → báo giá → chốt → doanh thu thực
- [ ] **Win Rate** = `lead chốt ÷ tổng lead`
- [ ] **Lead → Revenue** = Σ actual revenue của lead đã chốt
- [ ] **CPL** = `chi phí ads nhóm LEAD ÷ số lead` — cần ghép `ads_objective` (nhóm “Lead tiệc”) từ M5
- [ ] **MKT Attribution** = doanh thu lead có `source = MKT`
- [ ] **Đường cong lead time** (từ inquiry đến ngày sự kiện) để dự báo lấp đầy các tháng tới
- [ ] Bóc theo `sales_rep` · `event_type` · outlet

---

## Sheet `booking` — một grain, ba bảng

Grain: **tháng SỰ KIỆN × outlet × loại × nguồn × trạng thái**. Ba bảng `lead_month` ·
`lead_source` · `lead_type` là lát cắt của chính nó — loader tự gộp, người nộp không phải
khai ba lần. Ai đã có sẵn ba bảng đó rời thì vẫn dùng được: sheet khai tay thắng, `booking`
chỉ điền vào chỗ trống.

**Tháng của một booking là tháng DIỄN RA sự kiện.** Lead chưa có ngày sự kiện (đa số dòng
`Lost`) rơi về tháng nhập lead — vẫn phải đếm vào phễu, nếu không tỷ lệ chốt sẽ đẹp giả.

## Chỉ `Confirmed` mới là chốt

`Tentative` nghe như sắp chốt nhưng thực tế vẫn rơi. Gộp `Tentative` vào nhóm thắng sẽ thổi
phồng tỷ lệ chốt và làm dự báo doanh thu tiệc lạc quan giả. Hằng số `BOOKING_WON` trong
`scripts/build-data.mjs` §4b khoá quy ước này ở đúng một chỗ.

Luỹ kế T1–T8/2026: **307 lead · 145 chốt (47,2%) · 861,4 tr đã chốt · 1,19 tỷ còn treo**.

**Nguồn lead theo giá trị, không theo số lượng:** Sales mang về nhiều lead nhất (134) nhưng
trung bình chỉ 3,8 tr/lead; Hotline chỉ 80 lead nhưng 14,1 tr/lead. Xếp hạng kênh theo số
lượng lead sẽ dẫn tới phân bổ nguồn lực sai.
