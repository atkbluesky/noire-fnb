# M3 · CÔNG SUẤT & KÊNH BÁN

| | |
|---|---|
| **Câu hỏi** | Bán lúc nào, ở đâu, qua kênh nào? |
| **`activeView`** | `m3` |
| **View** | `src/views/CapacityView.tsx` |
| **ETL** | `build_hub.py` mục C *(daypart)* · D *(heat)* · E *(channel)* · I *(staff/zone/payment)* · J *(dwell)* |
| **Giai đoạn** | P3 |
| **Trạng thái** | ⚠️ **Gần xong — thiếu số chỗ ngồi nên chưa tính được vòng quay bàn** |

---

## 1. Chuỗi trace

```
S02 bill → fact_bill
   ├─ Giờ vào → hour_in → daypart          → daypart[]  (month × khung giờ)
   ├─ dow × hour_in                         → heat[]
   ├─ Nguồn                                 → channel[]  (TẠI CHỖ · MANG VỀ · CORPORATE · GRAB)
   ├─ Khu vực · Bàn                         → zone[]
   ├─ Nhân viên                             → staff[]
   ├─ PTTT                                  → payment[]
   └─ Giờ ra − Giờ vào → dwell (0–480 phút) → dwell · dwell_store
      → CapacityView
```

## 2. Vì sao module này tồn tại

**F&B là ngành bán công suất theo thời gian — chỗ ngồi trống lúc 15h không bao giờ bán lại được.**
Phiên bản v1.0 của hệ thống không có chỉ số nào về mặt này.

## 3. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Khung Giờ Mạnh Nhất · Kênh Tại Chỗ (Dine-in) · Thời Gian Ngồi TB · **Vòng Quay Bàn** *(chưa tính được)* |
| **Doanh thu & hoá đơn theo khung giờ (Daypart)** | 5 khung: Sáng ≤10h · Trưa 11–14h · Chiều 15–17h · Tối 18–21h · Khuya 22h+ |
| **Bản đồ nhiệt công suất: Thứ trong tuần × Giờ vào** | |
| **Cơ cấu kênh bán hàng** | |
| **Hiệu suất khu vực bàn (Top 14)** | |
| **Năng suất nhân viên bán hàng (Top 12)** | |

## 4. Hai bức tranh đã đọc được từ dữ liệu

**Khung giờ (T1/2026):**

| Khung giờ | Số bill | Doanh thu | Tỷ trọng |
|---|---|---|---|
| Sáng ≤10h | 1.900 | 421,7tr | 10,7% |
| **Trưa 11–14h** | 3.108 | **1.300,5tr** | **33,0%** |
| Chiều 15–17h | 1.520 | 545,9tr | 13,9% |
| **Tối 18–21h** | 1.722 | **1.206,4tr** | **30,6%** |
| Khuya 22h+ | 215 | 463,9tr | 11,8% |

Trưa + Tối = 63,6% doanh thu. **Sáng và chiều là hai vùng trũng.**
Riêng khung khuya: chỉ 215 bill nhưng tạo 11,8% doanh thu — AOV cao vượt trội,
đây là đặc trưng NJFB và là cơ hội chưa khai thác hết.

**Kênh bán:** TẠI CHỖ 93,7% · MANG VỀ 3,9% · CORPORATE 2,3% · GRAB 0,2%.
Các kênh có **cấu trúc biên hoàn toàn khác nhau** — Grab thu chiết khấu 20–25%,
nên doanh thu Grab tăng có thể **làm giảm lợi nhuận tuyệt đối**. Phải theo dõi riêng biên từng kênh, không gộp.

> **Ngưỡng độ sâu cho aggregator:** kênh chiếm dưới 1% doanh thu chuỗi chỉ báo cáo 3 dòng,
> không dựng slide riêng. Grab hiện 0,2%.

**Thời gian ngồi bàn:** đo được trên **73.349 hoá đơn** — trung bình **55 phút**, trung vị **40 phút**.
Chênh lệch giữa hai số cho thấy phân bố lệch phải: một nhóm nhỏ khách ngồi rất lâu kéo trung bình lên.
Đây là đầu vào của vòng quay bàn — chỉ còn thiếu số chỗ ngồi.

**Năng suất nhân viên:** 39 nhân viên, chênh lệch rất lớn — người dẫn đầu 701tr, người thứ 5 chỉ 270tr.
Đây là đòn bẩy tăng doanh thu **không tốn đồng ngân sách marketing nào**.

## 5. ⛔ Đang chặn bởi gì

**Thiếu số chỗ ngồi mỗi bàn.** Đã có 217 bàn · 18 khu vực · giờ chính xác tới phút,
nhưng không có số ghế nên **không tính được**:

- Vòng quay bàn = `số bill ÷ số bàn ÷ số ngày`
- Doanh thu / chỗ ngồi = `Net ÷ tổng chỗ ngồi`
- Tỷ lệ lấp đầy theo khung giờ × khu vực

**Cần:** Ops cung cấp sơ đồ mặt bằng. Đây là một trong ba việc mở khoá nhiều module nhất.

Ngoài ra **thiếu `fact_cost`** (giờ công) nên chưa có `Doanh thu / giờ lao động`.

## 6. Checklist nâng cấp

- [ ] **Xin số chỗ ngồi từ Ops** → mở vòng quay bàn, doanh thu/chỗ, tỷ lệ lấp đầy → hoàn tất P3
- [x] ~~Dùng khoá `dwell_store`~~ ✅ có đường TB chuỗi 55 phút, cửa hàng trên mức TB tô cảnh báo
- [x] ~~Dùng khoá `payment`~~ ✅ **AOV VISA 477k vs tiền mặt 334k** — hai tệp khách khác nhau
- [ ] **Biên theo kênh** — cần gắn `commission_%` vào `dim_channel` *(Grab 20–25%)*
- [ ] Thêm **AOV/nhân viên** và tỷ lệ gợi ý bán thêm *(dữ liệu `staff.aov` đã có)*
- [ ] Ghép daypart × brand để thấy khung khuya là đặc trưng NJFB chứ không phải toàn chuỗi
