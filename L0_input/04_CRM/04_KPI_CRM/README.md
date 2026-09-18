# KPI CRM theo quý

**Mã nguồn:** `S14_crm_kpi` · **Bắt buộc:** không · **Nhịp:** một file mỗi quý

## Thả file gì vào đây

Kế hoạch KPI CRM phân bổ theo ngày.

- Mẫu tên file: `*KPI CRM*.xlsx`
- Ví dụ: `NOIRE Q3. 2026 KPI CRM PhanBoNgay V2.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `KPI Target`
- Có số từ tháng: `2026-07` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: crm_target
- Màn hình: M8
- Xử lý bởi: build_mkt.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
