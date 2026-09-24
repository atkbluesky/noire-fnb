# Zalo OA export — Thống kê Tổng quan

**Mã nguồn:** `S12_zalo_oa` · **Bắt buộc:** không · **Nhịp:** một file mỗi tháng, tháng nằm trong TÊN FILE

## Thả file gì vào đây

OA Manager › Thống kê › Tổng quan › Xuất, chọn đúng 1 tháng. File .xls thật ra là HTML — giữ nguyên, đừng mở rồi lưu lại. Là nguồn số của M8.1 khi OpenAPI/Webhook CHƯA kết nối, và là lịch sử trước ngày kết nối.

- Mẫu tên file: `OA Zalo T*.xls*`
- Ví dụ: `OA Zalo T8.2026.xls`
- Có số từ tháng: `2026-01` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: oa, oa_daily
- Màn hình: M8.1
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
