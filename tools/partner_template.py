# -*- coding: utf-8 -*-
"""
FILE NHẬP CHUẨN M9 · ĐỐI TÁC — hai file, mỗi file một việc
==========================================================
    python tools/partner_template.py            tạo file còn thiếu (TỪ CHỐI đè file đã có — không mất số bạn đã nhập)
    python tools/partner_template.py --sync-cols  thêm CỘT còn thiếu vào file đang dùng (giữ nguyên số đã nhập)
    python tools/partner_template.py --force    tạo lại cả hai từ đầu (mất số đã nhập)

① 05_DOI_TAC/01_Danh_Muc/NOIRE_Doi_Tac_Partner_Aggregator.xlsx  — DANH MỤC (sửa khi có hợp đồng mới)
     1_PARTNER       hợp đồng đối tác ngân hàng · ví · thẻ        — mỗi đối tác MỘT dòng
     2_AGGREGATOR    hợp đồng nền tảng trung gian                  — mỗi nền tảng MỘT dòng
     3_CHUONG_TRINH  cơ chế · nội dung ưu đãi · kỳ chạy            — mỗi chương trình MỘT dòng
                     (một đối tác có thể nhiều chương trình: Techcombank có 3 mã theo brand)
     4_KE_HOACH      kế hoạch theo tháng × đối tác
② 05_DOI_TAC/03_Aggregator/NOIRE_Aggregator_Theo_Thang.xlsx       — SỐ AGGREGATOR (điền mỗi tháng)
     AGG_THANG       xếp sẵn THÁNG → BRAND → nền tảng. Dining City không để lại dấu vết trên
                     hoá đơn POS — số chỉ có ở đây.

Màu ô:  CAM = cần điền · XANH = đã điền sẵn từ dữ liệu cũ, kiểm lại · XÁM = hệ thống tự lấy từ POS, KHÔNG điền.

Số liệu điền sẵn (18/09/2026) lấy từ: danh mục cũ 00_Danh_Muc_Partnership.xlsx · log eVoucher
Techcombank T9 (campaign 337795 · 344574 · 344575) · báo cáo Promotion-AGG T8/2026 (Dining City).
Đọc bởi build_mkt.py → partners · partner_program · partner_plan · partner_agg. Đặc tả: docs/modules/M9_Partnership.md
"""
from __future__ import annotations

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import l0_dir  # noqa: E402

OUT_NAME = "NOIRE_Doi_Tac_Partner_Aggregator.xlsx"
AGG_NAME = "NOIRE_Aggregator_Theo_Thang.xlsx"
MONTHS = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]

STATUS = ["Đang chạy", "Chuẩn bị", "Tạm dừng", "Đã kết thúc"]
P_KIND = ["Ngân hàng", "Ví · e-voucher", "Tổ chức thẻ", "Khác"]
A_KIND = ["Dine-out · ưu đãi tại quán", "Đặt bàn", "Giao hàng", "Khác"]
MECH = ["Giảm % hoá đơn", "Giảm số tiền", "Mã e-voucher", "Voucher bán trước", "Tặng món",
        "Quẹt thẻ tại quầy", "Đặt bàn trước", "Khác"]
FEE_PERIOD = ["Không", "Một lần", "Hàng tháng"]
FEE_UNIT = ["Không", "Theo booking", "Theo khách"]
SPONSOR = ["NOIRE", "Đối tác / nền tảng", "Chia"]
SOURCE = ["POS tự động", "Tự thống kê"]
METHOD = ["Đối soát hoá đơn", "Ước tính"]

