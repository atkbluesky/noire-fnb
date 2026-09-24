# -*- coding: utf-8 -*-
"""
SỔ ĐÁNH GIÁ CHƯƠNG TRÌNH TRƯỚC KHI CHẠY — Pre_Analysis_2026.xlsx   (M7.1)
========================================================================
    python tools/preeval_template.py            tạo sổ (từ chối nếu đã có)
    python tools/preeval_template.py --refresh  sổ đã có: CHỈ làm mới 3 sheet dữ liệu nền NEN_*

MỘT SỔ CHO CẢ NĂM — KHÔNG LÀM MỖI CHƯƠNG TRÌNH MỘT FILE:
  · nhập tay tối thiểu: chuong_trinh (1 dòng) · co_che (mỗi scheme 1 dòng) · mon · chi_phi
  · dữ liệu nền KHÔNG gõ: TC · AOV · TA · giá bán · giá vốn · CTKM cũ → hệ thống điền ở sheet NEN_*
    và engine tools/preeval.py tự tính lại theo đúng cửa hàng + kỳ nền của từng chương trình
  · công thức MỘT nơi (tools/preeval.py) → phiếu đánh giá từng chương trình trên M7.1 (in được)

Khung phiếu = PP672 (Program's Details + Financial Evaluation + chi phí vận hành → EBITDA tăng thêm)
× SALES = TC × AOV (TC_AOV_FnB_Marketing.pdf). Tham số mặc định: data_contract.json → $preeval.
"""
from __future__ import annotations

import os
import sys
from collections import defaultdict
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import CONTRACT, STORE_META, l0_dir, read_workbook  # noqa: E402
import campaign as E  # noqa: E402
import campaign_template as TPL  # noqa: E402

P = CONTRACT["$preeval"]
C = CONTRACT["$campaign"]
OUT_NAME = "Pre_Analysis_2026.xlsx"

