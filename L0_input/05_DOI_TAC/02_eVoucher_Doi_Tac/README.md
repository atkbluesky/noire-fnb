# eVoucher đối tác (Techcombank × OneU…)

**Mã nguồn:** `S21_evoucher` · **Bắt buộc:** không · **Nhịp:** một file mỗi tháng, tháng nằm trong TÊN FILE

## Thả file gì vào đây

Báo cáo phát hành eVoucher từ đối tác, mỗi brand một file, tên có `T<tháng>.<năm>`.

- Mẫu tên file: `eVoucher*.xlsx`
- Ví dụ: `eVoucher_NCB- Techcombank Reward × OneU_T8.2026.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Cột: `Mã khuyến mãi`
- Cột: `Chương trình`
- Cột: `Trạng thái`
- Có số từ tháng: `2026-08` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: partner_month
- Màn hình: M9
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
