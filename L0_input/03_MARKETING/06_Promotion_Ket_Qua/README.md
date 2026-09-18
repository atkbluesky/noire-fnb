# Báo cáo hiệu quả LTO đã chạy

**Mã nguồn:** `S17_lto_actual` · **Bắt buộc:** không · **Nhịp:** một file sau mỗi chiến dịch

## Thả file gì vào đây

Sau mỗi chiến dịch LTO. Kỳ chạy · cửa hàng · chi phí quà/ads được chép vào danh mục chương trình khi dựng Campaign_Tracking (tools/campaign_seed.py).

- Mẫu tên file: `NOIRE_Bao_Cao_Hieu_Qua_LTO*.xlsx`
- Ví dụ: `NOIRE_Bao_Cao_Hieu_Qua_LTO_Summer_Crush_Q2.2026.xlsx`

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: campaign_cost
- Màn hình: M7.2
- Xử lý bởi: tools/campaign_seed.py

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