# ───────────────────────── cột nhập tay (chú thích = tiêu đề) ─────────────────────────
PROGRAM_COLS = [
    ("program_id", "Mã chương trình kế hoạch: BRAND-YYYY-MM-TÊNNGẮN."),
    ("name", "Tên chương trình."),
    ("brand", "NCB · NDC · NJFB · ALL"),
    ("store_scope", "Mã cửa hàng áp dụng, ngăn bằng | (xem NEN_CUA_HANG)."),
    ("date_from", "Ngày bắt đầu dự kiến."),
    ("date_to", "Ngày kết thúc dự kiến."),
    ("dow", "Chỉ chạy vào thứ nào: 0=T2 … 6=CN, ngăn bằng | (vd Monday Treat = 0). Trống = mọi ngày. Kỳ nền cũng chỉ lấy đúng các thứ này."),
    ("objective", "TC · AOV · BRANDING"),
    ("lever_primary", "Phương án (TC_AOV_FnB_Marketing.pdf) — xem DANH_MUC."),
    ("content", "Nội dung chương trình: ưu đãi, điều kiện, đối tượng, truyền thông."),
    ("hypothesis", "Giả thuyết viết TRƯỚC khi chạy."),
    ("offer", "CƠ CHẾ NHANH — mô tả ưu đãi 1 câu. Chương trình 1 scheme chỉ cần điền các cột cơ chế nhanh này, KHÔNG cần sheet co_che."),
    ("condition", "CƠ CHẾ NHANH — điều kiện: NONE · MIN_BILL · BUY_ITEMS · GROUP_SIZE · PREBOOK · MEMBER"),
    ("min_bill", "CƠ CHẾ NHANH — hoá đơn tối thiểu (giá menu)."),
    ("min_guests", "CƠ CHẾ NHANH — số khách tối thiểu."),
    ("benefit", "CƠ CHẾ NHANH — ưu đãi: NONE · PCT_OFF_BILL · PCT_OFF_ITEMS · FIXED_OFF · FIXED_PRICE · GIFT_ITEM · GIFT_MERCH"),
    ("benefit_value", "CƠ CHẾ NHANH — % (0–1) hoặc số tiền hoặc giá set."),
    ("discount_cap", "CƠ CHẾ NHANH — trần giảm / hoá đơn."),
    ("item_codes", "CƠ CHẾ NHANH — món phải mua: MÃ*SL|MÃ*SL (vd FMN0006MK*1|BIR0005*2). Tra NEN_MON."),
    ("gift_codes", "CƠ CHẾ NHANH — món tặng: MÃ*SL (vd FCK0005*1)."),
    ("merch_unit_cost", "CƠ CHẾ NHANH — đơn giá quà vật phẩm chưa VAT."),
    ("stock_qty", "CƠ CHẾ NHANH — số suất / quà giới hạn."),
    ("season_factor", "Hệ số mùa vụ kỳ chạy so với kỳ nền (vd lễ cuối năm 1,15). Trống = 1. Kỳ nền là 56 ngày gần nhất có số — không có số cùng kỳ năm trước."),
    ("status", "NHAP (ý tưởng) · TRINH_DUYET · DA_DUYET · TU_CHOI · MAU (ví dụ)"),
    ("owner", "Người lập."),
    ("submitted", "Ngày trình duyệt — M7.2 chỉ chấm ĐẠT khi trình TRƯỚC ngày chạy."),
    ("campaign_id", "Mã chương trình ở Campaign_Tracking (khi đã chạy) — để M7.1 đặt thực tế cạnh dự báo."),
    ("base_from", "Kỳ nền tự chọn (tuỳ chọn). Trống = 56 ngày ngay trước ngày bắt đầu."),
    ("base_to", "Kỳ nền đến ngày (tuỳ chọn)."),
    ("participation_pct", "% hoá đơn cửa hàng tham gia (0–1). Trống = 3%. Tra CTKM tương tự ở NEN_CTKM."),
    ("est_bills", "Tổng hoá đơn tham gia dự kiến (ghi đè participation_pct)."),
    ("cannib_pct", "% hoá đơn tham gia mà KHÔNG có chương trình khách vẫn đến (0–1). Trống = mặc định theo phương án."),
    ("uplift_pct", "Khách vốn sẽ đến đổi mức chi khi tham gia (0,2 = chi thêm 20% giá trị hoá đơn; âm = chi ít hơn). Trống = 0; set đồng giá = 1 − TA × khách ÷ giá set."),
    ("other_cogs_pct", "Giá vốn % của các món khác trong hoá đơn. Trống = mặc định theo brand (Kế toán khoá)."),
    ("note", "Ghi chú."),
]
SCHEME_COLS = [
    ("program_id", "Mã ở chuong_trinh."),
    ("scheme_id", "S1, S2… — mỗi cơ chế một dòng."),
    ("scheme_name", "Tên cơ chế."),
    ("condition", "Điều kiện: NONE · MIN_BILL · BUY_ITEMS · GROUP_SIZE · PREBOOK · MEMBER"),
    ("min_bill", "Hoá đơn tối thiểu — GIÁ MENU trước phí DV + VAT (cùng nền với POS Thành tiền)."),
    ("min_guests", "Số khách tối thiểu (GROUP_SIZE)."),
    ("benefit", "Ưu đãi: NONE · PCT_OFF_BILL · PCT_OFF_ITEMS · FIXED_OFF · FIXED_PRICE · GIFT_ITEM · GIFT_MERCH"),
    ("benefit_value", "PCT_*: tỷ lệ 0–1 · FIXED_OFF: số tiền · FIXED_PRICE: giá bộ món REQUIRED (giá menu)."),
    ("discount_cap", "Trần giảm / hoá đơn (tuỳ chọn)."),
    ("merch_name", "Tên vật phẩm (GIFT_MERCH)."),
    ("merch_unit_cost", "Đơn giá vật phẩm CHƯA VAT."),
    ("merch_vat_pct", "VAT vật phẩm (mặc định 0,08)."),
    ("stock_qty", "Số lượng quà / suất giới hạn — hoá đơn tham gia không vượt quá số này."),
    ("share_pct", "Tỷ trọng nhu cầu của scheme trong chương trình (0–1). Trống = chia đều."),
    ("est_bills", "Hoá đơn dự kiến riêng scheme (ghi đè)."),
    ("bill_value", "Giá trị menu 1 hoá đơn tham gia (ghi đè). Trống = giá bộ món (set đồng giá / món mới) · TA × min_guests · max(AOV nền; min_bill × 1,2) · AOV nền."),
    ("note", "Ghi chú."),
]
ITEM_COLS = [
    ("program_id", "Mã ở chuong_trinh."),
    ("scheme_id", "Mã ở co_che."),
    ("role", "REQUIRED = món phải mua · GIFT = món được tặng."),
    ("item_code", "Mã hàng POS (tra NEN_MON)."),
    ("item_name", "Tên món."),
    ("qty", "Số lượng / hoá đơn (có thể lẻ: 3 món LTO mua 2 ly bất kỳ → mỗi món 0,667)."),
    ("price", "Giá menu CHƯA VAT. Trống = giá bán bình quân trên POS."),
    ("unit_cogs", "Giá vốn / món CHƯA VAT. Trống = BOM; món chưa có BOM phải điền."),
    ("note", "Ghi chú."),
]
COST_COLS = [
    ("program_id", "Mã ở chuong_trinh."),
    ("cost_type", "MERCH · KOL · ADS · PRINT · AGENCY · OTHER (quà theo scheme khai ở co_che, không khai lại)."),
    ("amount", "Số tiền CHƯA VAT."),
    ("vat_pct", "VAT (mặc định 0,08)."),
    ("note", "Diễn giải."),
]
OPEX_COLS = [
    ("code", "Mã khoản chi."), ("label", "Khoản chi vận hành."),
    ("type", "VARIABLE = tăng theo doanh thu · FIXED = cố định (không tính vào tăng thêm)."),
    ("act_on_incr", "1 = tính trên doanh thu TĂNG THÊM của chương trình."),
    ("NCB", "% doanh thu thuần — NCB"), ("NDC", "% doanh thu thuần — NDC"), ("NJFB", "% doanh thu thuần — NJFB"),
    ("note", "Nguồn / trạng thái."),
]
OPEX_SEED = [
    ("STAFF", "Lương & phúc lợi — phần tăng ca / part-time", "VARIABLE", 1, 0.03, 0.03, 0.03),
    ("CONSUMABLES", "Vật tư tiêu hao (ly, ống hút, giấy, bao bì)", "VARIABLE", 1, 0.03, 0.025, 0.025),
    ("UTILITIES", "Điện · nước · gas — phần tăng theo công suất", "VARIABLE", 1, 0.02, 0.02, 0.02),
    ("PAYMENT_FEE", "Phí cà thẻ / ví điện tử", "VARIABLE", 1, 0.012, 0.012, 0.012),
    ("AGG_FEE", "Hoa hồng nền tảng (chỉ khi bán qua Grab / DiningCity)", "VARIABLE", 0, 0.0, 0.0, 0.0),
    ("RENT", "Thuê mặt bằng", "FIXED", 0, None, None, None),
    ("ADMIN", "Quản lý · phân bổ văn phòng", "FIXED", 0, None, None, None),
]

