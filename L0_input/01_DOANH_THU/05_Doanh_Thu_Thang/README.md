# Báo cáo doanh thu tháng (đối soát)

**Mã nguồn:** `S04_monthly` · **Bắt buộc:** không · **Nhịp:** một file mỗi tháng, tháng nằm trong TÊN FILE

## Thả file gì vào đây

Export POS › Doanh thu theo cửa hàng của CẢ THÁNG. Tên bắt đầu bằng `Tháng <tháng>. <năm>`. Dùng để ĐỐI SOÁT chéo với POS hoá đơn.

- Mẫu tên file: `Tháng*.xlsx`
- Ví dụ: `Tháng 8. 2026 revenue.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Cột: `Tên cửa hàng`
- Cột: `Số khách`
- Cột: `Số HĐ`
- Cột: `Doanh thu Net`
- Có số từ tháng: `2026-01` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: recon
- Màn hình: D1
- Xử lý bởi: build_hub.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
