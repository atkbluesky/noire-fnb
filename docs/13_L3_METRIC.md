# 13 · TẦNG L3 — TỪ ĐIỂN CHỈ SỐ (KHOÁ CỨNG)

> **Đây là điều khoản hợp đồng của hệ thống.** Đã chốt — mọi báo cáo NOIRE dùng đúng định nghĩa này.
> **NT2: một chỉ số chỉ được định nghĩa đúng một lần.** Không tab nào được tự tính lại.

---

## 1. Chỉ số doanh thu lõi

| Chỉ số | Công thức | Đơn vị | Ý nghĩa |
|---|---|---|---|
| **Net Sales** | cột `Tổng tiền` *(= gross − giảm giá − chiết khấu − hoa hồng)* | VNĐ | Doanh thu thực ghi nhận |
| **Guest** | Σ `Số khách` | người | Lượt khách |
| **TC** | Σ số hoá đơn (`nunique(Mã hoá đơn)`) | hoá đơn | Transaction count |
| **TA** | `Net ÷ Guest` | VNĐ/khách | **Chi tiêu bình quân đầu khách** |
| **AOV** | `Net ÷ TC` | VNĐ/hoá đơn | **Giá trị bình quân hoá đơn** |
| **Party Size** | `Guest ÷ TC` | khách/bàn | Quy mô nhóm khách |
| **Discount %** | `(giảm giá + chiết khấu) ÷ gross` | % | Mức chiết khấu thực |
| **Voucher Load** | `Phiếu GG ÷ gross` | % | Áp lực voucher lên doanh thu |
| **Net/ngày** | `Net ÷ số ngày thực có dữ liệu` | VNĐ/ngày | Chuẩn hoá khi so tháng 30 vs 31 ngày |

> ⚠️ **Quy ước NOIRE ngược với thông lệ quốc tế.** Trong ngành F&B quốc tế, TA thường = Net/hoá đơn.
> NOIRE định nghĩa TA = Net/khách. Đây là lựa chọn có chủ đích và đã chốt.
> **Mọi dashboard, báo cáo và tài liệu gửi ra ngoài phải ghi rõ công thức bên cạnh tên chỉ số.**

**Vì sao cần cả TA và AOV:** hai chỉ số cùng nhau tách được đúng bản chất 3 brand —
NCB đông khách chi ít, NJFB ít khách chi nhiều. Nhìn riêng một chỉ số sẽ ra kết luận sai.
Party Size là chỉ số cảnh báo sớm: party size giảm mà TA giữ nguyên → khách đi ít người hơn,
tín hiệu suy giảm nhóm/công ty.

**Thực thi trong code:** `FilterContext.aggByMonth` — điểm tổng hợp duy nhất.

```ts
o.ta     = o.guest > 0 ? o.net / o.guest : null;
o.aov    = o.tc    > 0 ? o.net / o.tc    : null;
o.netday = o.net / (filters.perday ? o.dcov : 1);
```

---

## 2. Chỉ số so sánh

| Chỉ số | Công thức | Điều kiện |
|---|---|---|
| MoM % | `(kỳ này − kỳ trước) ÷ kỳ trước` | `calculateDelta()` |
| YoY % | `(kỳ này − cùng kỳ năm trước) ÷ cùng kỳ` | **bắt buộc same-store** |
| Achv % | `Actual ÷ Target` | từ `dim_target` |
| Contribution % | `store ÷ tổng brand` | |
| Same-store growth | chỉ tính store có mặt cả 2 kỳ | mặc định **BẬT** |

**Năm mốc so sánh** (kế thừa chuẩn báo cáo tháng, thay vì chỉ hai):
Target · tháng trước · cùng kỳ năm trước *(chỉ same-store — hiện chỉ The Mett đủ lịch sử)* ·
YTD so target năm · benchmark H1 gia quyền ±15%.

---

## 3. Chỉ số marketing

