# M10 · BOOKING & SỰ KIỆN — PHỄU QUẢNG CÁO → TIỆC

| | |
|---|---|
| **Câu hỏi** | Tiền quảng cáo booking có ra tiệc không? Rơi ở tầng nào? |
| **`activeView`** | `m10` |
| **View** | `src/views/BookingView.tsx` |
| **ETL** | `tools/build_month.py` — `read_booking()` · `read_meta_ads()` · `_fb_from_summary()` |
| **Luật** | `data_contract.json` → **`$booking`** (một chỗ duy nhất) |
| **Nguồn** | `S07_lead` sổ booking · `S08_ads_meta` Meta Ads · `S18_social` fanpage NEC |
| **Loader** | `scripts/build-data.mjs` §4b → `booking` · `booking_ads` · `booking_page` · `booking_meta` · `booking_stat` |
| **Trạng thái** | ✅ dựng lại 17/09/2026 |

> 📡 **Chi phí ads booking nay đo được theo NGÀY** — [`M5_1_Ads_Auto.md`](M5_1_Ads_Auto.md).
> M5.1 kéo Meta Marketing API về Postgres ở grain ngày × chiến dịch và gắn cột `funnel`
> theo đúng luật `$booking.ads` của §3 dưới đây (`funnel = 'booking'`).
> Đo 27/09/2026 trên 8 tháng: **43,6tr** chi nhắm tiệc — gồm `8,0tr` của page NEC và
> `35,6tr` của chiến dịch tiệc chạy trên page ba brand nhà hàng.
> Dùng `ads_daily_metric.booking_spend` nếu cần số theo ngày thay vì theo tháng.

---

## 1. Ba nguồn, một phễu

```
Meta Ads (ads_campaign_detail, funnel = booking)
   Hiển thị ──CTR──► Click ──► Hội thoại + lead form
                                     │  tỷ lệ ghi sổ (xấp xỉ, nối theo tháng)
Sổ booking của Sales (booking, source = MKT)
   Lead MKT ghi sổ ──tỷ lệ chốt──► Chốt (Confirmed) ──► Doanh thu chốt
                                                         ROAS = DT chốt MKT ÷ chi phí ads booking
Fanpage NEC (social_month, code = NEC)  → bối cảnh: liên hệ & hội thoại của cả trang,
                                          tỷ trọng hội thoại đến từ quảng cáo
```

Không nối được từng khách: sổ Sales không ghi mã hội thoại. Ba nguồn ghép theo
**tháng nhận lead**.

## 2. Hai trục thời gian — không được trộn

| Trục | Cột | Dùng cho |
|---|---|---|
| **Tháng nhận lead** (cohort) | `month` = Inquiry Date → Input Date → ngày sự kiện | phễu, xu hướng, nguồn lead, CPL/CPA/ROAS — vì chi phí ads tháng nào sinh ra lead tháng đó |
| **Tháng diễn ra** | `ev_month` = Date Event (Start) | lịch doanh thu tiệc (đã chốt + kỳ vọng còn treo), gồm cả tháng tương lai |

Trước 17/09/2026 `month` là tháng diễn ra → chi phí ads tháng 8 bị chia cho lead
của tiệc tháng 8 (nhận từ tháng 5). Sai với mọi chỉ số chi phí/lead.

## 3. Luật ở `$booking`

| Luật | Giá trị | Vì sao |
|---|---|---|
| `stages` | won = Confirmed · open = Pending/Tentative/trống · lost = Lost | Tentative vẫn rơi — gộp vào thổi phồng tỷ lệ chốt |
| `segment` | Dinner/Lunch/Brunch **và** < 10 khách → đặt bàn nhỏ | Sổ lẫn ~110 dòng đặt bàn 2 khách NJFB T7 (Source = Sales). Để lẫn: Sales 142 lead, chốt 86%, TB 3,3 tr/tiệc. Tách ra: 32 lead, TB 13,5 tr/tiệc. Màn hình có nút gộp lại để đối chiếu. |
| `ads` | tên có tiệc/booking/party/YEP/sự kiện/event, **hoặc** mã fanpage `NEC` · loại chiến dịch tuyển dụng | 29 chiến dịch T1–T8/2026; không lẫn chiến dịch tin nhắn đặt bàn nhà hàng (`NDC \| Messages 2026`) |
| `result_kinds` | msg · lead = **liên hệ**; like/engage/click = hỗ trợ | Chi phí dùng để tính CPL/CPA/ROAS là **toàn bộ** chi phí ads booking (gồm cả nuôi tương tác/like) |
| `lost_reasons` | 5 nhóm + Khác + Không ghi lý do | Lý do gõ tự do |
| `etype_alias` | Metting → Meeting, Thuê Sảnh → Thuê sảnh… | Tránh tách đôi một loại sự kiện |

