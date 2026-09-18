# Nền tảng trung gian (GrabFood · Dining City)

**Mã nguồn:** `S19_aggregator` · **Bắt buộc:** không · **Nhịp:** một file mỗi tháng, tháng nằm trong TÊN FILE

## Thả file gì vào đây

Báo cáo tổng hợp chương trình chạy trên GrabFood · Dining City (doanh thu, đơn, giảm giá, hoa hồng). Tên có `T<tháng>-<năm>`.

- Mẫu tên file: `*Promotion AGG*.xlsx`
- Ví dụ: `NOIRE_Bao_Cao_Promotion AGG - MKT_T8-2026.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `Aggregator`
- Có số từ tháng: `2026-08` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: aggregator, budget_nonmedia
- Màn hình: M7, M9
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
