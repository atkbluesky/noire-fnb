# 20 · BẢN ĐỒ MODULE — TRA CỨU MỘT TRANG

> Mở file này khi cần biết: **tab nào lấy số ở đâu, sửa file nào, đang chặn bởi cái gì.**
> Chi tiết từng module nằm trong `docs/modules/<Mã>.md`.

---

## 1. Bốn khối · 14 module

| Khối | Module | Câu hỏi kinh doanh | Tình trạng |
|---|---|---|---|
| **0 · Quản trị dữ liệu** | D1 · D2 | Số có đáng tin không? Hệ thống đang phân mảnh ra sao? | ✅ ⚠️ |
| **I · Kết quả kinh doanh** | M0 · M1 · M2 · M3 | Đang ở đâu so với kế hoạch? Bán được bao nhiêu, món gì, lúc nào? | ✅ ✅ ⚠️ ⚠️ |
| **II · Marketing** | M4 → M10 | Kế hoạch bao nhiêu, tiêu bao nhiêu, ra kết quả gì? | mix |
| **III · Chiến lược** | R1 | Có gì bất thường, nguyên nhân do đâu? | ✅ |

Thứ tự khối II đọc thành một mạch:
**ngân sách → chi quảng cáo → kế hoạch khuyến mãi → kết quả khuyến mãi → giữ chân khách → đối tác → mảng tiệc.**
M4 (Ngân sách) đứng **trước** M5 (Digital Ads) vì phải biết kế hoạch rồi mới đọc được thực chi —
“chi 38,4 triệu” là con số vô nghĩa; chỉ khi đặt cạnh “kế hoạch 48,9 triệu” mới thành thông tin.

---

## 2. Bảng tra cứu đầy đủ

| Mã | Tên tab | `activeView` | View file | ETL sinh ở | Khoá dữ liệu tiêu thụ | GĐ | Trạng thái |
|---|---|---|---|---|---|---|---|
| **D1** | Kho dữ liệu & QA | `d1` | `DataWarehouseView.tsx` | hub §5·§6 + mkt qa | `qa · meta · coverage · cogs_cov · recon · store_month · stores` + `MKT.qa` | P1 | ✅ **10/11 chốt** |
| **D2** | Bản đồ hệ thống | `d2` | `SystemMapView.tsx` | mkt §7 | `MKT.system` | P1 | ⚠️ phơi bày phân mảnh |
| **M0** | Scorecard điều hành | `m0` | `ScorecardView.tsx` | hub A·M·K | `store_month · target · coverage · identify · meta · stores` | P2 | ✅ |
| **M1** | Doanh thu & Tăng trưởng | `m1` | `RevenueView.tsx` | hub A·B | `store_month · stores` + `data/daily.json` | P2 | ✅ |
| **M2** | Menu & Biên lợi nhuận | `m2` | `MenuView.tsx` | hub F·F2·G | `product_stat · category · menu_median · cogs_flags · bom_stat · meta` + `data/product.json` | P5 | ⚠️ **COGS 46,3%** |
| **M3** | Công suất & Kênh bán | `m3` | `CapacityView.tsx` | hub C·D·E·I·J | `daypart · daypart_order · heat · channel · zone · staff · dwell · stores` | P3 | ⚠️ thiếu chỗ ngồi |
| **M4** | Ngân sách Marketing Q3 | `m4` | `BudgetView.tsx` | mkt §1c | `MKT.budget` | P4 | ✅ chỉ Q3 |
| **M5** | Digital Ads (Meta + Google) | `m5` | `DigitalAdsView.tsx` | mkt §1·§1b | `MKT.ads_* · gads · gads_stat · budget` + `store_month · stores` | P7 | ⚠️ **thiếu Zalo** |
| **M6** | Social Media (Fanpage + TikTok) | `m6` | `SocialView.tsx` | loader §5b | `MKT.social.*` + `store_month · identify` | P7.5 | 🟡 chờ `social_month` |
| **M7** | **Promotion** *(mục mẹ)* | `m7` | `PromotionView.tsx` | hub H + campaign | `nature · campaigns` + `CAMPAIGN.pos_map · plan` | P4 | ✅ |
| └ **M7.1** | Pre-Analytics · Plan | `m71` | `PreAnalyticsView.tsx` | campaign | `CAMPAIGN.plan` *(pre_plan ← S16)* | P5.5 | ✅ |
| └ **M7.2** | Promotion Tracking | `m72` | `CampaignTrackingView.tsx` | campaign | `CAMPAIGN.campaigns · daily · issues` | P5.5 | 🟡 chờ ô CAM |
| **M8** | CRM · Voucher · Zalo OA | `m8` | `CRMView.tsx` | hub K + mkt §2·§3·§4 | `identify · repeat · repeat_stat` + `MKT.oa · voucher_join` | P6 | ⚠️ **nhận diện 8,6%** |
| **M9** | Partnership — Aggregator + Partner | `m9` | `PartnershipView.tsx` | mkt §5b | `MKT.partner_fact · partners · partner_recon` | P7 | ✅ chung số với M7 |
| **M10** | Booking & Sự kiện | `m10` | `BookingView.tsx` | hub L | `lead_month · lead_source · lead_type` | P6 | ✅ chỉ NDC |
| **R1** | Insight & Cảnh báo | `r1` | `InsightsView.tsx` | tổng hợp | `store_month · nature · product_stat · identify · bom_stat · meta · stores` + `MKT.budget · gads_stat · voucher_join` | P9 | ✅ |

