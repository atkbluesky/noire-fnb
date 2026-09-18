# Pre-Analysis chương trình khuyến mãi

**Mã nguồn:** `S16_pre_analytics` · **Bắt buộc:** không · **Nhịp:** một file mỗi quý

## Thả file gì vào đây

Bảng dự toán chương trình trước khi chạy (P&L theo loại: Combo · Discount · Gift · LTO · Voucher · Activation). NGUỒN DUY NHẤT của target + chi phí kế hoạch: chương trình nào đã chạy thì nối qua cột `pre_id` ở Campaign_Tracking.

- Mẫu tên file: `NOIRE_Promotion_Pre-Analysis*.xlsx`
- Ví dụ: `NOIRE_Promotion_Pre-Analysis_Q3_2026.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `1. Tổng hợp (Master)`
- Có số từ tháng: `2026-07` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: pre_plan, pre_q3
- Màn hình: M7.1, M7.2
- Xử lý bởi: tools/pre_analysis.py → tools/campaign.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
