# Danh mục đối tác

**Mã nguồn:** `S15_partnership` · **Bắt buộc:** không · **Nhịp:** file cấu hình, sửa khi có thay đổi

## Thả file gì vào đây

Thêm dòng khi có đối tác mới.

- Mẫu tên file: `00_Danh_Muc_Partnership*.xlsx`
- Ví dụ: `00_Danh_Muc_Partnership.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `1. Đối Tác`
- Sheet bắt buộc: `2. Mã CTKM`

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: partners, partner_camp
- Màn hình: M9
- Xử lý bởi: build_mkt.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
