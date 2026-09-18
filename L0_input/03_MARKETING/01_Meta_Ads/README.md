# Meta Ads (Facebook/Instagram)

**Mã nguồn:** `S08_ads_meta` · **Bắt buộc:** không · **Nhịp:** một file mỗi tháng, tháng nằm trong TÊN FILE

## Thả file gì vào đây

Ads Manager › Xuất báo cáo cấp CHIẾN DỊCH. Tên file bắt đầu bằng `YYYY-MM`. File `_content` (nếu có) thả cùng chỗ.

- Mẫu tên file: `*_report.xlsx`
- Ví dụ: `2026-08_report.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `Raw Data Report`
- Cột: `Tên chiến dịch`
- Cột: `Cấp độ phân phối`
- Cột: `Số tiền đã chi tiêu (VND)` / `Số tiền đã chi tiêu` / `Amount spent`
- Có số từ tháng: `2026-01` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: ads_month, ads_brand, ads_objective, ads_campaign_detail
- Màn hình: M4, M5, M10, R1
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
