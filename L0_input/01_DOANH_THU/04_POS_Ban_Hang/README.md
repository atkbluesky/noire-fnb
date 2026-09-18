# Báo cáo bán hàng chi tiết món (POS)

**Mã nguồn:** `S01_item` · **Bắt buộc:** CÓ · **Nhịp:** một file mỗi tháng, tháng nằm trong TÊN FILE

## Thả file gì vào đây

Export POS › Báo cáo bán hàng, sheet 'Tất cả cửa hàng'. MỘT file MỘT tháng.

- Mẫu tên file: `Báo cáo bán hàng*.xlsx`
- Ví dụ: `Báo cáo bán hàng tháng 8.2026.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Cột: `Cửa hàng`
- Cột: `Mã hàng`
- Cột: `Tên hàng`
- Cột: `Mã hoá đơn` / `Hoá đơn`
- Cột: `Thời gian` / `Ngày`
- Cột: `Giờ`
- Cột: `Số lượng`
- Cột: `Thành tiền`
- Cột: `Tổng tiền`
- Cột: `Tên CTKM`
- Có số từ tháng: `2026-01` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: nature, fact_promo_day, product, category, group, campaigns, cogs_cov
- Màn hình: M2, M7, M7.2
- Xử lý bởi: tools/build_month.py · build_hub.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
