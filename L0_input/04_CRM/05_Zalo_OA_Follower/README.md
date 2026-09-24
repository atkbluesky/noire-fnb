# Zalo OA · Tổng người quan tâm (nhập tay)

**Mã nguồn:** `S26_zalo_follower` · **Bắt buộc:** không · **Nhịp:** một file luỹ kế, xuất lại từ đầu kỳ rồi thả đè — hệ thống lấy file mới nhất

## Thả file gì vào đây

Export Tổng quan KHÔNG có tổng follower. Mỗi cuối tháng (hoặc cuối tuần) mở OA Manager › Thống kê › Người quan tâm, chép 'Tổng người quan tâm' (và 'Bỏ quan tâm' nếu có) vào sheet Follower: MỘT dòng MỘT ngày. Ô chưa có số để TRỐNG. Khi OpenAPI getoa chạy được, số tự động sẽ thay sổ này.

- Mẫu tên file: `Zalo_OA_Follower*.xlsx`
- Ví dụ: `Zalo_OA_Follower_2026.xlsx`
- **Mẫu nhập liệu:** `_MAU_Zalo_OA_Follower.xlsx` nằm ngay trong thư mục này (hệ thống bỏ qua file `_MAU_`).

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `Follower`
- Cột: `Ngày`
- Cột: `Tổng người quan tâm`

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: oa_follower
- Màn hình: M8.1
- Xử lý bởi: tools/build_month.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