# ───────────────────────── 3 chương trình mẫu — 3 cách phân tích ─────────────────────────
SAMPLES = [
    dict(
        program=dict(program_id="ALL-2026-06-LTOSUMMER", name="LTO Summer Crush — 3 ly LTO + quà merch",
                     brand="ALL", store_scope="NDC_NTMK|NCB_ET|NCB_MET|NCB_SKC",
                     date_from="2026-06-20", date_to="2026-07-20", objective="AOV", lever_primary="AOV_VALUE",
                     content="3 món LTO (Kyoto Berry · Peachy Berry · Blush Garden) 89K. Scheme 1: mua 2 ly LTO tặng khăn Bandana. Scheme 2: bill ≥300K có ≥1 ly LTO tặng quạt nan gỗ. Mỗi bill 1 quà.",
                     hypothesis="LTO + quà merch kéo thêm ly LTO và bill ≥300K; kỳ vọng 900 ly, 600 hoá đơn nhận quà trong 1 tháng.",
                     status="MAU", owner="Brand NCB/NDC", submitted="2026-06-10", campaign_id="ALL-2026-06-LTOSUMMERCRUSH",
                     participation_pct=0.065,
                     note="Dựng lại từ file 'Noire LTO Summer Pre Analytics' — participation 6,5% = mức cần để hết 600 quà (sheet Store Runrate)."),
        schemes=[
            dict(scheme_id="S1", scheme_name="Mua 2 ly LTO tặng khăn Bandana", condition="BUY_ITEMS", benefit="GIFT_MERCH",
                 merch_name="Khăn lụa Bandana 70×70", merch_unit_cost=54000, merch_vat_pct=0.08, stock_qty=300, share_pct=0.5),
            dict(scheme_id="S2", scheme_name="Bill ≥300K có ≥1 ly LTO tặng quạt", condition="MIN_BILL", min_bill=300000,
                 benefit="GIFT_MERCH", merch_name="Quạt nan gỗ in 2 mặt", merch_unit_cost=80000, merch_vat_pct=0.08,
                 stock_qty=300, share_pct=0.5),
        ],
        items=[
            ("S1", "REQUIRED", "LTD0009", "Kyoto Berry", 2 / 3, 89000, 20647),
            ("S1", "REQUIRED", "LTD0010", "Peachy Berry", 2 / 3, 89000, 20446),
            ("S1", "REQUIRED", "LTD0008", "Blush Garden", 2 / 3, 89000, 18687),
            ("S2", "REQUIRED", "LTD0009", "Kyoto Berry", 1 / 3, 89000, 20647),
            ("S2", "REQUIRED", "LTD0010", "Peachy Berry", 1 / 3, 89000, 20446),
            ("S2", "REQUIRED", "LTD0008", "Blush Garden", 1 / 3, 89000, 18687),
        ],
        costs=[("KOL", 20000000, 0.08, "Review TikToker (kế hoạch)")],
    ),
    dict(
        program=dict(program_id="NDC-2026-10-SET2010", name="20/10 — Set menu cho 2 người 899K",
                     brand="NDC", store_scope="NDC_NTMK|NDC_BKL", date_from="2026-10-15", date_to="2026-10-21",
                     objective="AOV", lever_primary="AOV_PRICE",
                     content="Tuần lễ 20/10: set 2 người gồm Aukobe Steak + Cá hồi áp chảo + Tiramisu + 2 Trà đào, giá 899K (menu lẻ ~1,09tr).",
                     hypothesis="Set đồng giá kéo nhóm 2 người đặt bữa tối dịp 20/10, AOV nhóm tăng 15%.",
                     offer="Set 2 người 899K", condition="NONE", benefit="FIXED_PRICE", benefit_value=899000,
                     item_codes="FMN0006MK*1|FMN0009MK*1|FDS0002MK*1|BIR0005*2", season_factor=1.1,
                     participation_pct=0.08, status="MAU", owner="Brand NDC",
                     note="Ý TƯỞNG Q4 MẪU — 1 dòng, cơ chế nhanh, không cần sheet co_che. Hệ số mùa vụ 1,1 là giả định."),
        schemes=[], items=[], costs=[("PRINT", 2000000, 0.08, "POSM + menu set (giả định mẫu)")],
    ),
    dict(
        program=dict(program_id="NCB-2026-12-XMASCAKE", name="Giáng sinh — bill ≥300K tặng bánh",
                     brand="NCB", store_scope="NCB_ET|NCB_MET|NCB_SKC", date_from="2026-12-15", date_to="2026-12-31",
                     objective="AOV", lever_primary="AOV_QTY",
                     content="Mùa Giáng sinh: hoá đơn từ 300K tặng 1 Basque Burnt Cheesecake.",
                     hypothesis="Ngưỡng 300K kéo khách gọi thêm món, AOV tăng 10% trong mùa lễ.",
                     offer="Bill ≥300K tặng Basque cheesecake", condition="MIN_BILL", min_bill=300000,
                     benefit="GIFT_ITEM", gift_codes="FCK0005*1", season_factor=1.15, participation_pct=0.10,
                     status="MAU", owner="Brand NCB",
                     note="Ý TƯỞNG Q4 MẪU — 1 dòng, cơ chế nhanh. Hệ số mùa vụ 1,15 là giả định (chưa có số Q4 năm trước)."),
        schemes=[], items=[], costs=[("ADS", 5000000, 0.08, "Ads mùa lễ (giả định mẫu)")],
    ),
    dict(
        program=dict(program_id="NDC-2026-09-PREBOOK15", name="Pre-booking 15% toàn hoá đơn",
                     brand="NDC", store_scope="NDC_NTMK", date_from="2026-09-21", date_to="2026-10-20",
                     objective="TC", lever_primary="TC_BASE",
                     content="Đặt bàn trước qua hotline / fanpage được giảm 15% toàn hoá đơn.",
                     hypothesis="Giảm 15% cho khách đặt trước kéo thêm khách mới, TC tăng 20%.",
                     status="MAU", owner="Brand NDC", est_bills=44, cannib_pct=0.8,
                     note="Từ Pre-Analysis Q3 (D3): Est TC 44, Growth 20% → chỉ ~1/6 hoá đơn là khách mới (cannib ≈ 80%). Kế hoạch cảnh báo: giảm trên TOÀN hoá đơn → biên mỏng nếu phần lớn khách vốn đã đến."),
        schemes=[dict(scheme_id="S1", scheme_name="Đặt bàn trước giảm 15%", condition="PREBOOK", benefit="PCT_OFF_BILL",
                      benefit_value=0.15)],
        items=[], costs=[("ADS", 3000000, 0.08, "Boost bài đặt bàn (giả định mẫu)")],
    ),
    dict(
        program=dict(program_id="NDC-2026-08-MONDAYTREAT", name="The Monday Treat — tặng dessert thứ 2",
                     brand="NDC", store_scope="NDC_NTMK", date_from="2026-08-17", date_to="2026-09-28", dow="0",
                     objective="TC", lever_primary="TC_DAYPART",
                     content="Mỗi thứ 2: hoá đơn dùng bữa được tặng 1 dessert.",
                     hypothesis="Tặng dessert thứ 2 lấp ngày thấp điểm đầu tuần, TC thứ 2 tăng 15%.",
                     status="MAU", owner="Brand NDC", campaign_id="NDC-2026-08-DININGMONDAY", participation_pct=0.05,
                     note="Từ Pre-Analysis Q3 (G1). Chỉ tính các ngày thứ 2 — kỳ nền cũng chỉ lấy thứ 2."),
        schemes=[dict(scheme_id="S1", scheme_name="Tặng 1 dessert", condition="NONE", benefit="GIFT_ITEM")],
        items=[("S1", "GIFT", "FDS0001MK", "Panna Cotta", 1, None, None)],
        costs=[],
    ),
]

