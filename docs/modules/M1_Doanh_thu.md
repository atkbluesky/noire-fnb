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
S04 monthly → nguồn ĐỐI SOÁT (chốt QA #4), không phải nguồn lấy số
   → RevenueView
```

## 2. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Net Luỹ Kế Kỳ Chọn · Guest Luỹ Kế · TC Luỹ Kế · **Net Trung Bình / Ngày** |
| Biểu đồ động lực | **TC · TA · AOV theo tuần ISO / tháng / năm**, chuyển phân rã giữa brand và cửa hàng |
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
Kỳ chưa đủ ngày có ký hiệu `⚠`; riêng biến động TC của kỳ dở dang so trên bình quân/ngày.

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
