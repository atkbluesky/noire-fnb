# Google Ads

**Mã nguồn:** `S09_ads_google` · **Bắt buộc:** không · **Nhịp:** một THƯ MỤC mỗi tháng `Tháng N.YYYY/`

## Thả file gì vào đây

Tạo thư mục `Tháng <tháng>.<năm>`, thả bộ báo cáo Google Ads: chiến dịch · cụm từ tìm kiếm · mỗi cửa hàng.

- Mẫu tên file: `Tháng */Báo cáo chiến dịch.xlsx`
- Ví dụ: `Tháng 8.2026/Báo cáo chiến dịch.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- File bắt buộc trong mỗi thư mục tháng: `Báo cáo chiến dịch.xlsx`
- File bắt buộc trong mỗi thư mục tháng: `Báo cáo cụm từ tìm kiếm.xlsx`
- File bắt buộc trong mỗi thư mục tháng: `Báo cáo mỗi cửa hàng.xlsx`
- Có số từ tháng: `2026-07` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: ads_google, gads_channel, gads_kw
- Màn hình: M5
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
