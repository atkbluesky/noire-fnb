# Nhật ký voucher iPOS

**Mã nguồn:** `S11_voucher` · **Bắt buộc:** không · **Nhịp:** một file luỹ kế, xuất lại từ đầu kỳ rồi thả đè — hệ thống lấy file mới nhất

## Thả file gì vào đây

iPOS › Voucher › Xuất log theo chiến dịch. Mỗi chiến dịch một file, xuất từ ĐẦU chương trình tới hôm nay, thả đè.

- Mẫu tên file: `exportVoucherLogOfCampaign_*.xlsx`
- Ví dụ: `exportVoucherLogOfCampaign_265680_…Voucher Sinh nhật 10%.xlsx`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Cột: `Mã khuyến mãi`
- Cột: `Chương trình`
- Cột: `Trạng thái`
- Cột: `Ngày sử dụng`
- Cột: `Nhà hàng sử dụng`

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: voucher_month, voucher_join, voucher_prog
- Màn hình: M8, M9
- Xử lý bởi: build_mkt.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