| Chỉ số | Công thức | Module |
|---|---|---|
| **Ad Cost Ratio (ACR)** | `Media Spend ÷ Net Sales` | M5 — **chỉ số chính báo cáo BOD** |
| Net / Meta spend | `Net ÷ chi tiêu Meta` | M5 — **phải ghi rõ là tương quan, không phải nhân quả** |
| Cost per Conversation | `chi tiêu ÷ số tin nhắn` | M5 |
| Cost per Result (CPR) | `spend ÷ result` theo campaign | M5 |
| Cost per Acquisition (CPA) | `spend ÷ conversions` (Google) | M5 |
| **Giải ngân %** | `thực chi ÷ phần kế hoạch ĐÃ TỚI HẠN` | M4 |
| **Redeem %** | `voucher đã dùng ÷ voucher phát ra` | M8 |
| **Repeat Rate** | `khách ≥2 lượt ÷ tổng khách nhận diện được` | M8 |
| **Identification Rate** | `bill có SĐT ÷ tổng bill` — **hiện 8,6%** | M8 |
| CPL | `chi phí ads nhóm LEAD ÷ số lead` | M10 |
| Win Rate | `lead chốt ÷ tổng lead` | M10 |
| Lift % | `(Net kỳ chạy − Net kỳ nền) ÷ Net kỳ nền` | M7 *(chưa dựng)* |
| ROI Promotion | `(Net tăng thêm − chi phí ưu đãi − chi phí ads) ÷ tổng chi phí` | M7 *(chưa dựng)* |

### ❗ CẤM dùng từ “ROAS”

NOIRE không có attribution đủ mạnh để nói doanh thu nào do quảng cáo tạo ra:
chỉ 8,6% hoá đơn có SĐT, và Meta chỉ đo được tới bước tin nhắn.
Thẻ ROAS đã có ở wireframe v2 — **đã gỡ ở v3.0**. Dùng **Ad Cost Ratio** thay thế.

### Quy tắc chống thổi phồng khi đo Lift

Lift luôn phải so **cùng store**, không so chain. Và phải kiểm tra **store đối chứng**
(store không chạy campaign) trong cùng kỳ — nếu store đối chứng cũng tăng tương đương
thì lift là do mùa vụ, không phải do campaign. Không có bước này, mọi báo cáo ROI đều là tự huyễn hoặc.

### Ad Cost Ratio phải tính trên tháng trọn kỳ

Chi ads T8 là số đủ tháng, nhưng doanh thu T8 mới có 18/31 ngày.
Chia nhau ra ACR 1,55% — sai lệch nghiêm trọng so với 0,74% thật ở T7.
**Nguyên tắc chung: bất kỳ tỷ lệ nào có tử số và mẫu số đến từ hai nguồn khác độ mới
đều phải kiểm tra lại phạm vi trước khi chia.**

---

## 4. Chỉ số biên lợi nhuận

| Chỉ số | Công thức | Trạng thái |
|---|---|---|
| COGS % | `giá vốn ÷ doanh thu` | ⚠️ chỉ trên 46,3% doanh thu |
| Contribution Margin / món | `rev − cogs` | ⚠️ như trên |
| CM % | `CM ÷ rev` | ⚠️ như trên |
| Prime Cost % | `(COGS + nhân sự) ÷ doanh thu` — chuẩn ngành ≤ 60–65% | ⛔ **thiếu `fact_cost`** |
| Price Realization | `Thành tiền ÷ (Giá × Số lượng)` | ⛔ chưa dựng |

**Menu Class — ma trận độ phổ biến × biên lợi nhuận**, cắt tại **trung vị** của nhóm CÓ COGS:

| Nhóm | Điều kiện | Hành động |
|---|---|---|
| **Star** | qty ≥ median **và** cm% ≥ median | Giữ nguyên, đẩy mạnh, đặt vị trí đẹp trên menu |
| **Plow-horse** | qty ≥ median, cm% < median | Tăng giá nhẹ hoặc giảm giá vốn — **cẩn trọng, đây là món kéo khách** |
| **Puzzle** | qty < median, cm% ≥ median | Đổi tên, đổi mô tả, huấn luyện nhân viên gợi ý |
| **Dog** | qty < median, cm% < median | Cắt khỏi menu |
| **Chưa xếp hạng** | không có COGS | 53,7% doanh thu đang nằm đây |