## 4. Làm sạch trong `read_booking()`

| Bẫy | Xử lý |
|---|---|
| Ngày gõ thành chuỗi `06-thg 02-26` (38 dòng) | `monthly_lib.date_of()` đọc được — bản trước làm rơi 38 lead |
| Ngày nhận gõ đảo ngày/tháng (`2026-10-08` cho lead 10/08) | ngày nhận > ngày xuất file hoặc > ngày sự kiện → thử đảo; vẫn vô lý thì dùng ngày sự kiện. Cảnh báo in ra báo cáo cập nhật |
| Ngày sự kiện `1900-01-01` | coi như trống |
| Expected Revenue trống / TBA / 0 | **không** tính là 0 — `exp_n` đếm lead có báo giá |
| Confirmed chưa nhập Closed Revenue (24 lead) | `closed_n` đếm; màn hình cảnh báo DT chốt & ROAS đang thấp hơn thực tế |
| Outlet `NJ- Điện Biên Phủ`, `NOIRE METT` | thêm vào `dim_store.aliases` (NJFB_SSV, NCB_MET) |
| Lead nhận trước 2026 nhưng tiệc diễn ra 2026 | `update.py` dựng booking cho mọi tháng có lead (`booking_months()`), không chỉ tháng POS |

## 5. Màn hình

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Chi phí ads booking · Lead MKT (CPL) · Tiệc chốt từ MKT (tỷ lệ chốt, chi phí/tiệc) · DT chốt từ MKT (ROAS) · DT tiệc đã chốt mọi nguồn |
| **Phễu Marketing → Tiệc** | 6 tầng, mỗi tầng: số thật · tỷ lệ so với tầng trên · chi phí đơn vị. Độ rộng thanh chỉ minh hoạ thứ tự |
| **Fanpage NEC** | lượt xem, người xem, truy cập, theo dõi, người liên hệ, hội thoại + % hội thoại đến từ ads |
| **Xu hướng theo tháng nhận lead** | hội thoại ads · lead MKT chồng theo kết quả · đường chi phí; tooltip cảnh báo tháng chưa chín (>40% đang theo) |
| **Kết quả theo nguồn** | 100% chồng chốt/đang theo/mất + bảng xếp theo DT chốt |
| **Lịch doanh thu theo tháng diễn ra** | đã chốt + kỳ vọng còn treo, kể cả tháng tương lai |
| **Vì sao mất lead** · **Loại sự kiện** | |
| **Đọc số này thế nào cho đúng** | mọi giới hạn dữ liệu của kỳ đang chọn + danh sách chiến dịch được tính vào phễu |

Bộ lọc: Brand (theo Outlet) · Từ/Đến (tháng nhận lead) · nút *Tiệc & sự kiện / Gồm đặt bàn nhỏ*.
Lọc brand thì tầng Ads chỉ còn chiến dịch gắn brand đó; fanpage NEC chỉ hiện ở "Tất cả brand".

## 6. Số T1–T8/2026 (tiệc & sự kiện, mọi brand) — tại 17/09/2026

- Ads booking **38,4 tr** · 536 nghìn hiển thị · 4.462 click · **276 liên hệ** (245 tin nhắn + 31 form)
- **107 lead MKT** ghi sổ → tỷ lệ ghi sổ ≈ **39%** liên hệ · CPL 359 k
- **12 tiệc chốt** (11,2%) · 61 lead còn đang theo (57%) · DT chốt **152,3 tr** · ROAS ≈ **4×**
- Hotline: 99 lead, chốt 20%, **381 tr** — nguồn mang doanh thu nhiều nhất
- Fanpage NEC T8: 43 hội thoại, **98%** đến từ quảng cáo

## 6b. Cập nhật T9/2026 (02/10/2026)

**Sổ Sales** `NOIRE Booking Tiec Sales 2026 (4).xlsx` (sửa lại 14:07) — tiệc & sự kiện nhận trong T9:

- **45 lead** (T8: 43) · MKT 25 · Sales 15 + 2 (`Sale`) · Hotline 2 · Nội bộ 1
- **17 chốt** · 18 đang theo · 10 mất · **DT chốt 140,9 tr** (trước khi sửa sổ = 0). Còn **6 lead Confirmed chưa nhập Closed Revenue** (toàn sổ: 12).
- **MKT T9:** 25 lead · 3 chốt · DT chốt 28,0 tr (1 lead Confirmed chưa nhập tiền) · 14 đang theo → tỷ lệ chốt chưa chín.

