# Báo cáo marketing tháng (Promotion-AGG)

**Mã nguồn:** `S25_mkt_report` · **Bắt buộc:** không · **Nhịp:** một file mỗi tháng, tháng nằm trong TÊN FILE

## Thả file gì vào đây

Báo cáo marketing tháng ĐẦY ĐỦ của team (Scorecard · Aggregator · Partnership · Budget…), tên có `T<tháng>-<năm>`. Hệ thống chỉ đọc sheet Budget (chi phí ngoài media: KOL · POSM · sản xuất · sự kiện). Số aggregator nhập ở 05_DOI_TAC/03_Aggregator.

- Mẫu tên file: `*Promotion AGG*.xlsx`
- Ví dụ: `NOIRE_Bao_Cao_Promotion AGG - MKT_T8-2026.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `Budget`
- Có số từ tháng: `2026-08` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: budget_nonmedia
- Màn hình: M4
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