> **Bán chạy mà lãi thấp là cái bẫy nguy hiểm nhất trong F&B** — bảng top-seller đơn thuần
> không bao giờ chỉ ra được điều đó. Đó là lý do phải dùng ma trận thay vì danh sách xếp hạng.

Trung vị dùng để cắt được xuất ra `data.json["menu_median"]` để màn hình vẽ đúng hai đường chia ô.

---

## 5. Chỉ số công suất

| Chỉ số | Công thức | Trạng thái |
|---|---|---|
| Thời gian ngồi bàn | `Giờ ra − Giờ vào`, loại <0 và >480 phút | ✅ có |
| Doanh thu theo khung giờ | `net` gộp theo `daypart` | ✅ có |
| Doanh thu theo khu vực | `net` gộp theo `Khu vực` | ✅ có |
| Doanh thu / nhân viên · AOV / nhân viên | `net`, `net÷tc` theo `Nhân viên` | ✅ có |
| **Vòng quay bàn** | `số bill ÷ số bàn ÷ số ngày` | ⛔ **thiếu số chỗ ngồi** |
| **Doanh thu / chỗ ngồi** | `Net ÷ tổng chỗ ngồi` | ⛔ như trên |
| Doanh thu / giờ lao động | `Net ÷ tổng giờ công` | ⛔ thiếu `fact_cost` |

---

## 6. Bốn ngưỡng cứng — cấm chữ “tốt / ổn / khá” không kèm ngưỡng

| Nhóm | Đạt | Cần theo dõi | Không đạt |
|---|---|---|---|
| Kết quả kinh doanh | ≥ 100% | 90–99% | < 90% |
| Chi phí so benchmark | trong ±15% | — | ngoài ±15% |
| Giải ngân ngân sách | 95–105% | — | ngoài khoảng |
| Branding đúng hạn | 100% | 80–99% | < 80% |

Màu tương ứng (khoá cứng, dùng chung toàn hệ thống):
Đạt `#4A7C59` · Cần theo dõi `#B07A2B` · Không đạt `#A8443A`.
Brand: NCB `#AE8966` · NDC `#82846C` · NJFB `#C28B4B`.

**Rào chắn độ chín 14 ngày:** chương trình chạy dưới 14 ngày **không được** gắn nhãn KHÔNG ĐẠT.

---

## 7. Hai quy ước trình bày bắt buộc

**`—` khác `0`.** Dấu gạch nghĩa là *chưa đo được*; số 0 nghĩa là *đã đo và bằng không*.
Hai thứ này không được hiển thị giống nhau, cũng không được vẽ thành cột 0 trên biểu đồ.
Thực thi: `formatVND()` / `formatNumber()` / `formatPercent()` trả `'—'` khi `null`/`NaN`.

**Chuẩn hoá theo số ngày.** Mọi chỉ số nhạy phải có chế độ `/ngày` (nút `perday`).

---

## 8. Quy chuẩn biểu đồ — sáu nguyên tắc

Áp cho toàn bộ biểu đồ trong hệ thống:

1. **Số liệu hiện thẳng trên biểu đồ** — không bắt người đọc rê chuột mới thấy con số.
   Với cột chồng, chỉ ghi **tổng ở đầu mỗi cột** thay vì ghi từng lớp (tránh chữ đè nhau).
2. **Bật nhãn có chọn lọc** — biểu đồ 240 điểm hay scatter 200 món mà ghi nhãn thì thành đám chữ.
3. **Trục nào cũng có tên và đơn vị.** Trục kép luôn ghi rõ đơn vị hai bên.
4. **Biểu đồ xếp hạng luôn sắp giảm dần** — người đọc nhìn thứ tự trước khi nhìn số.
5. **Bảng màu cố định, có ngữ nghĩa** (mục 6 ở trên). Bản chất chi phí ưu đãi dùng đúng bộ màu này:
   `COMMERCIAL` xanh · `INTERNAL` đỏ · `PARTNER` vàng · `LOYALTY` ô liu.
6. **Dữ liệu thiếu hiển thị `—`, không vẽ thành 0.**

**Tooltip mang thông tin bổ sung, không lặp lại nhãn.**