**Chi phí ads T9 — chưa có file Meta Ads, lấy từ API M5.1** (`scripts/build-booking-ads.mjs` → `data_input/booking_ads_api.json`,
`booking_meta.ads_api_months`): chiến dịch `funnel = booking` trong Postgres, cột như file Meta (click = `link_clicks`, hội thoại = `messaging_conversations`).
Chỉ dùng cho tháng mà sheet `ads_campaign_detail` không có dòng booking — file Meta Ads về sau luôn thắng.
Chạy lại: `node scripts/build-booking-ads.mjs 2026-09` rồi `node scripts/build-data.mjs`.

- `NEC | Messages | 2026`: **6.970.523 đ** · 52.632 hiển thị · 836 click liên kết · **74 hội thoại** → CPL MKT T9 ≈ 279 k
- Không có chiến dịch booking nào khác chạy T9 (không có LikePage / Engagement như T7–T8).
- Đọc đến 30/09/2026 (đủ tháng).

**Fanpage NEC (M6)** T9 đã có sẵn trong `social_month`: 58.667 lượt xem · 23.922 người xem · 898 click · 34 theo dõi mới · **78 người liên hệ · 77 hội thoại**
→ hội thoại từ ads NEC 74 ÷ 77 của trang = **96%** (gần như không có inbox tự nhiên).

**Luỹ kế T1–T9** (màn hình, tất cả brand): ads booking 45,4 tr · 350 liên hệ · 131 lead MKT · 15 chốt (11,5%) · DT chốt MKT 180,3 tr (ROAS ≈ 4×) · DT chốt mọi nguồn 1,01 tỷ.

Báo nguồn (Sales) sửa: `Source = Sale` ×2 (nên là `Sales`) · `LEAD-0464` ngày nhận 2027-09-25 · 5 ngày nhận gõ đảo ngày/tháng đã tự sửa.

## 6c. Cập nhật T10/2026 (02/11/2026)

**Sổ Sales** `NOIRE Booking Tiec Sales 2026.xlsx` — 562 lead (111 đặt bàn nhỏ tách riêng) · Σ Closed Confirmed 2,13 tỷ. Tiệc & sự kiện nhận trong T10:

- **74 lead** · 20 chốt · 37 đang theo · 17 mất · **DT chốt 364,0 tr** (1 lead Confirmed chưa nhập tiền).
- **MKT T10:** 53 lead · 5 chốt (9,4%) · DT chốt 74,5 tr · 33 đang theo → tỷ lệ chốt chưa chín.

**Chi phí ads T10 — chưa có file Meta Ads, lấy từ API M5.1** (`node scripts/build-booking-ads.mjs 2026-10`, đọc đến 31/10): **16.611.470 đ** · 137 hội thoại · CPL ≈ 313 k · ROAS ≈ 4,5×. `update.py` không tự chạy bước này.

**Sổ mới đổi số tháng cũ:** T8 chốt 937,0 tr → 37,0 tr (không còn lead Nội bộ 900 tr) · T9 253,6 tr → 275,6 tr.

Báo nguồn (Sales) sửa:

- **31 lead Confirmed chưa nhập Closed Revenue** (Expected 1,34 tỷ), trong đó 15 lead có tiệc diễn ra T9 — lịch doanh thu T9 đang hiện 0.
- **19 lead Lost + 1 Tentative vẫn còn số ở Closed Revenue** (301,0 tr) — loader không tính vì chỉ tính Confirmed.
- Outlet `NOIRE` ×2 · `NOIRE JFB` ×1 chưa khai ở `dim_store.aliases` — không vào được bộ lọc brand.
- `Source`: `Sale` · `Nội Bộ` viết lệch, 3 lead trống. `Event Type` T10 gần như trống (73/74 "chưa rõ loại") nên khối Loại sự kiện chưa đọc được.

**Fanpage NEC (M6)** T10 từ `Tháng 10.2026/NEC-T10` + `Facebook_Tong_hop_10_2026.xlsx`: 158.518 lượt xem · 3.945 truy cập · 1.597 click · 838 theo dõi mới · **152 người liên hệ · 149 hội thoại**
→ hội thoại từ ads NEC 137 ÷ 149 của trang = **92%**. Người xem trong kỳ để trống vì export không có số cả kỳ, không cộng theo ngày.

## 6d. Nạp lại sổ T10/2026 đã soát (05/11/2026)

