# Doanh thu thành viên theo cửa hàng (CSV iPOS)

**Mã nguồn:** `S29_member_revenue` · **Bắt buộc:** không · **Nhịp:** một file luỹ kế, xuất lại từ đầu kỳ rồi thả đè — hệ thống lấy file mới nhất

## Thả file gì vào đây

iPOS › Báo cáo doanh thu thành viên theo cửa hàng, mỗi tháng một CSV (UTF-16). Tháng có file CRM khách hàng T* thì lấy từ sheet 4 của file đó.

- Mẫu tên file: `revenue-report_thanh vien T*.csv`
- Ví dụ: `revenue-report_thanh vien T8.2026.csv`
- Có số từ tháng: `2026-01` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: crm_store
- Màn hình: M8
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