# (khoá, tiêu đề, độ rộng, loại ô, chú thích, danh sách chọn)
#   loại ô: need = CAM (cần điền) · seed = XANH (điền sẵn) · auto = XÁM (hệ thống tự lấy)
PARTNER_COLS = [
    ("code", "Mã ĐT", 8, "need", "Mã duy nhất P01, P02… — dùng chung ở 3_CHUONG_TRINH và 4_KE_HOACH. KHÔNG đổi sau khi đã chạy.", None),
    ("name", "Tên đối tác", 30, "need", "Tên hiển thị trên dashboard.", None),
    ("kind", "Loại đối tác", 16, "need", "Ngân hàng · Ví · e-voucher · Tổ chức thẻ.", P_KIND),
    ("brand", "Brand áp dụng", 16, "need", "NCB · NDC · NJFB, ngăn bằng dấu phẩy. TẤT CẢ = mọi brand.", None),
    ("stores", "Cửa hàng áp dụng", 14, "need", "Mã cửa hàng ngăn bằng dấu phẩy, hoặc TẤT CẢ.", None),
    ("start", "Ngày bắt đầu HĐ", 13, "need", "Kỳ hạn hợp đồng — ngày bắt đầu (YYYY-MM-DD).", None),
    ("end", "Ngày kết thúc HĐ", 13, "need", "Kỳ hạn hợp đồng — ngày kết thúc. Trống = không thời hạn.", None),
    ("status", "Trạng thái", 12, "need", "Đang chạy · Chuẩn bị · Tạm dừng · Đã kết thúc.", STATUS),
    ("noire_share", "% NOIRE chịu ưu đãi", 11, "need", "Phần giảm giá NOIRE gánh: 100% = NOIRE chịu hết · 50% = chia đôi · 0% = đối tác hoàn hết.", None),
    ("fee", "Phí hợp tác (đ)", 14, "need", "Tiền NOIRE trả cho đối tác (phí niêm yết, phí tham gia…). 0 nếu không có.", None),
    ("fee_period", "Kỳ tính phí", 11, "need", "Không · Một lần (tính vào tháng bắt đầu) · Hàng tháng (mỗi tháng trong kỳ HĐ).", FEE_PERIOD),
    ("commission_pct", "Chiết khấu / hoa hồng cho đối tác (%)", 14, "need", "% trên doanh thu hoá đơn NOIRE trả lại cho đối tác (nếu có). Ưu đãi cho KHÁCH khai ở 3_CHUONG_TRINH.", None),
    ("media", "Giá trị media quy đổi (đ)", 15, "need", "Đối tác truyền thông giúp — chỉ để tham khảo, KHÔNG cộng vào lợi nhuận.", None),
    ("aliases", "Tên khác trên báo cáo", 24, "need", "Tên đối tác này được viết thế nào ở file lạ / báo cáo team, ngăn bằng |. Cổng chuẩn hoá đầu vào dùng để nhận ra dòng.", None),
    ("owner", "Người phụ trách", 14, "need", "", None),
    ("note", "Ghi chú", 40, "need", "", None),
]
AGG_COLS = [
    ("code", "Mã ĐT", 8, "need", "Mã duy nhất (P02, P03…).", None),
    ("name", "Nền tảng", 22, "need", "Tên hiển thị trên dashboard.", None),
    ("kind", "Loại", 22, "need", "Dine-out · ưu đãi tại quán / Đặt bàn / Giao hàng.", A_KIND),
    ("brand", "Brand áp dụng", 14, "need", "NCB · NDC · NJFB, ngăn bằng dấu phẩy.", None),
    ("stores", "Cửa hàng áp dụng", 14, "need", "Mã cửa hàng ngăn bằng dấu phẩy, hoặc TẤT CẢ.", None),
    ("start", "Ngày bắt đầu HĐ", 13, "need", "YYYY-MM-DD", None),
    ("end", "Ngày kết thúc HĐ", 13, "need", "Trống = không thời hạn.", None),
    ("status", "Trạng thái", 12, "need", "", STATUS),
    ("commission_pct", "Hoa hồng nền tảng (%)", 12, "need", "% nền tảng thu trên doanh thu đơn. Dùng ƯỚC TÍNH phí khi tháng đó chưa nhập hoa hồng thực ở file Aggregator theo tháng (03_Aggregator · AGG_THANG).", None),
    ("fee_month", "Phí cố định / tháng (đ)", 14, "need", "Phí niêm yết, phí gian hàng… mỗi tháng. 0 nếu không có.", None),
    ("fee_unit", "Phí theo", 12, "need", "Không · Theo booking · Theo khách.", FEE_UNIT),
    ("fee_unit_amount", "Phí mỗi booking / khách (đ)", 14, "need", "Vd Dining City 18.000 đ/khách.", None),
    ("sponsor", "Ai tài trợ ưu đãi", 14, "need", "NOIRE · Đối tác / nền tảng · Chia.", SPONSOR),
    ("media", "Giá trị media quy đổi (đ)", 15, "need", "Nền tảng truyền thông giúp — chỉ để tham khảo, KHÔNG cộng vào lợi nhuận.", None),
    ("aliases", "Tên khác trên báo cáo", 24, "need", "Tên nền tảng này được viết thế nào ở báo cáo team / file lạ, ngăn bằng |. Vd: GrabFood|Grab DineOut. Cổng chuẩn hoá đầu vào (tools/l0_ingest.py) dùng để nhận ra dòng.", None),
    ("noire_share", "% NOIRE chịu ưu đãi", 11, "need", "100% nếu NOIRE fund.", None),
    ("source", "Nguồn số liệu", 14, "need", "POS tự động = hoá đơn có Nguồn là nền tảng (Grab). Tự thống kê = nhập tay ở file Aggregator theo tháng (03_Aggregator · AGG_THANG) (Dining City).", SOURCE),
    ("owner", "Người phụ trách", 14, "need", "", None),
    ("note", "Ghi chú", 40, "need", "", None),
]
PROG_COLS = [
    ("prog", "Mã CT", 12, "need", "Mã chương trình, duy nhất. Gợi ý: <Mã ĐT>-<BRAND> hoặc <Mã ĐT>-<số>.", None),
    ("code", "Mã ĐT", 8, "need", "Đối tác / nền tảng chạy chương trình (khai ở 1_PARTNER hoặc 2_AGGREGATOR).", None),
    ("name", "Tên chương trình", 30, "need", "", None),
    ("brand", "Brand", 10, "need", "Brand áp dụng chương trình này.", None),
    ("mech", "Cơ chế", 18, "need", "Cách ưu đãi được thực hiện.", MECH),
    ("offer", "Nội dung ưu đãi (khách nhận gì)", 44, "need", "Viết như khách đọc: 'Giảm 15% hoá đơn, tối đa 100.000đ, hoá đơn từ 300.000đ'.", None),
    ("rate", "Mức ưu đãi", 11, "need", "Số: 0,15 = 15% · 200000 = 200.000 đ.", None),
    ("cap", "Trần giảm (đ)", 12, "need", "", None),
    ("min_bill", "HĐ tối thiểu (đ)", 12, "need", "", None),
    ("condition", "Điều kiện áp dụng", 30, "need", "Khung giờ, ngày áp dụng, món loại trừ, đối tượng khách…", None),
    ("start", "Chạy từ", 12, "need", "Kỳ hạn chạy chương trình (YYYY-MM-DD).", None),
    ("end", "Chạy đến", 12, "need", "", None),
    ("codes", "Số mã phát hành", 11, "need", "Chỉ với chương trình phát mã.", None),
    ("cid", "Campaign ID iPOS", 12, "need", "Số đầu tên chương trình trong log eVoucher (vd 337795). Dùng để gắn log eVoucher vào đúng đối tác.", None),
    ("pos_name", "Tên CTKM trên POS", 34, "need", "Đúng như cột Tên CTKM của bảng kê hoá đơn — để đối chiếu.", None),
    ("note", "Ghi chú", 34, "need", "", None),
]
AGG_MONTH_COLS = [
    ("month", "Tháng", 9, "seed", "YYYY-MM. Dòng đã xếp sẵn theo THÁNG → BRAND → nền tảng; chỉ điền số.", None),
    ("brand", "Brand", 8, "seed", "", None),
    ("store", "Cửa hàng", 11, "need", "Mã cửa hàng (tuỳ chọn) — để trống nếu thống kê gộp cả brand.", None),
    ("code", "Mã ĐT", 7, "seed", "", None),
    ("platform", "Nền tảng", 20, "seed", "", None),
    ("bookings", "Số booking", 9, "need", "Tổng booking nhận trong tháng.", None),
    ("cancels", "Huỷ / không đến", 9, "need", "Booking huỷ + no-show.", None),
    ("guests", "Số khách đến", 9, "need", "", None),
    ("bills", "Số hoá đơn", 9, "need", "Số hoá đơn phát sinh từ nền tảng.", None),
    ("net", "Doanh thu (đ)", 14, "need", "TỔNG TIỀN hoá đơn khách trả (gồm VAT & phí phục vụ) — cùng cách tính Net Sales toàn hệ thống. KHÔNG trừ phí nền tảng.", None),
    ("disc_noire", "Ưu đãi NOIRE chịu (đ)", 12, "need", "Giảm giá / voucher NOIRE tài trợ. Với Grab: lấy theo sao kê — ưu đãi áp trên app, POS không ghi.", None),
    ("disc_platform", "Ưu đãi nền tảng chịu (đ)", 12, "need", "Phần nền tảng tài trợ — không tính vào chi phí NOIRE.", None),
    ("commission", "Hoa hồng thực trả (đ)", 13, "need", "Theo sao kê / hoá đơn của nền tảng. Trống = hệ thống ước tính theo % hoa hồng ở 2_AGGREGATOR.", None),
    ("fee_other", "Phí khác (đ)", 12, "need", "Phí booking, phí khách, ads trên nền tảng…", None),
    ("method", "Cách tính", 14, "need", "Đối soát hoá đơn · Ước tính.", METHOD),
    ("note", "Ghi chú", 44, "need", "Nguồn số, giả định.", None),
]
PLAN_COLS = [
    ("month", "Tháng", 9, "need", "YYYY-MM", None),
    ("code", "Mã ĐT", 7, "need", "", None),
    ("name", "Đối tác (tham khảo)", 26, "seed", "Chỉ để đọc cho dễ — hệ thống lấy tên ở 1_PARTNER / 2_AGGREGATOR.", None),
    ("scenario", "Kịch bản", 10, "need", "", None),
    ("issued", "Mã phát hành KH", 11, "need", "", None),
    ("use_rate", "Tỷ lệ dùng KH", 10, "need", "", None),
    ("aov", "AOV KH (đ)", 12, "need", "", None),
    ("rev", "Doanh thu KH (đ)", 14, "need", "", None),
    ("cost", "Chi phí KH (đ)", 13, "need", "", None),
    ("gp", "LN gộp KH (đ)", 13, "need", "", None),
    ("note", "Ghi chú", 30, "need", "", None),
]