---

## 3. Ma trận nguồn → module

Đọc theo cột để biết *“nếu tháng này thiếu file X thì tab nào rỗng”*.

| Nguồn L0 | D1 | D2 | M0 | M1 | M2 | M3 | M4 | M5 | M6 | M7.1 | M7·M7.2 | M8 | M9 | M10 | R1 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| S01 POS item | ● | | | ● | ● | | | | | | ● | | | | ● |
| S02 POS bill | ● | | ● | ● | | ● | | ● | | | | ● | | | ● |
| S03 daily | | | | ● | | | | | | | | | | | |
| S04 monthly *(đối soát)* | ● | | | ● | | | | | | | | | | | |
| S05 BOM | ● | | | | ● | | | | | | | | | | ● |
| S06 target | | | ● | ● | | | | | | | | | | | |
| S07 lead | | | | | | | | | | | | | | ● | |
| S08 Meta Ads | | | | | | | | ● | | | | | | | ● |
| S09 Google Ads | | | | | | | | ● | | | | | | | ● |
| S10 budget | | | | | | | ● | ● | | | | | | | ● |
| S11 voucher | | | | | | | | | | | | ● | ● | | ● |
| S12 Zalo OA | | | | | | | | | | | | ● | | | |
| S13 member | | | | | | | | | | | | ○ | | | |
| S14 KPI CRM | | | | | | | | | | | | ○ | | | |
| S15 partnership | | | | | | | | | | | | | ● | | |
| S16 pre-analytics | | | | | | | | | | ● | | | | | ● |
| S17 LTO actual | | | | | | | | | | | ● | | | | |
| S23 Campaign Tracking *(danh mục chương trình — master cụm M7)* | | | | | | | | | | ● | ● | | | | |
| S18 social *(Meta Business Suite + TikTok Analytics)* | | | | | | | | | ● | | | | | | ● |

● đang dùng · ○ đã nạp nhưng chưa có màn hình

---

## 4. Bảng chặn — ba việc mở khoá nhiều module nhất

