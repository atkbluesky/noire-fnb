# Giá vốn chuẩn (BOM/COGS)

**Mã nguồn:** `S05_bom` · **Bắt buộc:** không · **Nhịp:** file cấu hình, sửa khi có thay đổi

## Thả file gì vào đây

Bếp + Cost control cập nhật. Thả bản mới nhất — hệ thống lấy file sửa gần nhất.

- Mẫu tên file: `NOIRE_COGS_CHUAN*.xlsx`
- Ví dụ: `NOIRE_COGS_CHUAN_ALL_BRANDS_2026_CleanData.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `01_COGS_ALL`

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: dim_cogs, cogs_cov, product
- Màn hình: M2, M0
- Xử lý bởi: build_hub.py

> Hiện chỉ phủ ~30% doanh thu món — chặn Menu Engineering và CM% (chốt QA #8).

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