# ─────────────── số điền sẵn — chuyển từ danh mục cũ + log eVoucher + báo cáo T8 ───────────────
D = date.fromisoformat
PARTNERS = [
    dict(code="P01", name="Techcombank Reward × OneU", kind="Ngân hàng", brand="NCB, NDC, NJFB", stores="TẤT CẢ",
         start=D("2026-07-21"), end=D("2026-10-31"), status="Đang chạy", noire_share=1, fee=0, fee_period="Không",
         commission_pct=0, media=400000000,
         note="3 chương trình mã theo brand (xem 3_CHUONG_TRINH). Kỳ HĐ lấy theo hạn mã dài nhất trên log eVoucher."),
    dict(code="P04", name="HDBank Priority", kind="Ngân hàng", brand="NDC", stores="TẤT CẢ",
         start=D("2026-07-01"), end=D("2026-12-31"), status="Chuẩn bị", noire_share=1, fee=0, fee_period="Không",
         commission_pct=0, media=0, note="~20 bill/tháng theo kế hoạch"),
    dict(code="P05", name="Shinhan Bank / Shinhan Finance", kind="Ngân hàng", brand="TẤT CẢ", stores="TẤT CẢ",
         start=D("2026-01-01"), end=None, status="Đang chạy", noire_share=1, fee=0, fee_period="Không",
         commission_pct=0, media=0, note="Không phát mã — khách quẹt thẻ Shinhan tại quầy"),
    dict(code="P06", name="Urbox", kind="Ví · e-voucher", brand="TẤT CẢ", stores="TẤT CẢ", start=None, end=None,
         status=None, noire_share=1, fee=None, fee_period=None, commission_pct=None, media=None,
         note="Bổ sung kỳ hợp đồng, cơ chế, phí"),
    dict(code="P07", name="Betakee", kind="Ví · e-voucher", brand="TẤT CẢ", stores="TẤT CẢ", start=None, end=None,
         status=None, noire_share=1, fee=None, fee_period=None, commission_pct=None, media=None,
         note="Bổ sung kỳ hợp đồng, cơ chế, phí"),
    dict(code="P08", name="Visa", kind="Tổ chức thẻ", brand="TẤT CẢ", stores="TẤT CẢ", start=None, end=None,
         status=None, noire_share=1, fee=None, fee_period=None, commission_pct=None, media=None,
         note="Chỉ tính CTKM mang tên Visa — PTTT VISA là cách khách trả tiền, không phải chương trình đối tác"),
]
AGGS = [
    dict(code="P03", name="Grab Dine Out", kind="Dine-out · ưu đãi tại quán", brand="NDC, NJFB", stores="TẤT CẢ",
         start=D("2026-07-27"), end=D("2026-09-30"), status="Đang chạy", commission_pct=0.138, fee_month=0,
         fee_unit="Không", fee_unit_amount=0, sponsor="NOIRE", noire_share=1, source="POS tự động",
         media=172944323, aliases="GrabFood|Grab DineOut",
         note="CMS 13,8% (báo cáo Promotion-AGG T8/2026). Hoá đơn nhận theo cột Nguồn = GRABFOOD trên POS."),
    dict(code="P11", name="GrabFood (giao hàng)", kind="Giao hàng", brand="NCB", stores="TẤT CẢ",
         start=None, end=None, status="Đang chạy", commission_pct=0.25, fee_month=0, fee_unit="Không",
         fee_unit_amount=0, sponsor="NOIRE", noire_share=1, source="POS tự động",
         note="Hoa hồng ghi ngay trên hoá đơn POS (≈25%)."),
    dict(code="P02", name="Dining City", kind="Đặt bàn", brand="NDC, NJFB", stores="TẤT CẢ",
         start=D("2026-07-01"), end=D("2026-12-31"), status="Đang chạy", commission_pct=0, fee_month=0,
         fee_unit="Theo booking", fee_unit_amount=18000, sponsor="NOIRE", noire_share=1, source="Tự thống kê",
         media=0, aliases="DiningCity|Dingning City",
         note="POS KHÔNG ghi nhận được Dining City — nhập số ở file Aggregator theo tháng (03_Aggregator · AGG_THANG). Hoa hồng 18.000đ/booking."),
]
PROGRAMS = [
    dict(prog="P01-NCB", code="P01", name="Noire - Techcombank Reward × OneU", brand="NCB", mech="Mã e-voucher",
         offer="Giảm 15% hoá đơn, tối đa 100.000đ, hoá đơn từ 300.000đ", rate=0.15, cap=100000, min_bill=300000,
         start=D("2026-07-21"), end=D("2026-09-30"), codes=3000, cid="337795",
         pos_name="Noire - Techcombank Reward × OneU", note="Log eVoucher: mã TC…, phát 1 lô 21/07"),
    dict(prog="P01-NDC", code="P01", name="Dining - Techcombank Reward × OneU", brand="NDC", mech="Mã e-voucher",
         offer="Giảm 200.000đ / hoá đơn", rate=200000, start=D("2026-08-26"), end=D("2026-10-31"), codes=1500,
         cid="344574", pos_name="Dining - Techcombank Reward × OneU",
         note="Mức giảm lấy từ log eVoucher (mọi lượt dùng giảm đúng 200.000đ) — bổ sung HĐ tối thiểu"),
    dict(prog="P01-NJFB", code="P01", name="JFB - Techcombank Reward × OneU", brand="NJFB", mech="Mã e-voucher",
         offer="Giảm 400.000đ / hoá đơn", rate=400000, start=D("2026-08-26"), end=D("2026-10-31"), codes=1500,
         cid="344575", pos_name="JFB - Techcombank Reward × OneU",
         note="Mức giảm lấy từ log eVoucher (mọi lượt dùng giảm đúng 400.000đ) — bổ sung HĐ tối thiểu"),
    dict(prog="P04-NDC", code="P04", name="HDBank Priority", brand="NDC", mech="Giảm % hoá đơn",
         offer="Giảm 15% tổng hoá đơn cho khách HDBank Priority", rate=0.15,
         start=D("2026-07-01"), end=D("2026-12-31")),
    dict(prog="P05-ALL", code="P05", name="Giảm 10% thẻ Shinhan", brand="TẤT CẢ", mech="Quẹt thẻ tại quầy",
         offer="Giảm 10% hoá đơn khi thanh toán bằng thẻ Shinhan Bank / Shinhan Finance", rate=0.10,
         start=D("2026-01-01"), pos_name="Giảm 10% cho thẻ Shinhan Bank hoặc Shinhan Finance"),
    dict(prog="P03-1", code="P03", name="Grab Dine Out — giảm ngay", brand="NDC, NJFB", mech="Giảm % hoá đơn",
         offer="Giảm ngay 20% cho khách mới · 15% cho khách đã dùng Grab Dine Out", rate=0.20,
         start=D("2026-07-27"), end=D("2026-09-30"), pos_name="GRAB DINE OUT", note="NOIRE fund"),
    dict(prog="P03-2", code="P03", name="Grab Dine Out — voucher bán trước", brand="NDC, NJFB",
         mech="Voucher bán trước", offer="Voucher 500.000đ mở bán 375.000đ trên Grab", rate=125000,
         start=D("2026-07-27"), end=D("2026-09-30"), note="NOIRE fund"),
    dict(prog="P02-1", code="P02", name="Dining City — đặt bàn trước", brand="NDC, NJFB", mech="Đặt bàn trước",
         offer="Khách đặt bàn qua Dining City", start=D("2026-07-01"), end=D("2026-12-31"),
         note="Hoa hồng 18.000đ/booking"),
]
# Số tự thống kê Dining City T7 + T8
AGG_SEED = {
    ("2026-07", "NDC", "P02"): dict(
        bookings=2, cancels=0, guests=None, bills=2, net=3789933, commission=36000, method="18.000đ/booking",
        note="2 booking × 18.000đ = 36.000đ."),
    ("2026-08", "NDC", "P02"): dict(
        bookings=20, cancels=7, guests=32, bills=13, net=8423714, commission=360000, method="18.000đ/booking",
        note="Báo cáo Promotion-AGG T8: 20 booking (3 huỷ + 4 no-show), 13 hoá đơn. Hoa hồng 18.000đ/booking: 20 booking × 18.000đ = 360.000đ."),
}
AGG_ROWS = [("NCB", "P11", "GrabFood (giao hàng)"), ("NDC", "P02", "Dining City"),
            ("NDC", "P03", "Grab Dine Out"), ("NJFB", "P02", "Dining City"), ("NJFB", "P03", "Grab Dine Out")]
