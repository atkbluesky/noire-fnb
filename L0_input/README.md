# L0_input — NƠI DUY NHẤT THẢ FILE EXCEL THÔ

## Quy trình mỗi lần có số mới

1. Export file từ POS / Meta / Google / Zalo… **giữ nguyên tên file gốc**.
2. Thả vào đúng thư mục bên dưới (mỗi thư mục có `README.md` riêng hướng dẫn chi tiết).
3. Nháy đúp **`CAP_NHAT.bat`** ở thư mục dự án.
4. Đọc **`_BAO_CAO_CAP_NHAT.txt`** ở ngay thư mục này: file nào thiếu, tháng nào thiếu, file nào bị bỏ qua.

Muốn tự động hoàn toàn: chạy `CAP_NHAT_TU_DONG.bat` và để cửa sổ mở —
cứ thả file là hệ thống tự cập nhật sau khi file chép xong.

## Bốn quy tắc

- **Không đổi tên file export.** Tháng được đọc từ tên file (`T8.2026`, `2026-08`, `Tháng 8.2026`).
- **Thay file = thả đè hoặc thả bản mới.** Hai file cùng tháng → hệ thống lấy bản MỚI NHẤT và báo bản bị bỏ qua. Không bao giờ cộng đôi.
- **Không sửa file trong `data_input/`.** Đó là đầu ra do hệ thống sinh.
- **File sai mẫu bị dời vào `_REJECT/`.** Thiếu sheet/cột bắt buộc → hệ thống không đọc, dời file vào `_REJECT/` kèm `….LY_DO.txt`; số đang có giữ nguyên. Xuất lại đúng mẫu rồi thả lại.

## Các thư mục

| Thư mục | Nguồn | Bắt buộc | Mẫu tên file |
|---|---|:-:|---|
| `01_DOANH_THU/01_Doanh_Thu_Ngay` | Doanh thu theo ngày (POS) | ✅ | `revenue-report-group-by-date*.xlsx` |
| `01_DOANH_THU/02_Target` | Target doanh thu theo cửa hàng × tháng | ✅ | `config_targets.csv` |
| `01_DOANH_THU/03_POS_Hoa_Don` | Bảng kê hoá đơn (POS) | ✅ | `accounting_sale*.xlsx` |
| `01_DOANH_THU/04_POS_Ban_Hang` | Báo cáo bán hàng chi tiết món (POS) | ✅ | `Báo cáo bán hàng*.xlsx` |
| `01_DOANH_THU/05_Doanh_Thu_Thang` | Báo cáo doanh thu tháng (đối soát) |  | `Tháng*.xlsx` |
| `01_DOANH_THU/06_Booking_Tiec` | Booking & lead tiệc |  | `*Booking*.xlsx` |
| `02_SAN_PHAM/01_BOM_COGS` | Giá vốn chuẩn (BOM/COGS) |  | `NOIRE_COGS_CHUAN*.xlsx` |
| `03_MARKETING/01_Meta_Ads` | Meta Ads (Facebook/Instagram) |  | `*_report.xlsx` |
| `03_MARKETING/02_Google_Ads` | Google Ads |  | `Tháng */Báo cáo chiến dịch.xlsx` |
| `03_MARKETING/03_Social/01_Fanpage` | Social · Fanpage Facebook |  | `Facebook*.xlsx | Tháng */*/*.csv` |
| `03_MARKETING/03_Social/02_Tiktok` | Social · TikTok |  | `TikTok*.xlsx` |
| `03_MARKETING/04_Ngan_Sach` | Ngân sách Marketing theo quý |  | `NOIRE_MKT_*Checked*.xlsx` |
| `03_MARKETING/05_Promotion_Ke_Hoach` | Pre-Analysis chương trình khuyến mãi |  | `NOIRE_Promotion_Pre-Analysis*.xlsx | NOIRE_Promotion_Pre-Analysis*.xlsm` |
| `03_MARKETING/05_Promotion_Ke_Hoach/01_So_Danh_Gia` | M7.1 · Sổ Pre-Analysis chuẩn (đánh giá chương trình trước khi chạy) |  | `Pre_Analysis_*.xlsx` |
| `03_MARKETING/06_Promotion_Ket_Qua` | Báo cáo hiệu quả LTO đã chạy |  | `NOIRE_Bao_Cao_Hieu_Qua_LTO*.xlsx` |
| `03_MARKETING/08_Bao_Cao_MKT_Thang` | Báo cáo marketing tháng (Promotion-AGG) |  | `*Promotion AGG*.xlsx` |
| `03_MARKETING/07_Campaign_Tracking` | M7 · Danh mục chương trình (master chung M7 · M7.1 · M7.2) |  | `Campaign_Tracking*.xlsx` |
| `04_CRM/01_Voucher_iPOS` | Nhật ký voucher iPOS |  | `exportVoucherLogOfCampaign_*.xlsx` |
| `04_CRM/02_Zalo_OA` | Zalo OA export (legacy) |  | `OA Zalo T*.xls*` |
| `04_CRM/03_Member` | Member đăng ký (CRM Dashboard đã làm sạch) |  | `CRM_Dashboard*.xlsx | member_actual*.xlsx` |
| `04_CRM/04_KPI_CRM` | KPI CRM theo quý |  | `*KPI CRM*.xlsx` |
| `05_DOI_TAC/01_Danh_Muc` | Danh mục đối tác — Partner + Aggregator |  | `NOIRE_Doi_Tac*.xlsx` |
| `05_DOI_TAC/02_eVoucher_Doi_Tac` | Log eVoucher đối tác (Techcombank × OneU…) |  | `eVoucher*.xlsx` |
| `05_DOI_TAC/03_Aggregator` | Số Aggregator theo tháng (tự thống kê) |  | `NOIRE_Aggregator*.xlsx` |

_Sinh tự động từ tools/l0_registry.py._