GUIDE = [
    ("M7.1 · SỔ ĐÁNH GIÁ CHƯƠNG TRÌNH TRƯỚC KHI CHẠY", True),
    ("", False),
    ("VÌ SAO MỘT SỔ, KHÔNG PHẢI MỖI CHƯƠNG TRÌNH MỘT FILE", True),
    ("· Dữ liệu nền (TC · AOV · TA · giá · giá vốn · CTKM cũ) hệ thống tự lấy từ POS — không chép tay vào từng file.", False),
    ("· Công thức nằm MỘT nơi (tools/preeval.py) → mọi chương trình được chấm cùng một thước đo, so sánh xếp hạng được.", False),
    ("· Chương trình đã chạy tự nối sang M7.2 → thực tế đặt cạnh dự báo, mô hình học lại cho lần sau.", False),
    ("· Cần file trình ký: M7.1 → chọn chương trình → In phiếu (khổ ngang, đúng bố cục PP672).", False),
    ("", False),
    ("LẬP KẾ HOẠCH QUÝ (vd Q4/2026) — 3 BƯỚC", True),
    ("B1 · Ý TƯỞNG: mỗi ý tưởng 1 dòng ở chuong_trinh, status = NHAP. Chỉ cần: tên · cửa hàng · ngày · mục tiêu → phương án · CƠ CHẾ NHANH (offer · condition · benefit · giá trị · món) · participation_pct.", False),
    ("     → CAP_NHAT.bat: M7.1 xếp hạng mọi ý tưởng, nói ngay ý tưởng nào lỗ / cần sửa cơ chế.", False),
    ("B2 · CHI TIẾT: ý tưởng qua vòng 1 → thêm scheme ở co_che (nếu nhiều scheme), món ở mon, chi phí ở chi_phi, chỉnh cannib_pct / season_factor. Đổi status = TRINH_DUYET, ghi submitted.", False),
    ("B3 · DUYỆT: M7.1 → phiếu đánh giá → In phiếu trình ký. Khi chạy: thêm tên CTKM POS vào Campaign_Tracking + điền campaign_id ở đây → M7.1 đặt thực tế cạnh dự báo.", False),
    ("Dữ liệu nền (TC · AOV · TA · giá · giá vốn) KHÔNG cần đưa vào — hệ thống lấy 56 ngày gần nhất trên POS. Q4 chưa có số cùng kỳ năm trước → dùng season_factor cho mùa lễ.", False),
    ("", False),
    ("THỨ TỰ NHẬP CHI TIẾT (mỗi chương trình ~5 phút)", True),
    ("1. chuong_trinh — 1 dòng: cửa hàng, ngày, mục tiêu · phương án, nội dung, giả thuyết. Ước lượng tham gia: participation_pct HOẶC est_bills.", False),
    ("2. co_che — mỗi scheme 1 dòng: điều kiện + ưu đãi (+ quà, số lượng giới hạn).", False),
    ("3. mon — món phải mua (REQUIRED) / món tặng (GIFT). Giá & giá vốn trống = lấy POS/BOM; món chưa có BOM phải điền giá vốn.", False),
    ("4. chi_phi — merch ngoài scheme, KOL, POSM, ads. Quà theo scheme đã khai ở co_che thì không khai lại.", False),
    ("5. ty_le_chi_phi — Finance khoá 1 lần/năm (ô CAM là số tạm).", False),
    ("6. Nháy đúp CAP_NHAT.bat → M7.1 hiện phiếu đánh giá + quyết định: DUYỆT CHẠY · CHẠY THỬ CÓ ĐIỀU KIỆN · SỬA CƠ CHẾ.", False),
    ("", False),
    ("PHIẾU ĐÁNH GIÁ TÍNH GÌ (khung PP672 × SALES = TC × AOV)", True),
    ("· Program's details: mỗi scheme — TA · TC · doanh thu sau giảm · %Margin · %COGS.", False),
    ("· Financial evaluation: Base (kỳ nền quy về số ngày chạy) · Không KM · Có KM · Tổng · %Cannib · Tăng thêm · %Tăng thêm.", False),
    ("· Chi phí vận hành tăng thêm (ty_le_chi_phi) + quà + chi phí chương trình → EBITDA TĂNG THÊM.", False),
    ("· 3 kịch bản (Thận trọng · Cơ sở · Lạc quan) + điểm hoà vốn: cần bao nhiêu hoá đơn, chịu được %cannib tối đa bao nhiêu.", False),
    ("", False),
    ("3 CHƯƠNG TRÌNH MẪU (status = MAU) — 3 cách phân tích khác nhau", True),
    ("· LTO Summer Crush: món mới + quà merch có giới hạn số lượng, 2 scheme (mua 2 ly / bill ≥300K).", False),
    ("· Pre-booking 15%: giảm % toàn hoá đơn — rủi ro cannibalization cao.", False),
    ("· The Monday Treat: tặng món, chỉ chạy thứ 2 — kỳ nền chỉ lấy thứ 2.", False),
    ("Tạo chương trình mới: chép 1 dòng mẫu, đổi program_id, sửa số. Sổ không có công thức Excel — sửa số thoải mái, không vỡ file.", False),
]


