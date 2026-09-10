# M2 · MENU & BIÊN LỢI NHUẬN

| | |
|---|---|
| **Câu hỏi** | Bán món gì, món nào đáng bán? |
| **`activeView`** | `m2` |
| **View** | `src/views/MenuView.tsx` |
| **ETL** | `build_hub.py` mục F *(product)* · F2 *(category/group)* · G *(COGS coverage)* |
| **Giai đoạn** | P5 |
| **Trạng thái** | ⚠️ **Khung xong — số chỉ phủ 46,3% doanh thu** |

---

## 1. Chuỗi trace

```
S01 item → fact_item  ─┐
S05 BOM  → dim_product ┴→ join theo Mã hàng → cogs_unit · has_cogs · cogs_amt
   → gộp theo ma × tên × loại × nhóm → product[] (top 700 theo doanh thu)
   → thống kê TOÀN BỘ SKU → product_stat  (đã loại nhóm "NO SERVICE CHARGE")
   → xếp hạng Menu Class tại TRUNG VỊ của nhóm CÓ COGS → menu_median
   → MenuView
```

## 2. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| Thẻ KPI | SKU Đã Bán · SKU Bán Chậm · Tập Trung Pareto · **Độ Phủ Giá Vốn** · Chưa có BOM |
| **Ma trận Menu Engineering (4 góc phần tư)** | scatter độ phổ biến × biên lợi nhuận, cắt tại trung vị |
| **Bốn phân hạng menu** | Star · Plow-horse · Puzzle · Dog *(+ Chưa xếp hạng)* |
| **Đường cong Pareto 80/20** | |
| **Top 15 món bán chạy nhất** | |
| **Cơ cấu theo Loại món (Category)** | |
| **Cảnh báo món giá vốn bất thường** | `cogs_flags` — top 12 món `% GIÁ VỐN` cao nhất |

## 3. Ma trận Menu Engineering — công cụ số một của ngành F&B

| Nhóm | Điều kiện | Hành động |
|---|---|---|
| **Star** | qty ≥ median **và** cm% ≥ median | Giữ nguyên, đẩy mạnh, đặt vị trí đẹp trên menu |
| **Plow-horse** | qty ≥ median, cm% < median | Tăng giá nhẹ hoặc giảm giá vốn — **cẩn trọng, đây là món kéo khách** |
| **Puzzle** | qty < median, cm% ≥ median | Đổi tên, đổi mô tả, huấn luyện nhân viên gợi ý |
| **Dog** | qty < median, cm% < median | Cắt khỏi menu |
| **Chưa xếp hạng** | không có COGS | **53,7% doanh thu đang nằm đây** |

> **Bán chạy mà lãi thấp là cái bẫy nguy hiểm nhất trong F&B.**
> Bảng top-seller đơn thuần không bao giờ chỉ ra được điều đó — đó là lý do phải dùng ma trận.

## 4. Phát hiện trên dữ liệu thật

**Toàn kỳ T1–T8/2026** *(từ `product_stat`, đã loại nhóm `NO SERVICE CHARGE`)*:

| Chỉ tiêu | Giá trị |
|---|---|
| Tổng SKU đã bán | **1.439** |
| SKU có giá vốn | **239** *(16,6% số SKU · 46,3% doanh thu)* |
| 20% SKU đầu tạo | **82,8% doanh thu** — Pareto còn đậm hơn 80/20 |
| SKU bán chậm *(<10 suất/tháng)* | **943 SKU**, chỉ đóng góp **11,3% doanh thu** |
| Xếp hạng được | Star 68 · Plow-horse 52 · Puzzle 52 · Dog 67 · **Chưa xếp hạng 1.200** |

**Riêng T1/2026** *(số trong Blueprint, dùng để so xu hướng)*: 221/605 SKU (37%) bán dưới 10 suất/tháng,
đóng góp 6,4% doanh thu; 20% SKU đầu tạo 70,2% doanh thu;
top 10 bán chạy **toàn bộ là BEVERAGE** (Long Black 891 suất dẫn đầu), không có một món FOOD nào.

→ **Menu đang phình nhanh hơn doanh thu**: từ 605 SKU (1 tháng) lên 1.439 SKU (8 tháng),
trong đó 943 món bán chậm. Kéo theo chi phí kho, hao hụt, huấn luyện, thời gian order.

## 5. ⛔ Đang chặn bởi gì — điểm chặn lớn nhất hệ thống