POS_CODES = {c["code"] for c in AGGS if c["source"] == "POS tự động"}
PLAN = [(m, "P01", 1000, 0.25, 325151, 81287750, 12193162.5, 43082507.5) for m in MONTHS] + \
       [(m, "P02", 0, None, 2902750, r, None, None) for m, r in
        zip(MONTHS, [14513750, 17416500, 20319250, 20319250, 23222000, 26124750])] + \
       [(m, "P04", 0, None, 689989, 13799780, 2069967, 7313883.333) for m in MONTHS]
NAME = {x["code"]: x["name"] for x in PARTNERS + AGGS}

GUIDE = [
    ("MỤC ĐÍCH", "DANH MỤC đối tác cho M7 (thẻ Đối tác) và M9 Partnership. Đối tác = hai kênh: PARTNER (ngân hàng · "
                 "ví · thẻ) và AGGREGATOR (nền tảng trung gian). Số aggregator theo tháng nhập ở file riêng: "
                 "05_DOI_TAC/03_Aggregator/NOIRE_Aggregator_Theo_Thang.xlsx."),
    ("MÀU Ô", "CAM = cần điền · XANH = đã điền sẵn từ dữ liệu cũ, kiểm lại."),
    ("1_PARTNER", "Mỗi đối tác MỘT dòng — điều khoản hợp đồng: loại, brand, kỳ hạn, trạng thái, % NOIRE chịu ưu đãi, "
                  "phí hợp tác, chiết khấu cho đối tác."),
    ("2_AGGREGATOR", "Mỗi nền tảng MỘT dòng — hoa hồng, phí, ai tài trợ ưu đãi, NGUỒN SỐ: 'POS tự động' (Grab — hoá đơn có "
                     "Nguồn GRABFOOD) hay 'Tự thống kê' (Dining City — POS không ghi nhận)."),
    ("3_CHUONG_TRINH", "Mỗi chương trình MỘT dòng — cơ chế, nội dung ưu đãi khách nhận, mức ưu đãi, trần, hoá đơn tối thiểu, "
                       "kỳ chạy, Campaign ID iPOS. Một đối tác nhiều chương trình = nhiều dòng cùng Mã ĐT."),
    ("4_KE_HOACH", "Kế hoạch theo tháng × đối tác để so thực tế. Ô trống hiện '—', không hiện 0."),
    ("eVOUCHER", "Log mã của đối tác (iPOS › Voucher › xuất log theo chiến dịch) thả vào 05_DOI_TAC/02_eVoucher_Doi_Tac — "
                 "mỗi chiến dịch một file, xuất lại bản mới thì thả đè. Hệ thống tự gắn vào đối tác qua Campaign ID ở 3_CHUONG_TRINH."),
    ("SAU KHI SỬA", "Lưu file → ĐÓNG Excel → nháy đúp CAP_NHAT.bat (hoặc python update.py)."),
]
AGG_GUIDE = [
    ("MỤC ĐÍCH", "Số AGGREGATOR theo tháng — một file cho mọi tháng. Dòng đã xếp sẵn THÁNG → BRAND → nền tảng; tới tháng "
                 "chỉ việc điền số vào đúng dòng. Tên nền tảng, hoa hồng %, phí theo hợp đồng khai ở danh mục "
                 "05_DOI_TAC/01_Danh_Muc (sheet 2_AGGREGATOR)."),
    ("MÀU Ô", "CAM = cần điền · XANH = đã điền sẵn · XÁM = hệ thống tự lấy từ hoá đơn POS, KHÔNG điền."),
    ("TỰ THỐNG KÊ", "Dining City: POS không ghi nhận được → điền đủ booking, huỷ/no-show, khách đến, hoá đơn, doanh thu, "
                    "ưu đãi, hoa hồng / phí. Cột Cách tính: 'Đối soát hoá đơn' nếu ghép được hoá đơn, 'Ước tính' nếu không."),
    ("POS TỰ ĐỘNG", "Grab Dine Out · GrabFood: doanh thu, hoá đơn tự lấy từ POS (Nguồn = GRAB/GRABFOOD). Chỉ điền theo "
                    "sao kê Grab: Ưu đãi NOIRE chịu (giảm 20%/15% áp trên app — POS không ghi), Hoa hồng thực trả "
                    "(thay số ước tính 13,8%), Phí khác. GrabFood giao hàng: POS đã trừ hoa hồng sẵn trong doanh thu."),
    ("DOANH THU", "= TỔNG TIỀN hoá đơn khách trả (gồm VAT & phí phục vụ) — cùng cách tính Net Sales toàn hệ thống. "
                  "KHÔNG trừ hoa hồng / phí nền tảng (các khoản đó điền ở cột riêng)."),
    ("THÊM THÁNG", "Copy 5 dòng của tháng cuối, đổi cột Tháng. Thêm cửa hàng: điền cột Cửa hàng (mã NDC_NTMK, NJFB_CRE…)."),
    ("SAU KHI SỬA", "Lưu file → ĐÓNG Excel → nháy đúp CAP_NHAT.bat (hoặc python update.py)."),
]