def CODES(k):
    return [x["code"] for x in C[k]]


# ───────────────────────── dữ liệu nền (NEN_*) ─────────────────────────
def base_sheets():
    import glob
    from monthly_lib import MONTHLY_DIR, DATA_INPUT, to_num
    stores = defaultdict(lambda: dict(net=0.0, tc=0.0, guest=0.0, days=set()))
    for f in sorted(glob.glob(os.path.join(MONTHLY_DIR, "*.xlsx"))):
        wb = read_workbook(f, {"daily"})
        for r in wb.get("daily", []):
            m = str(r.get("date"))[:7]
            x = stores[(r["store"], m)]
            x["net"] += to_num(r.get("net"), 0) or 0
            x["tc"] += to_num(r.get("tc"), 0) or 0
            x["guest"] += to_num(r.get("guest"), 0) or 0
            x["days"].add(str(r.get("date")))
    nen_ch = []
    for (st, m), x in sorted(stores.items()):
        meta = STORE_META.get(st, {})
        nd = len(x["days"]) or 1
        nen_ch.append(dict(store=st, brand=meta.get("brand"), name=meta.get("name"), month=m, days=nd,
                           net_incl=round(x["net"]), tc=round(x["tc"]), guests=round(x["guest"]),
                           aov_incl=round(x["net"] / x["tc"]) if x["tc"] else None,
                           ta_incl=round(x["net"] / x["guest"]) if x["guest"] else None,
                           tc_day=round(x["tc"] / nd, 1)))
    snap = read_workbook(os.path.join(DATA_INPUT, "02_snapshot.xlsx"), {"product"})
    nen_mon = []
    for r in snap.get("product", []):
        q = to_num(r.get("qty"), 0) or 0
        if not q:
            continue
        cg = to_num(r.get("cogs"), 0) or 0
        nen_mon.append(dict(item_code=r.get("ma"), item_name=r.get("name"), cat=r.get("cat"), grp=r.get("grp"),
                            qty=round(q), price=round((to_num(r.get("rev"), 0) or 0) / q),
                            unit_cogs=round(cg / q) if cg else None,
                            cogs_pct=round(cg / (to_num(r.get("rev"), 0) or 1), 4) if cg else None))
    nen_mon.sort(key=lambda x: (str(x["grp"]), -x["qty"]))
    camp = read_workbook(os.path.join(DATA_INPUT, "03_campaign.xlsx"), {"campaign_result", "dim_campaign"})
    dims = {r["campaign_id"]: r for r in camp.get("dim_campaign", [])}
    nen_ctkm = []
    for r in camp.get("campaign_result", []):
        b = to_num(r.get("promo_bills"), 0) or 0
        if not b:
            continue
        d = dims.get(r["campaign_id"], {})
        days = to_num(r.get("days_run"), 0) or 0
        stc = to_num(r.get("store_tc"), 0) or 0
        net = to_num(r.get("promo_net"), 0) or 0
        snet = to_num(r.get("store_net"), 0) or 0
        nen_ctkm.append(dict(campaign_id=r["campaign_id"], name=d.get("name"), brand=d.get("brand"),
                             objective=d.get("objective"), lever=d.get("lever_primary"), mechanic=d.get("mechanic"),
                             period=f"{r.get('period_from')} → {r.get('period_to')}", days=round(days),
                             bills=round(b), bills_day=round(b / days, 2) if days else None,
                             participation_pct=round(b / stc, 4) if stc else None,
                             aov_incl=round(net / b), aov_vs_store=round((net / b) / (snet / stc) - 1, 3) if stc and snet else None,
                             incr_net=r.get("incr_net"), label=r.get("label")))
    nen_ctkm.sort(key=lambda x: -(x["bills"] or 0))
    return nen_ch, nen_mon, nen_ctkm


