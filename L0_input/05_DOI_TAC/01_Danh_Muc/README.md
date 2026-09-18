# Danh mục đối tác — Partner + Aggregator

**Mã nguồn:** `S15_partnership` · **Bắt buộc:** không · **Nhịp:** file cấu hình, sửa khi có thay đổi

## Thả file gì vào đây

Danh mục đối tác — MỘT file cho cả hai kênh (tạo bằng python tools/partner_template.py): 1_PARTNER · 2_AGGREGATOR (hợp đồng, phí, hoa hồng, kỳ hạn) · 3_CHUONG_TRINH (cơ chế, nội dung ưu đãi, kỳ chạy, Campaign ID) · 4_KE_HOACH. Số aggregator theo tháng ở 05_DOI_TAC/03_Aggregator.

- Mẫu tên file: `NOIRE_Doi_Tac*.xlsx`
- Ví dụ: `NOIRE_Doi_Tac_Partner_Aggregator.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `1_PARTNER`
- Sheet bắt buộc: `2_AGGREGATOR`
- Sheet bắt buộc: `3_CHUONG_TRINH`
- Sheet bắt buộc: `4_KE_HOACH`

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: partners, partner_program, partner_plan
- Màn hình: M7, M9
- Xử lý bởi: build_mkt.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
