# Target doanh thu theo cửa hàng × tháng

**Mã nguồn:** `S00_targets` · **Bắt buộc:** CÓ · **Nhịp:** file cấu hình, sửa khi có thay đổi

## Thả file gì vào đây

Sửa trực tiếp file CSV này. Ô trống = chưa có target, hệ thống không bịa số.

- Mẫu tên file: `config_targets.csv`
- Ví dụ: `config_targets.csv`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Cột CSV: `Key`
- Cột CSV: `T1`
- Cột CSV: `T12`

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: dim_target
- Màn hình: M0, M1
- Xử lý bởi: build_tracking.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
