# Booking & lead tiệc

**Mã nguồn:** `S07_lead` · **Bắt buộc:** không · **Nhịp:** một file luỹ kế, xuất lại từ đầu kỳ rồi thả đè — hệ thống lấy file mới nhất

## Thả file gì vào đây

File theo dõi lead tiệc của Sales. Cập nhật file rồi thả đè.

- Mẫu tên file: `*Booking*.xlsx`
- Ví dụ: `NOIRE Booking Tiec Sales 2026.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `Sales Info`
- Cột: `Outlet`
- Cột: `Source`
- Cột: `Status`
- Cột: `Date Event (Start)` / `Date Event`
- Cột: `Expected Revenue`

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: booking
- Màn hình: M10
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