| # | Thiếu gì | Chặn | Ai cấp | Mở khoá được |
|---|---|---|---|---|
| **1** | **COGS 1.200 SKU** (53,7% doanh thu chưa có giá vốn) | M2 · M0 | Bếp + Cost control | CM% thật · Menu Class đủ · Prime Cost · quyết định cắt/tăng giá món |
| **2** | **Số chỗ ngồi mỗi bàn** *(đã có 217 bàn · 18 khu vực · giờ tới phút)* | M3 | Ops | Vòng quay bàn · doanh thu/chỗ ngồi · tỷ lệ lấp đầy |
| **3** | **Chi phí nhân sự & mặt bằng** theo store × tháng | M0 · M4 | Kế toán | Prime Cost · lãi gộp theo cửa hàng · doanh thu/giờ lao động |

Ba thứ này mở khoá toàn bộ tầng biên lợi nhuận và công suất — tức phần **“hiệu quả kinh doanh”**
mà hệ thống hiện đo bằng doanh thu chứ chưa đo bằng lợi nhuận.

> Một dashboard chỉ đo doanh thu sẽ báo “tăng trưởng tốt” trong đúng giai đoạn
> biên lợi nhuận đang bị bào mòn. Đây là kịch bản có thật và rất phổ biến trong F&B.

Danh sách đầy đủ 8 mục thiếu nằm ở `data_sources.json → missing_data_register`,
và được `check_input.py` in ra mỗi lần chạy.

---

## 5. Phạm vi lọc theo module — nguyên tắc trung thực

Không phải khối dữ liệu nào cũng tách được theo brand. Thay vì âm thầm bỏ qua bộ lọc,
mỗi module ghi rõ ngay trên thanh lọc phần nào lọc được. Khai báo ở `src/App.tsx`.

| Module | Lọc brand áp cho | Không tách được theo brand | Ghi chú trên thanh lọc |
|---|---|---|---|
| M4 Ngân sách | tầng Brand MKT · bảng cửa hàng | ngân sách Extra · bảng kênh ads | *chỉ Q3/2026 (T7·8·9)* |
| M5 Digital Ads | chi tiêu Meta · bảng chiến dịch | — | |
| M7 Promotion | cả năm bản chất chi phí · danh mục chương trình | — | |
| M7.1 Pre-Analytics | danh sách kế hoạch | — | *kế hoạch Q3/2026; thực tế theo kỳ chạy* |
| M7.2 Promotion Tracking | chương trình theo brand | chương trình `ALL` luôn hiện | |
| M8 CRM | voucher *(theo Nhà hàng sử dụng)* | tỷ lệ nhận diện · Zalo OA | *số toàn chuỗi* |
| M9 Partnership | mọi khối — hoá đơn đối tác theo brand cửa hàng | Dining City (báo cáo team) gán brand ở danh mục | |
| M10 Booking | — | toàn bộ | *lead hiện chủ yếu NDC* |

Để bộ lọc brand hoạt động **thật** chứ không chỉ hiện nút, tầng ETL đã bổ sung chiều `brand`
vào bảng CTKM (`nature`, `campaigns`) và chiều brand cho voucher suy từ cột `Nhà hàng sử dụng`.

Bộ lọc `scope` (main/all) và `perday` chỉ hiện ở M0 · M1 · M3 · R1 — các module khác
không có khái niệm cửa hàng satellite hay chuẩn hoá theo ngày.

---

## 6. Quy trình check khi nâng cấp một module

```
1. Mở docs/modules/<Mã>.md             → biết module lấy số ở đâu, đang chặn gì
2. python check_input.py               → nguồn của module đó có đủ không
3. Sửa ETL (nếu cần khoá mới)          → build_hub.py / build_mkt.py
4. Cập nhật src/types/hub.ts | mkt.ts  → khai báo type
5. Sửa src/views/<Ten>View.tsx         → màn hình
6. python run_pipeline.py              → chạy lại, đọc qa_log_*.txt
7. npm run dev                         → xem localhost:3001
8. Cập nhật docs/modules/<Mã>.md       → ghi lại thay đổi + đổi nhãn trạng thái ở Sidebar.tsx
```
