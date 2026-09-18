# DANH SÁCH MODULE — 17 TAB

Mỗi file mô tả một tab theo cùng một cấu trúc:
**chuỗi trace (nguồn → tầng → khoá) · màn hình hiển thị gì · chỉ số & công thức · bộ lọc ·
đang chặn bởi gì · checklist nâng cấp.**

| Mã | File | Tab | Giai đoạn | Trạng thái |
|---|---|---|---|---|
| D1 | [`D1_Kho_du_lieu_QA.md`](D1_Kho_du_lieu_QA.md) | Kho dữ liệu & QA | P1 | ✅ 10/11 chốt *(13 khi có social)* |
| D2 | [`D2_Ban_do_he_thong.md`](D2_Ban_do_he_thong.md) | Bản đồ hệ thống | P1 | ⚠️ phơi bày phân mảnh |
| M0 | [`M0_Scorecard.md`](M0_Scorecard.md) | Scorecard điều hành | P2 | ✅ |
| M1 | [`M1_Doanh_thu.md`](M1_Doanh_thu.md) | Doanh thu & Tăng trưởng | P2 | ✅ |
| M2 | [`M2_Menu_Bien_LN.md`](M2_Menu_Bien_LN.md) | Menu & Biên lợi nhuận | P5 | ⚠️ COGS 46,3% |
| M3 | [`M3_Cong_suat_Kenh.md`](M3_Cong_suat_Kenh.md) | Công suất & Kênh bán | P3 | ⚠️ thiếu số chỗ ngồi |
| M4 | [`M4_Ngan_sach.md`](M4_Ngan_sach.md) | Ngân sách Marketing Q3 | P4 | ✅ |
| M5 | [`M5_Digital_Ads.md`](M5_Digital_Ads.md) | Digital Ads (Meta + Google) | P7 | ⚠️ thiếu Zalo |
| M6 | [`M6_Social_Media.md`](M6_Social_Media.md) | Social Media (Fanpage + TikTok) | P7.5 | 🟡 chờ `social_month` |
| **M7** | [`M7_Promotion.md`](M7_Promotion.md) | **Promotion** — mục mẹ · tổng quan 5 bản chất chi phí ưu đãi | P4 | ✅ |
| └ M7.1 | [`M7_1_Pre_Analytics.md`](M7_1_Pre_Analytics.md) | Pre-Analytics · Plan — kế hoạch Pre-Analysis + thực tế | P5.5 | ✅ nối 5/25 CT với POS |
| └ M7.2 | [`M7_2_Promotion_Tracking.md`](M7_2_Promotion_Tracking.md) | Promotion Tracking — chấm từng chương trình | P5.5 | 🟡 chờ team brand điền ô CAM |
| M8 | [`M8_CRM.md`](M8_CRM.md) | CRM · Voucher | P6 | ⚠️ nhận diện 8,6% |
| └ M8.1 | [`M8_1_Zalo_OA.md`](M8_1_Zalo_OA.md) | Zalo OA Performance | P6.1 | 🟡 chờ credential + DB |
| M9 | [`M9_Partnership.md`](M9_Partnership.md) | Partnership — Aggregator + Partner | P7 | ✅ đo trên hoá đơn POS · chung số với M7 |
| M10 | [`M10_Booking.md`](M10_Booking.md) | Booking & Sự kiện | P6 | ✅ chỉ NDC |
| R1 | [`R1_Insight.md`](R1_Insight.md) | Insight & Cảnh báo | P9 | ✅ |

---

## Thứ tự đọc theo khối

**KHỐI 0 · Quản trị dữ liệu** — D1 → D2
*Số có đáng tin không? Hệ thống đang phân mảnh ra sao?*

**KHỐI I · Kết quả kinh doanh** — M0 → M1 → M2 → M3
*Đang ở đâu so với kế hoạch? Bán được bao nhiêu, món gì, lúc nào?*

**KHỐI II · Marketing** — M4 → M5 → M6 → M7 → M8 → M9 → M10 → M11
*Ngân sách → chi quảng cáo (mua lượt tiếp cận) → kênh sở hữu (tự tạo lượt tiếp cận) →
kế hoạch khuyến mãi → kết quả khuyến mãi → giữ chân khách → đối tác → mảng tiệc.*

**KHỐI III · Chiến lược** — R1
*Có gì bất thường, nguyên nhân do đâu?*

---

## Tra cứu nhanh

- Bảng tổng một trang: [`../20_BAN_DO_MODULE.md`](../20_BAN_DO_MODULE.md)
- Ma trận nguồn → module *(thiếu file X thì tab nào rỗng)*: `../20_BAN_DO_MODULE.md` §3
- Khoá `data.json` nào chưa ai dùng: [`../14_L4_OUTPUT_CONTRACT.md`](../14_L4_OUTPUT_CONTRACT.md) §4
- Việc tiếp theo xếp theo giá trị/công sức: [`../50_LO_TRINH_GIAI_DOAN.md`](../50_LO_TRINH_GIAI_DOAN.md) §2
