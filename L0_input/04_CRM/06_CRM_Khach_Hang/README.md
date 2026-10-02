# CRM khách hàng — báo cáo tháng (iPOS CRM)

**Mã nguồn:** `S27_crm_customer` · **Bắt buộc:** không · **Nhịp:** một file mỗi tháng, tháng nằm trong TÊN FILE

## Thả file gì vào đây

File CRM iPOS 4 sheet: `1. Bức tranh khách hàng` (snapshot luỹ kế) · `2. Biến động khách hàng T*` (đăng ký mới, lượt chi tiêu lần đầu/2/3+, theo cửa hàng, hạng thành viên, doanh thu thành viên) · `3. Báo cáo voucher` · `4. Doanh thu thành viên`. Số có dấu chấm ngàn (1.517) được đọc lại thành số nguyên. Sheet voucher trùng hệt tháng trước (chưa xuất lại) bị BỎ QUA và báo cảnh báo.

- Mẫu tên file: `CRM khách hàng T*.xlsx`
- Ví dụ: `CRM khách hàng T9.2026.xlsx`
- Có số từ tháng: `2026-09` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: crm_month, crm_store, crm_snapshot, crm_dist, crm_rank, member
- Màn hình: M8
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