NEN_CH_COLS = [(k, "") for k in ("store", "brand", "name", "month", "days", "net_incl", "tc", "guests", "aov_incl", "ta_incl", "tc_day")]
NEN_MON_COLS = [(k, "") for k in ("item_code", "item_name", "cat", "grp", "qty", "price", "unit_cogs", "cogs_pct")]
NEN_CTKM_COLS = [(k, "") for k in ("campaign_id", "name", "brand", "objective", "lever", "mechanic", "period", "days",
                                    "bills", "bills_day", "participation_pct", "aov_incl", "aov_vs_store", "incr_net", "label")]


def write(path):
    from openpyxl import Workbook
    from openpyxl.comments import Comment
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    HDR = PatternFill("solid", fgColor="1F1F26")
    REF = PatternFill("solid", fgColor="2D3A2E")
    PF = {k: PatternFill("solid", fgColor=v) for k, v in TPL.FILL.items()}
    wb = Workbook()
    g = wb.active
    g.title = "HUONG_DAN"
    for t, bold in GUIDE:
        g.append([t])
        g.cell(g.max_row, 1).font = Font(bold=bold, size=12 if bold else 10)
    g.column_dimensions["A"].width = 140

    def sheet(name, cols, rows, fills=None, ref=False):
        ws = wb.create_sheet(name)
        for j, (col, desc) in enumerate(cols, 1):
            c = ws.cell(1, j, col)
            c.font = Font(bold=True, color="F3F2EE")
            c.fill = REF if ref else HDR
            c.alignment = Alignment(horizontal="center")
            if desc:
                c.comment = Comment(desc, "NOIRE")
            ws.column_dimensions[get_column_letter(j)].width = max(12, min(48, len(col) + 6))
        for i, r in enumerate(rows):
            ws.append([r.get(col) for col, _ in cols])
            for j, (col, _) in enumerate(cols, 1):
                k = (fills or {}).get((i, col))
                if k:
                    ws.cell(ws.max_row, j).fill = PF[k]
        ws.freeze_panes = "C2"
        if rows:
            ws.auto_filter.ref = ws.dimensions
        return ws

    progs, schemes, items, costs = [], [], [], []
    for smp in SAMPLES:
        progs.append(smp["program"])
        pid = smp["program"]["program_id"]
        schemes += [dict(program_id=pid, **s) for s in smp["schemes"]]
        items += [dict(program_id=pid, scheme_id=a, role=b, item_code=c, item_name=d, qty=round(q, 4), price=pr, unit_cogs=cg)
                  for a, b, c, d, q, pr, cg in smp["items"]]
        costs += [dict(program_id=pid, cost_type=t, amount=v, vat_pct=vat, note=n) for t, v, vat, n in smp["costs"]]
    sample_fill = {(i, col): "sample" for i in range(len(progs)) for col, _ in PROGRAM_COLS}
    ws_p = sheet("chuong_trinh", PROGRAM_COLS, progs, sample_fill)
    ws_s = sheet("co_che", SCHEME_COLS, schemes, {(i, c): "sample" for i in range(len(schemes)) for c, _ in SCHEME_COLS})
    sheet("mon", ITEM_COLS, items, {(i, c): "sample" for i in range(len(items)) for c, _ in ITEM_COLS})
    ws_c = sheet("chi_phi", COST_COLS, costs, {(i, c): "sample" for i in range(len(costs)) for c, _ in COST_COLS})
    opex = [dict(code=a, label=b, type=t, act_on_incr=act, NCB=x, NDC=y, NJFB=z,
                 note="SỐ TẠM — Finance khoá" if x is not None else "cố định — không tính vào tăng thêm")
            for a, b, t, act, x, y, z in OPEX_SEED]
    sheet("ty_le_chi_phi", OPEX_COLS, opex,
          {(i, c): "need" for i, o in enumerate(opex) for c in ("NCB", "NDC", "NJFB") if o["NCB"] is not None})

    lists = {"brand": ["NCB", "NDC", "NJFB", "ALL"], "objective": CODES("objectives"), "lever": CODES("levers"),
             "status": ["NHAP", "TRINH_DUYET", "DA_DUYET", "TU_CHOI", "MAU"],
             "condition": [x["code"] for x in P["conditions"]], "benefit": [x["code"] for x in P["benefits"]],
             "role": ["REQUIRED", "GIFT"], "cost_type": ["MERCH", "KOL", "ADS", "PRINT", "AGENCY", "OTHER"],
             "store": sorted(STORE_META)}
    dm = wb.create_sheet("DANH_MUC")
    ranges = {}
    for j, (k, vals) in enumerate(lists.items(), 1):
        dm.cell(1, j, k).font = Font(bold=True)
        for i, v in enumerate(vals, 2):
            dm.cell(i, j, v)
        L = get_column_letter(j)
        ranges[k] = f"DANH_MUC!${L}$2:${L}${len(vals) + 1}"
    j0 = len(lists) + 2
    i = 2
    for key, items_ in (("objectives", C["objectives"]), ("levers", C["levers"]),
                        ("conditions", P["conditions"]), ("benefits", P["benefits"])):
        for x in items_:
            dm.cell(i, j0, x["code"])
            dm.cell(i, j0 + 1, (f"[{x['group']}] " if key == "levers" else "") + x["label"]
                    + (f" — {x.get('hint') or x.get('desc') or x.get('value')}" if (x.get("hint") or x.get("desc") or x.get("value")) else ""))
            i += 1
    dm.column_dimensions[get_column_letter(j0 + 1)].width = 90

    def dv(ws, cols, col, key):
        jj = [c for c, _ in cols].index(col) + 1
        L = get_column_letter(jj)
        v = DataValidation(type="list", formula1=f"={ranges[key]}", allow_blank=True)
        ws.add_data_validation(v)
        v.add(f"{L}2:{L}500")

    for col, key in (("brand", "brand"), ("objective", "objective"), ("lever_primary", "lever"), ("status", "status")):
        dv(ws_p, PROGRAM_COLS, col, key)
    for col, key in (("condition", "condition"), ("benefit", "benefit")):
        dv(ws_s, SCHEME_COLS, col, key)
    dv(ws_c, COST_COLS, "cost_type", "cost_type")

    nen_ch, nen_mon, nen_ctkm = base_sheets()
    sheet("NEN_CUA_HANG", NEN_CH_COLS, nen_ch, ref=True)
    sheet("NEN_MON", NEN_MON_COLS, nen_mon, ref=True)
    sheet("NEN_CTKM", NEN_CTKM_COLS, nen_ctkm, ref=True)
    wb.save(path)


