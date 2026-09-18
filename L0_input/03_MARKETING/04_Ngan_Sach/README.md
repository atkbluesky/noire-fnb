# Ngân sách Marketing theo quý

**Mã nguồn:** `S10_budget` · **Bắt buộc:** không · **Nhịp:** một file mỗi quý

## Thả file gì vào đây

Bản ngân sách đã duyệt. Thả bản mới — hệ thống lấy file sửa gần nhất.

- Mẫu tên file: `NOIRE_MKT_*Checked*.xlsx`
- Ví dụ: `NOIRE_MKT_Q3_2026_Checked_Ads_Channel_by_Month_Brand.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `Summary`
- Sheet bắt buộc: `Budget Brand`
- Sheet bắt buộc: `Budget Store Ads`
- Có số từ tháng: `2026-07` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: budget_brand, budget_channel, budget_extra, budget_store
- Màn hình: M4, M5
- Xử lý bởi: khai tay ở 01_master.xlsx

> CHƯA có lane tự dựng — số ngân sách vẫn khai tay ở 01_master.xlsx.

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
