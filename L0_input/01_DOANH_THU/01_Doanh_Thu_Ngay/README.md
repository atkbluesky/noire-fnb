# Doanh thu theo ngày (POS)

**Mã nguồn:** `S03_daily` · **Bắt buộc:** CÓ · **Nhịp:** một file luỹ kế, xuất lại từ đầu kỳ rồi thả đè — hệ thống lấy file mới nhất

## Thả file gì vào đây

Export POS › Doanh thu theo ngày, giữ nguyên tên. Mỗi lần xuất lại TỪ ĐẦU NĂM tới hôm nay rồi thả đè — hệ thống lấy file mới nhất.

- Mẫu tên file: `revenue-report-group-by-date*.xlsx`
- Ví dụ: `revenue-report-group-by-date T1-T9_to 13.09.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Cột: `Ngày`
- Cột: `Tên cửa hàng`
- Cột: `Số khách`
- Cột: `Số HĐ`
- Cột: `Doanh thu Net`

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: store_month, daily, coverage, dim_target
- Màn hình: M0, M1, R1
- Xử lý bởi: 09 Tracking Sales Tool/build_tracking.py (hệ thống tự chạy)

> XƯƠNG SỐNG doanh thu. Thiếu file này thì mọi màn doanh thu đứng yên.

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
