# M1 · DOANH THU & TĂNG TRƯỞNG

| | |
|---|---|
| **Câu hỏi** | Bán được bao nhiêu? |
| **`activeView`** | `m1` |
| **View** | `src/views/RevenueView.tsx` |
| **ETL** | `build_hub.py` mục A *(store × month)* · B *(daily)* |
| **Giai đoạn** | P2 — ✅ xong |
| **Trạng thái** | ✅ đủ số |

---

## 1. Chuỗi trace

```
S02 bill    → fact_bill  → gộp month × store → store_month
S03 daily   → fact_sales_daily → gộp date × store → daily
S02 bill    → HĐ có Số khách ≥ 10 ($guest_segment) → gộp date × store → daily_party
             khách lẻ = daily − daily_party (màn hình tự trừ)
S04 monthly → nguồn ĐỐI SOÁT (chốt QA #4), không phải nguồn lấy số
   → RevenueView
```

## 2. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Net Luỹ Kế Kỳ Chọn · Guest Luỹ Kế · TC Luỹ Kế · **Net Trung Bình / Ngày** |
| Biểu đồ động lực | **TC · TA · AOV theo tuần ISO / tháng / năm** · lọc **Khách: Tất cả / Lẻ <10 / Tiệc ≥10** · phân rã **Brand / Cửa hàng / Lẻ · Tiệc** |
| Dải Lẻ vs Tiệc | Kỳ mới nhất: chỉ số của Tổng · Lẻ · Tiệc + % so kỳ trước, tỷ trọng tiệc trong TC/Net, và câu tách “tổng = lẻ + tác động tiệc” |
| Biểu đồ 1 | **Doanh Thu Theo Từng Ngày** (daily trend) |
| Biểu đồ 2 | **Quỹ Đạo Tăng Trưởng Từng Cửa Hàng** |
| Biểu đồ 3 | **Diễn Biến TA & AOV Qua Các Tháng** |
| Biểu đồ 4 | **Doanh Thu TB Theo Thứ Trong Tuần** |
| Biểu đồ 5 | **Phân Rã Gross → Net** của tháng cuối kỳ chọn |

Biểu đồ TA × AOV là bản đồ định vị 3 brand: NCB đông khách chi ít, NJFB ít khách chi nhiều.
Nhìn riêng một chỉ số sẽ ra kết luận sai.

Biểu đồ động lực dùng cột chồng trực tiếp cho TC. TA và AOV là tỷ lệ nên không cộng chỉ số
của các cửa hàng: mỗi lớp được tính lần lượt bằng `Net đơn vị / Guest toàn phạm vi` và
`Net đơn vị / TC toàn phạm vi`. Vì vậy tổng chiều cao cột vẫn bằng TA hoặc AOV toàn phạm vi;
tooltip hiển thị thêm TA/AOV thật của từng đơn vị. Kỳ tuần theo ISO 8601, Thứ 2 → Chủ nhật.
Kỳ chưa đủ ngày có ký hiệu `⚠`; biến động TC so trên bình quân/ngày khi kỳ mới nhất **hoặc**
kỳ trước dở dang (bản cũ chỉ xét kỳ mới nhất nên tuần đầu thiếu ngày làm tuần sau trông như tăng vọt).

**Khách lẻ / khách tiệc** — xem [`../13_L3_METRIC.md`](../13_L3_METRIC.md) §1. Doanh số = lẻ + tiệc;
tiệc là HĐ ≥ 10 khách. TC ở phân rã Lẻ · Tiệc vẫn là cột chồng (cộng được). TA/AOV ở phân rã
Lẻ · Tiệc **không chồng**: cột = khách lẻ, nét đứt = tổng, đường vàng = tiệc ở trục phải —
khoảng cách giữa cột và nét đứt chính là phần tiệc kéo lệch. Kỳ dưới 5 HĐ tiệc bị đánh dấu
mẫu nhỏ và không dùng để tính biến động. Ở chế độ này “điểm biến động” lấy theo phép tách
tổng = lẻ + tiệc, không so chênh lệch tuyệt đối (AOV tiệc gấp ~12 lần lẻ nên luôn thắng).

## 3. Chỉ số & công thức

Lấy từ `aggByMonth`. Xem [`../13_L3_METRIC.md`](../13_L3_METRIC.md) §1.
`Net TB/ngày` chia cho **số ngày thực có dữ liệu** (`coverage.days_data`), không phải số ngày của tháng.

## 4. Bộ lọc

Brand · Từ · Đến · scope · perday.

## 5. Đang chặn bởi gì

| Chặn | Hệ quả |
|---|---|
| **Chỉ The Mett đủ 18 tháng** *(ET từ 2025-10 · SKC 2026-02 · Crest 2026-04)* | Mọi so sánh YoY **bắt buộc same-store**, nếu không tăng trưởng chuỗi bị thổi phồng bởi cửa hàng mới |
| `daily` hiện có 01/01–13/09/2026 | Nhịp năm mới là YTD 2026; chưa có nền 2025 để tính YoY |
| **NDC Berkley bắt đầu có số từ T8/2026** | So sánh trước/sau phải nhận diện cửa hàng mới; TA/AOV không lấy kỳ chưa có mẫu số làm biến động |

## 6. Checklist nâng cấp

- [x] **Waterfall Gross → Net** — thấy rõ chiết khấu ăn bao nhiêu *(dữ liệu đã có: `gross · disc · voucher` trong `store_month`)*
- [ ] **Heatmap Net theo store × tuần** — nhìn ra ngay cửa hàng nào đang trượt
- [ ] **Scatter TA × Guest**, mỗi bong bóng một cửa hàng, size = Net — bản đồ định vị 3 brand trên một hình
- [x] **Cột chồng TC · TA · AOV theo tuần / tháng / năm**, phân rã brand hoặc cửa hàng
- [ ] **Cảnh báo tự động: cửa hàng có TA giảm 2 kỳ liên tiếp**
- [ ] Chế độ **same-store rõ ràng** — hiện là quy tắc ngầm ở chốt QA #7, nên thành nút bật/tắt như `scope`
- [ ] Nạp `Doanh thu 2025/` để mở YoY thật
- [x] **Tách khách lẻ / khách tiệc** (HĐ ≥ 10 khách) cho TC · TA · AOV
- [ ] Biểu đồ **Diễn Biến TA & AOV Qua Các Tháng** vẫn dùng tổng (lẫn tiệc) — nên thêm đường AOV khách lẻ
- [ ] **HĐ tiệc nghi nhập sai Số khách** (Net/khách < 30k, vd. NCB_GW 12/05 1.111 khách/177k) — ETL đã cảnh báo, cần vận hành sửa trên POS