def _styles():
    from openpyxl.styles import Border, PatternFill, Side
    thin = Side(style="thin", color="C9C9C9")
    return (PatternFill("solid", fgColor="1F1F26"),
            {"need": PatternFill("solid", fgColor="FFE3C4"), "seed": PatternFill("solid", fgColor="DDEBF7"),
             "auto": PatternFill("solid", fgColor="E7E6E6")},
            Border(left=thin, right=thin, top=thin, bottom=thin))


MONEY = {"fee", "media", "cap", "min_bill", "net", "disc_noire", "disc_platform", "commission", "fee_other",
         "fee_month", "fee_unit_amount", "aov", "rev", "cost", "gp"}
PCT = {"noire_share", "commission_pct", "use_rate"}


def _guide(wb, title, lines):
    from openpyxl.styles import Alignment, Font
    g = wb.active
    g.title = "HUONG_DAN"
    g.append([title])
    g["A1"].font = Font(bold=True, size=14)
    g.append([])
    for k, v in lines:
        g.append([k, v])
        g.cell(g.max_row, 1).font = Font(bold=True)
        g.cell(g.max_row, 2).alignment = Alignment(wrap_text=True, vertical="top")
    g.column_dimensions["A"].width = 18
    g.column_dimensions["B"].width = 120