**Độ phủ COGS 46,3% doanh thu món.** 1.200/1.439 SKU chưa có giá vốn *(chốt QA #8)*.

| Nhóm thiếu | Ví dụ | Doanh thu/tháng ước |
|---|---|---|
| **Món Nhật (NJFB)** | Tataki bò Wagyu · Sashimi · Cơm cuộn Lươn · Chawanmushi | ~500tr |
| **Combo** | COMBO-23UR Vietnamese Corner · COMBO-2W2D Bistro Power Lunch | ~94tr |
| **Dịch vụ / phụ thu** | FINGER FOOD PACKAGE · Phí đặt phòng họp | ~140tr |
| **Đồ uống thông dụng** | La Vie 400ml · Trà Xoài Macchiato · Iced Matcha Latte | ~245tr |

Bảng COGS có 451 dòng nhưng chỉ **323 mã món duy nhất** (NCB và NDC dùng chung nhiều món nên bị đếm hai lần),
trong khi `fact_item` có 632 SKU thực bán mỗi tháng. **Đây không phải lỗi mapping — là thiếu dữ liệu gốc.**

**Chất lượng phần đã có cũng cần rà:** 44 món COGS > 45%, và **2 món có giá vốn ≥ 100% giá bán chưa VAT —
tức đang bán lỗ** *(`Bicolor Chocolate Ribbon` cost 34.000đ / giá 33.766đ = 100,7%)*.
Cả nhóm Bakery đều ở mức giá vốn rất cao — cần Bếp và Cost control xác nhận đây là số thật hay lỗi nhập.

### Ba quy tắc bắt buộc khi độ phủ chưa đủ (đã cài trong code)

1. Hiển thị **độ phủ COGS** ngay cạnh mọi chỉ số biên lợi nhuận;
2. Ma trận **chỉ xếp hạng món có COGS**, phần còn lại vào ô “Chưa xếp hạng”;
3. **Không tính Prime Cost toàn chuỗi** cho tới khi độ phủ ≥ 90%.

## 6. Checklist nâng cấp

- [ ] **Bổ sung COGS, ưu tiên nhóm Nhật NJFB** — việc số 1, mở khoá toàn bộ module
- [x] ~~Dùng khoá `group`~~ ✅ Top 18 nhóm món
- [ ] **Price Realization** = `Thành tiền ÷ (Giá × Số lượng)` — **40,4% số dòng có `Giá` ≠ `Giá bán`**, tức gần một nửa lượng bán không thu đúng giá niêm yết
- [ ] **Phân tích rổ hàng (basket)**: số món/bill · tỷ lệ gắn kèm đồ ăn ↔ đồ uống · cặp món hay đi cùng
      *(chỉ 5,3% dòng thuộc combo nhưng có tới **420 mã combo** — combo đang phân mảnh nghiêm trọng)*
- [ ] **Attach rate** — % hoá đơn có mua nhóm món mục tiêu *(đầu vào cho Baseline Engine ở M6)*
- [ ] **Cannibalization** — so doanh thu nhóm món cũ trong kỳ chạy LTO vs kỳ nền
- [ ] Cho phép xuất danh sách **“món nên cắt”** kèm ước tính tiết kiệm chi phí vận hành

---

## Vì sao M2 có thể lệch kỳ với M0/M1

`product` · `category` · `group` nằm ở **tầng luỹ kế** (`02_snapshot.xlsx`), không phải tầng
theo tháng. Chúng chỉ được dựng lại khi chạy lại **toàn kỳ**, trong khi `store_month` cập nhật
mỗi tháng qua `data_input/monthly/YYYY-MM.xlsx`.

Hệ quả: sau khi nộp một tháng mới, M0/M1 đã có số đủ tháng còn M2 vẫn là bản cũ. Dòng
`product_stat · covers` ở `_stats` khai đúng kỳ mà bảng món phủ, và **M2 hiện dòng đó ngay
dưới tiêu đề** — người đọc biết mình đang nhìn kỳ nào thay vì tưởng hai khối cùng kỳ.

**Vì sao không tách bảng món theo tháng.** Ma trận Menu Engineering cắt tại **trung vị** của
số suất bán và biên lợi nhuận. Trung vị tính trên một tháng nhảy loạn giữa các tháng, và cùng
một món sẽ đổi hạng Star ↔ Plow-horse chỉ vì cỡ mẫu nhỏ. Cỡ mẫu lớn là điều kiện để ma trận
có nghĩa, nên bảng này cố ý luỹ kế.

Khi nộp lại `02_snapshot.xlsx`, **nhớ sửa dòng `covers`** — nếu không, màn hình sẽ khai một
kỳ đã lỗi thời, đúng cái bẫy mà dòng này sinh ra để chặn.
