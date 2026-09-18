# Aggregator — báo cáo nền tảng trung gian (Grab Dine Out · GrabFood · Dining City)

**Mã nguồn:** `S19_aggregator` · **Bắt buộc:** không · **Nhịp:** một file mỗi tháng, tháng nằm trong TÊN FILE

## Thả file gì vào đây

Báo cáo team về kênh Aggregator (doanh thu, đơn, giảm giá, hoa hồng). Tên có `T<tháng>-<năm>`. Grab đã đo thẳng trên POS (Nguồn/PTTT) nên số Grab ở đây chỉ để đối soát; Dining City không có dấu vết trên POS nên lấy số từ báo cáo này.

- Mẫu tên file: `*Promotion AGG*.xlsx`
- Ví dụ: `NOIRE_Bao_Cao_Promotion AGG - MKT_T8-2026.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `Aggregator`
- Có số từ tháng: `2026-08` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: aggregator, budget_nonmedia
- Màn hình: M7, M9
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
