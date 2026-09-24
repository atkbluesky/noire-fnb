# M7 · Danh mục chương trình (master chung M7 · M7.1 · M7.2)

**Mã nguồn:** `S23_campaign` · **Bắt buộc:** không · **Nhịp:** file cấu hình, sửa khi có thay đổi

## Thả file gì vào đây

MỘT file cho cả năm, dựng sẵn bằng `python tools/campaign_seed.py` (gom tên CTKM POS + kế hoạch Pre-Analysis + báo cáo LTO; tháng sau thêm `--merge`). Team Brand điền ô CAM: sheet `dim_campaign` (mỗi chương trình một dòng — tên CTKM đúng như trên POS, cửa hàng, kỳ chạy, 4 nhãn phân loại, giả thuyết), `campaign_target` (target NỘP TRƯỚC ngày chạy), `campaign_cost` (chi phí ngoài giảm giá: quà tặng, ads, KOL, in ấn…), `campaign_control` (tuỳ chọn), `campaign_item` (chương trình LTO chạy theo món → mã món trên POS; tra ở sheet DS_MON_LTO). Bắt đầu từ `_MAU_Campaign_Tracking.xlsx` — có sẵn danh sách chọn và dòng ví dụ từ chương trình thật; lưu thành `Campaign_Tracking_2026.xlsx`. Giảm giá và phiếu GG KHÔNG cần khai — hệ thống tự lấy từ POS.

- Mẫu tên file: `Campaign_Tracking*.xlsx`
- Ví dụ: `Campaign_Tracking_2026.xlsx`
- **Mẫu nhập liệu:** `_MAU_Campaign_Tracking.xlsx` nằm ngay trong thư mục này (hệ thống bỏ qua file `_MAU_`).

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `dim_campaign`
- Sheet bắt buộc: `campaign_target`
- Sheet bắt buộc: `campaign_cost`
- Cột: `campaign_id`
- Cột: `name`
- Cột: `name_pos`
- Cột: `brand`
- Cột: `date_from`
- Có số từ tháng: `2026-01` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: dim_campaign, campaign_target, campaign_cost, campaign_control, campaign_result, campaign_daily, campaign_unmapped, campaign_issue, pre_calib
- Màn hình: M7, M7.1, M7.2
- Xử lý bởi: tools/campaign.py

> Có `pre_id` → target + chi phí kế hoạch tự lấy từ Pre-Analysis (S16), không gõ lại. Chưa có file thật thì M7.2 hiển thị DỮ LIỆU MẪU từ file _MAU_.

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
