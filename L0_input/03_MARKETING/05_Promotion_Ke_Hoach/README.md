# Pre-Analysis chương trình khuyến mãi

**Mã nguồn:** `S16_pre_analytics` · **Bắt buộc:** không · **Nhịp:** một file mỗi quý

## Thả file gì vào đây

Kế hoạch chương trình khuyến mãi, một file mỗi quý (.xlsx hoặc .xlsm). Hai định dạng: (1) file deck theo quý — sheet `Master Plan` (+ Pre-Analysis · Budget · Calendar), Q4/2026 trở đi: hệ thống TỰ CHUYỂN từng chương trình sang mẫu chuẩn M7.1 (cột sheet `chuong_trinh` của sổ Pre_Analysis_2026.xlsx); ô deck không ghi rõ (ngày, cửa hàng, cơ chế ưu đãi) để trống và M7.1 yêu cầu bổ sung ở sổ, dòng cùng program_id; (2) 6 sheet loại Combo · Discount · Gift · LTO · Voucher · Activation (Q3/2026) — nguồn target + chi phí kế hoạch cho M7.2, chương trình đã chạy nối qua cột `pre_id` ở Campaign_Tracking; (3) file đánh giá quý BẢN FINAL đã trình CEO `NOIRE_Pre-Analytics_Q<quý>.<năm>_Final.xlsx` (sheet TINH_TOAN · XEP_HANG · CHUONG_TRINH · CO_CHE · NEN_POS · KIEM_SOAT_TC · TONG_HOP): M7.1 lấy NGUYÊN số của file cho đúng quý đó (không tính lại), khoá kế hoạch M7.2 bằng số này.

- Mẫu tên file: `NOIRE_Promotion_Pre-Analysis*.xlsx | NOIRE_Promotion_Pre-Analysis*.xlsm | NOIRE_Pre-Analytics_*.xlsx`
- Ví dụ: `NOIRE_Promotion_Pre-Analysis_Q4_2026.xlsm`

## Mẫu chuẩn — sai là hệ thống BÁO NGAY

- Sheet bắt buộc: `1. Tổng hợp (Master)` hoặc `*Master Plan` hoặc `TINH_TOAN`
- Có số từ tháng: `2026-07` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.

## Sau khi thả

Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).
Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.

## Dùng cho

- Bảng dữ liệu: pre_plan, pre_q3, pre_eval, pre_eval_input, pre_eval_tc, pre_eval_final
- Màn hình: M7.1, M7.2
- Xử lý bởi: tools/pre_analysis.py → tools/campaign.py (Q3) · tools/preeval.py (deck quý) · tools/preeval_final.py (file Final)

_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._
