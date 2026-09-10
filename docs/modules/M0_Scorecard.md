# M0 · SCORECARD ĐIỀU HÀNH

| | |
|---|---|
| **Câu hỏi** | Tổng thể đang ở đâu so với kế hoạch? |
| **`activeView`** | `m0` *(màn hình mặc định khi mở app)* |
| **View** | `src/views/ScorecardView.tsx` |
| **ETL** | `build_hub.py` mục A *(store × month)* · M *(target)* · K *(nhận diện)* |
| **Giai đoạn** | P2 — ✅ xong |
| **Trạng thái** | ✅ đủ số |

---

## 1. Chuỗi trace

```
S02 bill  → fact_bill → gộp month × store  → store_month (net · guest · tc · gross · disc · voucher)
S04 monthly → bổ sung gross · disc · voucher cho từng dòng
S06 target → dim_target → target[]
S02 bill  → identify[]  (tỷ lệ bill có SĐT)
S05 BOM   → meta.cogs_coverage
   → ScorecardView
```

## 2. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| **9 thẻ KPI** | Net Sales · Guest · TC · TA (Net÷Guest) · AOV (Net÷TC) · Party Size · Discount % · % Đạt Kế hoạch · Nhận diện Khách · Độ phủ COGS |
| Biểu đồ | **Net Sales theo tháng & brand** |
| Bảng xếp hạng | cửa hàng theo % đạt target, tô màu theo 3 ngưỡng |
| Nhãn ngưỡng | Đạt · Cần theo dõi · Không đạt · **Chưa có target** |

Cửa hàng không có target hiển thị `—`, **không hiển thị 0%** — `—` khác `0`.

## 3. Chỉ số & công thức

Toàn bộ lấy từ `FilterContext.aggByMonth` — **không tính lại ở view** (NT2).

| Chỉ số | Công thức |
|---|---|
| Net Sales | Σ `store_month.net` trong phạm vi lọc |
| TA | `Net ÷ Guest` |
| AOV | `Net ÷ TC` |
| Party Size | `Guest ÷ TC` |
| Discount % | `(giảm giá + chiết khấu) ÷ gross` |
| % Đạt Kế hoạch | `Net ÷ Σ target` |
| Nhận diện Khách | `id_bills ÷ bills` — **hiện 8,6%** |

**Ngưỡng cứng:** Đạt ≥ 100% · Cần theo dõi 90–99% · Không đạt < 90%.
Cấm dùng chữ “tốt/ổn/khá” không kèm ngưỡng.

## 4. Bộ lọc

Brand · Từ · Đến · **scope** (main/all) · **perday**.
`perday` quan trọng ở đây: T7 có 31 ngày, T6 có 30 ngày — chênh cơ học +3,3%.
Ví dụ thật: Net −7,69% MoM nhưng Net/ngày −10,67% — hai kết luận khác nhau.

Dashboard mở mặc định ở **tháng trọn kỳ gần nhất** (`LAST_FULL_MONTH`), không phải tháng mới nhất.

## 5. Đang chặn bởi gì

| Chặn | Hệ quả |
|---|---|
| **Chưa có `fact_cost`** | Không tính được **Prime Cost %** — chỉ số quan trọng nhất của Scorecard F&B *(chuẩn ngành ≤ 60–65%)* |
| **COGS 46,3%** | Không đưa được CM% lên Scorecard |
| **Target chỉ có Q3** | % Đạt Kế hoạch chỉ có nghĩa ở T7 · T8 · T9 |
| **Chỉ The Mett đủ 18 tháng** | YoY toàn chuỗi chưa có ý nghĩa thống kê |

## 6. Checklist nâng cấp

- [ ] Thêm **Prime Cost %** khi có `fact_cost` — đây là thẻ còn thiếu quan trọng nhất
- [ ] Thêm **5 mốc so sánh** đầy đủ: Target · tháng trước · cùng kỳ năm trước *(same-store)* · YTD so target năm · benchmark H1 ±15%
      *(hiện chủ yếu có Target và tháng trước)*
- [ ] Thêm thẻ **Voucher Load** (`Phiếu GG ÷ gross`) — đã có sẵn `store_month.voucher`
- [ ] Thêm cảnh báo tự động: cửa hàng có **TA giảm 2 kỳ liên tiếp**
- [ ] Ghi rõ công thức TA/AOV ngay cạnh tên thẻ — quy ước NOIRE ngược thông lệ quốc tế
