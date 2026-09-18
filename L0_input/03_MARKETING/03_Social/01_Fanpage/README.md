# Social · Fanpage Facebook

**Mã nguồn:** `S18_social` · **Bắt buộc:** không · **Nhịp:** một file luỹ kế, xuất lại từ đầu kỳ rồi thả đè — hệ thống lấy file mới nhất

## Thả file gì vào đây

CHUẨN: file tổng hợp theo mẫu `_MAU_Facebook_Tong_hop.xlsx` — sheet `Tong_hop_thang`, mỗi tháng × fanpage một dòng (NCB · NDC · NJFB · NEC). Số `Người xem trong kỳ` lấy từ Meta Business Suite chọn CẢ THÁNG, KHÔNG cộng từ file CSV theo ngày. Dự phòng: thư mục `Tháng <tháng>.<năm>/<BRAND>/*.csv` — khi đó hệ thống bỏ trống reach vì không cộng được.

- Mẫu tên file: `Facebook*.xlsx | Tháng */*/*.csv`
- Ví dụ: `Facebook_Tong_hop_07_08_2026.xlsx`
- **Mẫu nhập liệu:** `_MAU_Facebook_Tong_hop.xlsx` nằm ngay trong thư mục này (hệ thống bỏ qua file `_MAU_`).

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `Tong_hop_thang`
- Cột: `Tháng`
- Cột: `Fanpage`
- Cột: `Lượt xem`
- Cột: `Người xem trong kỳ` / `Người xem`
- Có số từ tháng: `2026-07` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: social_month
- Màn hình: M6, M10
- Xử lý bởi: tools/build_month.py

> Reach (người xem) KHÔNG cộng dồn theo ngày: cộng 31 ngày CSV ra NCB T8 = 322.042, số thật cả kỳ = 238.590 (thổi phồng 35%).

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
