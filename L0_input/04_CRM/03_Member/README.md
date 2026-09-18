# Member đăng ký (CRM Dashboard đã làm sạch)

**Mã nguồn:** `S13_member` · **Bắt buộc:** không · **Nhịp:** một file luỹ kế, xuất lại từ đầu kỳ rồi thả đè — hệ thống lấy file mới nhất

## Thả file gì vào đây

File CRM Dashboard đã làm sạch — hệ thống đọc sheet `KPI_Thang` (khách đăng ký mỗi tháng) và `Nguon_DangKy_T*` (đăng ký + OA follow theo ngày). Thả bản mới đè bản cũ, giữ tiền tố `CRM_Dashboard`. `member_actual*.xlsx` (sheet `Actual`) vẫn đọc được nếu chưa có CRM Dashboard.

- Mẫu tên file: `CRM_Dashboard*.xlsx | member_actual*.xlsx`
- Ví dụ: `CRM_Dashboard_T1-T8.2026.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `KPI_Thang` hoặc `Actual`
- Có số từ tháng: `2026-01` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: member
- Màn hình: M8
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