def _sheet(wb, title, cols, rows, auto_cols_for=None):
    from openpyxl.comments import Comment
    from openpyxl.styles import Alignment, Font
    from openpyxl.worksheet.datavalidation import DataValidation
    HDR, FILL, BOX = _styles()
    ws = wb.create_sheet(title)
    ws.append([h for _, h, _, _, _, _ in cols])
    for j, (key, h, w, kind, tip, opts) in enumerate(cols, 1):
        c = ws.cell(1, j)
        c.font = Font(bold=True, color="F3F2EE")
        c.fill = HDR
        c.alignment = Alignment(wrap_text=True, vertical="center")
        c.border = BOX
        if tip:
            c.comment = Comment(tip, "NOIRE")
        ws.column_dimensions[c.column_letter].width = w
        if opts:
            dv = DataValidation(type="list", formula1='"%s"' % ",".join(opts), allow_blank=True)
            dv.add(f"{c.column_letter}2:{c.column_letter}500")
            ws.add_data_validation(dv)
    ws.row_dimensions[1].height = 42
    for r in rows:
        ws.append([r.get(key) for key, *_ in cols])
        i = ws.max_row
        auto = auto_cols_for(r) if auto_cols_for else set()
        for j, (key, _, _, kind, _, _) in enumerate(cols, 1):
            c = ws.cell(i, j)
            k = "auto" if key in auto else ("seed" if (kind == "seed" or r.get(key) not in (None, "")) else "need")
            c.fill = FILL[k]
            c.border = BOX
            if key in MONEY:
                c.number_format = "#,##0"
            elif key in PCT:
                c.number_format = "0.0%"
            elif key == "rate":
                c.number_format = "0.0%;;" if isinstance(r.get(key), float) and r.get(key) < 1 else "#,##0"
            elif key in ("start", "end"):
                c.number_format = "yyyy-mm-dd"
            elif key == "month":
                c.number_format = "@"
            if key in auto:
                c.value = "POS tự lấy"
                c.font = Font(italic=True, color="7F7F7F")
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = ws.dimensions
    return ws


