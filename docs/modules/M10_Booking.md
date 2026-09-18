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
| Thẻ KPI | Chi phí ads booking · Lead MKT ghi sổ (CPL) · Tiệc chốt từ MKT (tỷ lệ chốt, chi phí/tiệc) · DT chốt từ MKT (ROAS) · DT tiệc đã chốt mọi nguồn |
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

## 7. Còn thiếu

| Thiếu | Hệ quả | Cách lấp |
|---|---|---|
| Mã hội thoại / SĐT trong sổ Sales | tỷ lệ ghi sổ chỉ xấp xỉ theo tháng | thêm cột `Conversation ID` hoặc tên fanpage nguồn |
| Closed Date | chưa đo được thời gian inquiry → chốt | Sales điền cột `Closed Date` |
| Source chi tiết (MKT-Ads / MKT-Fanpage / Google) | không tách được lead MKT tự nhiên và trả phí | tách giá trị `Source` |
| Ảnh nhắn tin fanpage NEC T7 | tỷ trọng hội thoại từ ads chỉ có T8 | bổ sung vào `Facebook_Tong_hop` |
