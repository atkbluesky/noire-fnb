# M7.1 · Sổ Pre-Analysis chuẩn (đánh giá chương trình trước khi chạy)

**Mã nguồn:** `S24_preeval` · **Bắt buộc:** không · **Nhịp:** file cấu hình, sửa khi có thay đổi

## Thả file gì vào đây

MỘT sổ cho cả năm — mỗi chương trình vài dòng: `chuong_trinh` (1 dòng), `co_che` (từng scheme), `mon` (món tham gia / món tặng), `chi_phi` (merch · KOL · POSM · ads), `ty_le_chi_phi` (Finance). Dữ liệu nền (TC · AOV · TA · giá bán · giá vốn · CTKM cũ) hệ thống TỰ LẤY từ POS và làm mới ở các sheet NEN_*. Kết quả: phiếu đánh giá từng chương trình trên M7.1. Dựng sổ: python tools/preeval_template.py

- Mẫu tên file: `Pre_Analysis_*.xlsx`
- Ví dụ: `Pre_Analysis_2026.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `chuong_trinh`
- Sheet bắt buộc: `co_che`
- Cột: `program_id`
- Cột: `name`
- Có số từ tháng: `2026-01` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: pre_eval, pre_eval_scheme, pre_eval_fin, pre_eval_base
- Màn hình: M7.1
- Xử lý bởi: tools/preeval.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