def build_catalog(path):
    from openpyxl import Workbook
    wb = Workbook()
    _guide(wb, "NOIRE · DANH MỤC ĐỐI TÁC — PARTNER + AGGREGATOR", GUIDE)
    _sheet(wb, "1_PARTNER", PARTNER_COLS, PARTNERS)
    _sheet(wb, "2_AGGREGATOR", AGG_COLS, AGGS)
    _sheet(wb, "3_CHUONG_TRINH", PROG_COLS, PROGRAMS)
    _sheet(wb, "4_KE_HOACH", PLAN_COLS,
           [dict(month=m, code=c, name=NAME.get(c), scenario="Cơ sở", issued=i, use_rate=u, aov=a, rev=r, cost=co, gp=gp)
            for m, c, i, u, a, r, co, gp in PLAN])
    wb.save(path)


def build_agg(path):
    from openpyxl import Workbook
    wb = Workbook()
    _guide(wb, "NOIRE · SỐ AGGREGATOR THEO THÁNG", AGG_GUIDE)
    rows = []
    for m in MONTHS:                                    # xếp THÁNG → BRAND → nền tảng
        for brand, code, plat in AGG_ROWS:
            rows.append(dict(month=m, brand=brand, code=code, platform=plat, **AGG_SEED.get((m, brand, code), {})))
    POS_AUTO = {"bookings", "cancels", "guests", "bills", "net"}
    _sheet(wb, "AGG_THANG", AGG_MONTH_COLS, rows,
           auto_cols_for=lambda r: POS_AUTO if r["code"] in POS_CODES else set())
    wb.save(path)