**Sổ Sales** `NOIRE_Booking_Dashboard_T10.2026.xlsx` (thay `NOIRE Booking Tiec Sales 2026.xlsx`; thêm sheet `Dashboard Booking`, `Validation` — loader vẫn chỉ đọc `Sales Info`) — 558 lead (111 đặt bàn nhỏ tách riêng). Chốt QA giữ 15/17 (#8, #10 đỏ từ trước).

Thay đổi so với sổ 02/11 (mọi nguồn, gồm đặt bàn nhỏ):

| Tháng nhận lead | Trước | Sau |
|---|---|---|
| T12/2025 | 50 lead · 11 chốt · 148,2 tr | **46 lead · 10 chốt · 133,2 tr** — bớt 4 lead MKT (1 Confirmed NCB_ET 15 tr, 1 Pending, 2 Lost) |
| T10/2026 | 74 lead · 20 chốt · 364,0 tr | **74 lead · 19 chốt · 335,5 tr** — 1 tiệc MKT NOIRE ET 28,5 tr (`LEAD-0528`) chuyển sang Lost |
| Các tháng khác | | không đổi |

**T10 trên màn hình (tiệc & sự kiện):** MKT 53 lead · **4 chốt (7,5%)** · DT chốt MKT **46,0 tr** · **ROAS 2,8×** (trước 4,5×) · DT chốt mọi nguồn 335,5 tr. Chi phí ads giữ 16,6 tr từ API M5.1.

Lỗi sổ Sales **vẫn còn** sau lần soát này — báo nguồn sửa:

- **30 lead Confirmed chưa nhập Closed Revenue** (phần lớn tiệc diễn ra T7–T9; T10: `261007-0469`, `260830-0523`) — 9 dòng tiệc T7 còn trống cả `Lead ID`.
- **21 lead Lost/Tentative còn số ở Closed Revenue** (vd. `LEAD-0528` 28,5 tr, `LEAD-0497` 49 tr) — loader không tính, nhưng nên xoá cho sạch.
- Outlet `NOIRE` ×2 · `NOIRE JFB` ×1 chưa vào được bộ lọc brand; 19 lead trống Outlet.
- `Source`: `MKT ` (dư khoảng trắng — loader đã cắt), `Nội Bộ` ×3 tách riêng khỏi `Nội bộ` trên bảng nguồn, `Sale` ×1, 3 lead trống.
- `Event Type` T10: 73/74 trống → khối Loại sự kiện chưa đọc được. Toàn sổ còn 144 trống.
- Ngày nhận vô lý loader tự sửa: `LEAD-0214` 2026-12-07 → 12/07 · `261008-0370` → 10/08 · `261009-0422` → 10/09 · `LEAD-0520` → ngày sự kiện. Nhiều ngày nhận gõ dạng chữ `29/07/2026` — vẫn đọc được.

**Người xem Fanpage NEC T10 = 114.608** (05/11/2026, theo yêu cầu; cả 4 page đều điền cùng cách, xem M6): điền vào cột `Người xem trong kỳ`
của `Facebook_Tong_hop_10_2026.xlsx` = **cộng 31 ngày** `NEC-T10/Người xem.csv` (export Meta chỉ có số theo ngày).
Số này **có đếm trùng** người xem nhiều ngày — cao hơn reach cả tháng của Meta (tham chiếu NCB T8: cộng ngày cao hơn ~35%),
không so sánh trực tiếp với reach các tháng lấy số cả kỳ. Có số cả tháng từ Meta Business Suite thì thay vào. Ghi chú ở sheet `Ghi_chu` của file.

**Chữ trên màn hình (05/11/2026):** bỏ chữ "ghi sổ" ở M10 (thẻ KPI, tầng phễu, tooltip, ghi chú) — nhãn là "Lead MKT", tỷ lệ hiện "% so với liên hệ"; tầng Chốt tiệc chỉ ghi `Confirmed`, bỏ đoạn "· còn N đang theo".

## 7. Còn thiếu

| Thiếu | Hệ quả | Cách lấp |
|---|---|---|
| Mã hội thoại / SĐT trong sổ Sales | tỷ lệ ghi sổ chỉ xấp xỉ theo tháng | thêm cột `Conversation ID` hoặc tên fanpage nguồn |
| Closed Date | chưa đo được thời gian inquiry → chốt | Sales điền cột `Closed Date` |
| Source chi tiết (MKT-Ads / MKT-Fanpage / Google) | không tách được lead MKT tự nhiên và trả phí | tách giá trị `Source` |
| Ảnh nhắn tin fanpage NEC T7 | tỷ trọng hội thoại từ ads chỉ có T8 | bổ sung vào `Facebook_Tong_hop` |
