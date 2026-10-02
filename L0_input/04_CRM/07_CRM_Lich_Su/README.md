# CRM Dashboard lịch sử T1–T8 (đã làm sạch)

**Mã nguồn:** `S28_crm_history` · **Bắt buộc:** không · **Nhịp:** một file luỹ kế, xuất lại từ đầu kỳ rồi thả đè — hệ thống lấy file mới nhất

## Thả file gì vào đây

Lịch sử đã làm sạch trước khi có file CRM tháng: sheet KPI_Thang (lượt chi tiêu, lần đầu/2/3+), DoanhThu_ThanhVien, Voucher_T6_T8, PhanKhuc_KH, ChanDung_T8. Chỉ dùng cho các tháng CHƯA có file CRM khách hàng T*.

- Mẫu tên file: `CRM_Dashboard*.xlsx`
- Ví dụ: `CRM_Dashboard_T1-T8.2026.xlsx`
- Có số từ tháng: `2026-01` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: crm_month, crm_store, crm_snapshot, crm_dist
- Màn hình: M8
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
