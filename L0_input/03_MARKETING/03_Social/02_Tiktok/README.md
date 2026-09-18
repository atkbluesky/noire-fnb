# Social · TikTok

**Mã nguồn:** `S22_tiktok` · **Bắt buộc:** không · **Nhịp:** một file luỹ kế, xuất lại từ đầu kỳ rồi thả đè — hệ thống lấy file mới nhất

## Thả file gì vào đây

TikTok Studio không xuất file số tháng. Nhập số từ ảnh chụp vào mẫu `_MAU_TikTok_Tong_hop.xlsx` (sheet `Tong_hop_thang`, mỗi tháng một dòng), lưu tên bắt đầu bằng `TikTok`. Tải được file Overview theo ngày (Date · Video Views · Profile Views · Likes · Comments · Shares) thì thả thẳng, đặt tên bắt đầu bằng `TikTok`.

- Mẫu tên file: `TikTok*.xlsx`
- Ví dụ: `TikTok_Tong_hop_07_08_2026.xlsx`
- **Mẫu nhập liệu:** `_MAU_TikTok_Tong_hop.xlsx` nằm ngay trong thư mục này (hệ thống bỏ qua file `_MAU_`).

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `Tong_hop_thang`
- Cột: `Tháng` / `Ngày` / `Date`
- Cột: `Lượt xem bài đăng` / `Lượt xem video` / `Video Views`
- Có số từ tháng: `2026-07` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: social_month
- Màn hình: M6
- Xử lý bởi: tools/build_month.py

> TikTok đo LƯỢT XEM, Facebook đo NGƯỜI XEM — hai con số không cộng chung được.

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
