# Đặt bàn (iPOS Booking — 5 báo cáo xuất)

**Mã nguồn:** `S27_dat_ban` · **Bắt buộc:** không · **Nhịp:** một THƯ MỤC mỗi tháng `Tháng N.YYYY/`

## Thả file gì vào đây

Tạo thư mục `Tháng <tháng>.<năm>`, thả nguyên 5 file xuất từ iPOS Booking: nguồn đơn · theo dõi tình trạng · thống kê theo cửa hàng · tỷ lệ huỷ · xu hướng theo số lượng. Giữ tên iPOS đặt (có `(1)` cũng được).

- Mẫu tên file: `Tháng */nguon_don_dat_ban*.xlsx`
- Ví dụ: `Tháng 9.2026/nguon_don_dat_ban__xuat_tep.xlsx`
- Có số từ tháng: `2026-09` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: reservation
- Màn hình: M11
- Xử lý bởi: scripts/build-reservation.mjs

> Nguồn đơn iPOS chỉ ở cấp toàn chuỗi — đơn theo brand là ước tính. Xuất thêm 'Nguồn đơn' lọc riêng từng nhà hàng để có số thật theo brand.

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
