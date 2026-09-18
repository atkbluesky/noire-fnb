# Số Aggregator theo tháng (tự thống kê)

**Mã nguồn:** `S19_aggregator` · **Bắt buộc:** không · **Nhịp:** file cấu hình, sửa khi có thay đổi

## Thả file gì vào đây

MỘT file cho mọi tháng (tạo bằng python tools/partner_template.py), sheet AGG_THANG xếp sẵn THÁNG → BRAND → nền tảng. Nền tảng POS không ghi nhận (Dining City) điền đủ booking · khách · hoá đơn · doanh thu · phí; nền tảng đo trên POS (Grab) chỉ điền hoa hồng / phí thực trả theo sao kê.

- Mẫu tên file: `NOIRE_Aggregator*.xlsx`
- Ví dụ: `NOIRE_Aggregator_Theo_Thang.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `AGG_THANG`

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: partner_agg
- Màn hình: M7, M9
- Xử lý bởi: build_mkt.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