def sync_cols(path, sheets):
    """Thêm CỘT còn thiếu vào file đang dùng — không chạm dòng dữ liệu nào.

    Mẫu chuẩn lớn lên (thêm 'Giá trị media quy đổi', 'Tên khác trên báo cáo'…) mà file người
    dùng đang điền vẫn là bản cũ thì cột mới không có chỗ nhập, và dữ liệu file gốc rơi mất.
    Hàm này nối cột mới vào CUỐI sheet, giữ nguyên thứ tự và nội dung cột cũ."""
    from openpyxl import load_workbook
    from openpyxl.comments import Comment
    from openpyxl.styles import Alignment, Font
    from openpyxl.worksheet.datavalidation import DataValidation
    HDR, FILL, BOX = _styles()
    wb = load_workbook(path)
    added = []
    for sheet, cols in sheets.items():
        if sheet not in wb.sheetnames:
            continue
        ws = wb[sheet]
        have = {str(c.value).strip() for c in ws[1] if c.value}
        for key, h, w, kind, tip, opts in cols:
            if h in have:
                continue
            j = ws.max_column + 1
            c = ws.cell(1, j, h)
            c.font = Font(bold=True, color="F3F2EE")
            c.fill = HDR
            c.alignment = Alignment(wrap_text=True, vertical="center")
            c.border = BOX
            if tip:
                c.comment = Comment(tip, "NOIRE")
            ws.column_dimensions[c.column_letter].width = w
            if opts:
                dv = DataValidation(type="list", formula1='"%s"' % ",".join(opts), allow_blank=True)
                dv.add(f"{c.column_letter}2:{c.column_letter}500")
                ws.add_data_validation(dv)
            for i in range(2, ws.max_row + 1):
                cell = ws.cell(i, j)
                cell.fill = FILL["need"]
                cell.border = BOX
                if key in MONEY:
                    cell.number_format = "#,##0"
                elif key in PCT:
                    cell.number_format = "0.0%"
            added.append(f"{sheet}.{h}")
    if added:
        wb.save(path)
    return added


def main(argv):
    force = "--force" in argv
    sync = "--sync-cols" in argv
    SHEETS = {OUT_NAME: {"1_PARTNER": PARTNER_COLS, "2_AGGREGATOR": AGG_COLS,
                         "3_CHUONG_TRINH": PROG_COLS, "4_KE_HOACH": PLAN_COLS},
              AGG_NAME: {"AGG_THANG": AGG_MONTH_COLS}}
    for sid, name, fn in (("S15_partnership", OUT_NAME, build_catalog), ("S19_aggregator", AGG_NAME, build_agg)):
        d = l0_dir(sid)
        if not d:
            print(f"không thấy thư mục nguồn {sid}")
            return 1
        path = os.path.join(d, name)
        if os.path.exists(path) and sync:
            try:
                added = sync_cols(path, SHEETS[name])
            except PermissionError:
                print(f"{name} đang mở trong Excel — đóng file rồi chạy lại.")
                continue
            print(f"{name}: thêm {len(added)} cột — {', '.join(added) or 'đã đủ cột'}")
            continue
        if os.path.exists(path) and not force:
            print(f"{name} đã có — KHÔNG ghi đè số bạn đã nhập. Dùng --sync-cols để thêm cột mới, "
                  f"--force để tạo lại từ đầu.")
            continue
        fn(path)
        print(f"→ {os.path.relpath(path)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