def refresh(path):
    """Sổ đã có dữ liệu người dùng: chỉ thay 3 sheet NEN_* (tham khảo, máy sinh)."""
    from openpyxl import load_workbook
    from openpyxl.styles import Font, PatternFill
    wb = load_workbook(path)
    REF = PatternFill("solid", fgColor="2D3A2E")
    for (name, cols, rows) in zip(("NEN_CUA_HANG", "NEN_MON", "NEN_CTKM"),
                                  (NEN_CH_COLS, NEN_MON_COLS, NEN_CTKM_COLS), base_sheets()):
        if name in wb.sheetnames:
            del wb[name]
        ws = wb.create_sheet(name)
        for j, (col, _) in enumerate(cols, 1):
            c = ws.cell(1, j, col)
            c.font = Font(bold=True, color="F3F2EE")
            c.fill = REF
        for r in rows:
            ws.append([r.get(col) for col, _ in cols])
        ws.freeze_panes = "B2"
    wb.save(path)


def main(argv):
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    d = l0_dir("S24_preeval")
    if not d:
        print("  chưa có thư mục S24 — chạy python tools/l0_setup.py")
        return 1
    path = os.path.join(d, OUT_NAME)
    if os.path.exists(path):
        if "--refresh" in argv:
            refresh(path)
            print(f"  đã làm mới dữ liệu nền trong {os.path.relpath(path)}")
            return 0
        print(f"  {OUT_NAME} đã có — không ghi đè. Dùng --refresh để làm mới sheet NEN_*.")
        return 1
    write(path)
    print(f"  đã ghi {os.path.relpath(path)} · {len(SAMPLES)} chương trình mẫu")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
