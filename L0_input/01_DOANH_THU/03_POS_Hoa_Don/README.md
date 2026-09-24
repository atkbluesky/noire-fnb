# Bảng kê hoá đơn (POS)

**Mã nguồn:** `S02_bill` · **Bắt buộc:** CÓ · **Nhịp:** một file mỗi tháng, tháng nằm trong TÊN FILE

## Thả file gì vào đây

Export POS › Bảng kê chi tiết hoá đơn, sheet 'Tất cả cửa hàng'. MỘT file MỘT tháng, tên phải có `T<tháng>.<năm>`.

- Mẫu tên file: `accounting_sale*.xlsx`
- Ví dụ: `accounting_sale T8.2026.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Cột: `Mã hoá đơn` / `Hoá đơn`
- Cột: `Số HĐ` / `Số hoá đơn`
- Cột: `Cửa hàng`
- Cột: `Số khách`
- Cột: `Ngày chứng từ` / `Ngày`
- Cột: `Tổng tiền`
- Cột: `Tên CTKM`
- Cột: `Giảm giá`
- Cột: `Chiết khấu`
- Cột: `Phiếu GG` / `Phiếu giảm giá`
- Cột: `Thanh toán trước giảm giá`
- Có số từ tháng: `2026-01` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: channel, daypart, identify, fact_promo_day, nature, recon, daily_party, heat, zone, staff, payment, dwell, repeat
- Màn hình: M1, M3, M7, M7.2, M8
- Xử lý bởi: tools/build_month.py · build_hub.py

> Nguồn DUY NHẤT của chiết khấu thật cấp hoá đơn (Giảm giá + Chiết khấu + Phiếu GG).

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
