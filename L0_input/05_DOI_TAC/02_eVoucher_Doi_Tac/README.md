# Log eVoucher đối tác (Techcombank × OneU…)

**Mã nguồn:** `S21_evoucher` · **Bắt buộc:** không · **Nhịp:** một file luỹ kế, xuất lại từ đầu kỳ rồi thả đè — hệ thống lấy file mới nhất

## Thả file gì vào đây

iPOS › Voucher › xuất log theo chiến dịch của mã đối tác. Mỗi chiến dịch một file, xuất từ ĐẦU chương trình tới hôm nay, thả đè bản cũ. Tháng phát / tháng dùng lấy từ NGÀY trong log, không lấy từ tên file. Gắn vào đối tác qua Campaign ID ở 3_CHUONG_TRINH.

- Mẫu tên file: `eVoucher*.xlsx`
- Ví dụ: `eVoucher NCB - Techcombank Reward × OneU_T9.2026.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Cột: `Mã khuyến mãi`
- Cột: `Chương trình`
- Cột: `Trạng thái`
- Cột: `Ngày phát hành mã`
- Cột: `Ngày sử dụng`
- Cột: `Nhà hàng sử dụng`
- Cột: `Tiền giảm giá`

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: partner_voucher
- Màn hình: M9
- Xử lý bởi: build_mkt.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
