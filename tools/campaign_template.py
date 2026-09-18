# -*- coding: utf-8 -*-
"""
SINH FILE MẪU NHẬP LIỆU M7.2 — _MAU_Campaign_Tracking.xlsx
=========================================================
    python tools/campaign_template.py

Khung trình bày M7.2 (docs/modules/M7_2_Promotion_Tracking.md §5) cần đúng bốn bảng
khai tay; file mẫu này là bốn bảng đó, kèm:
  · danh sách chọn (dropdown) lấy từ data_contract.json → $campaign — gõ sai mã là không được
  · chú thích từng cột (di chuột vào tiêu đề)
  · dòng ví dụ là CHƯƠNG TRÌNH THẬT trên POS, chọn để phủ đủ mọi nhánh đo:
        BURST đo được · RECURRING chạy từ trước khi có số · ALWAYS_ON · cửa hàng mới
        khai trương · đợt quá ngắn · đang chạy · tặng món (không có giảm giá POS)
  · target ví dụ = KỲ NỀN THẬT × (1 + mức tăng kỳ vọng) — đúng cách người lập kế
    hoạch đặt target trước khi chạy, KHÔNG suy ngược từ kết quả

Khi chưa có Campaign_Tracking_*.xlsx thật, tools/campaign.py đọc file này và M7.2 hiện
dải "DỮ LIỆU MẪU". Số thực tế (doanh thu, hoá đơn, giảm giá) vẫn là số POS thật.
"""
from __future__ import annotations

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import CONTRACT, SOURCES, STORE_META, l0_dir  # noqa: E402
import campaign as E  # noqa: E402

C = CONTRACT["$campaign"]
NAT = [x["code"] for x in CONTRACT["$promo_nature"]["labels"]]

# ───────────────────────── mô tả cột (chú thích tiêu đề) ─────────────────────────
DIM_COLS = [
    ("campaign_id", "Mã duy nhất: BRAND-YYYY-MM-TÊNNGẮN. Không đổi sau khi đã chạy."),
    ("name", "Tên chương trình — mỗi chương trình MỘT tên riêng, MỘT dòng."),
    ("content", "NỘI DUNG CHƯƠNG TRÌNH (nhập tay): ưu đãi gì, điều kiện áp dụng, đối tượng, kênh truyền thông, quà tặng… Hiện ở khối Chi tiết của M7.2."),
    ("hypothesis", "GIẢ THUYẾT (nhập tay, viết TRƯỚC khi chạy) — một câu: phương án nào, tăng bao nhiêu. Vd: Tặng dessert thứ 2 kéo TC thứ 2 tăng 15%."),
    ("objective", "MỤC TIÊU: TC (tăng số lượt khách) · AOV (tăng chi tiêu mỗi bill) · BRANDING (nhận diện · tương tác · review)."),
    ("lever_primary", "PHƯƠNG ÁN chính, thuộc đúng mục tiêu — TC: Customer Base · Frequently · Party Size · Secondary Order · Sales Channel · Day-part Sales · AOV: Menu Item Sold · Menu Item Value · Pricing · BRANDING: Awareness · Engagement · Review. Xem sheet DANH_MUC."),
    ("lever_secondary", "Phương án phụ (tuỳ chọn)."),
    ("name_pos", "Tên CTKM ĐÚNG NHƯ TRÊN POS (cột Tên CTKM của file hoá đơn). Chương trình có nhiều mức (vd voucher 50K/100K/150K) thì mỗi mức một dòng, cùng pre_id."),
    ("brand", "NCB · NDC · NJFB · ALL"),
    ("store_scope", "Mã cửa hàng chạy chương trình, ngăn bằng |. ALL = mọi cửa hàng của brand."),
    ("nature", "Ai trả tiền. Trống = hệ thống tự phân loại từ tên POS."),
    ("mechanic", "Cơ chế thực thi — quyết định cách tính chi phí."),
    ("window", "Cửa sổ marketing trong năm."),
    ("date_from", "Ngày bắt đầu (YYYY-MM-DD)."),
    ("date_to", "Ngày kết thúc. Trống = đang chạy."),
    ("discount_rule", "Mô tả ưu đãi ngắn: 20% · 50K · 1 tặng 1 · tặng 1 món."),
    ("cost_owner", "NOIRE · PARTNER · SPLIT"),
    ("noire_share", "Chỉ khi SPLIT: phần NOIRE gánh (0–1 hoặc %)."),
    ("ads_match", "Tên chiến dịch Meta Ads phục vụ chương trình, ngăn bằng | — chi phí ads tự cộng theo số ngày chạy."),
    ("owner", "Người chịu trách nhiệm."),
    ("status", "PLANNED · RUNNING · ENDED · CANCELLED"),
    ("pre_id", "Mã chương trình trong file Pre-Analysis (C1, D3, G7, V1…). Có pre_id → target + chi phí kế hoạch TỰ LẤY từ Pre-Analysis. Nhiều dòng cùng pre_id = chấm chung một kế hoạch."),
    ("source", "Nguồn dòng: PRE_POS · PRE · POS · REPORT · MANUAL (chỉ để đọc)."),
    ("match_note", "Ghi chú ghép tên POS ↔ kế hoạch."),
]
TGT_COLS = [
    ("campaign_id", "Mã ở dim_campaign."),
    ("base_method", "DOW4W = TB 4 tuần cùng thứ (mặc định) · MANUAL · PRE_ANALYSIS (tự lấy từ file kế hoạch)"),
    ("tgt_net", "Doanh thu kỳ vọng CẢ KỲ khi có chương trình (đ)."),
    ("tgt_tc", "Số hoá đơn kỳ vọng cả kỳ."),
    ("tgt_aov", "Chi tiêu / hoá đơn kỳ vọng (đ)."),
    ("tgt_ta", "Chi tiêu / khách kỳ vọng (đ)."),
    ("tgt_incr_net", "Doanh thu TĂNG THÊM kỳ vọng so với không chạy (đ) — con số chính để chấm ĐẠT."),
    ("exp_redeem_rate", "% khách đủ điều kiện sẽ dùng ưu đãi (0–1)."),
    ("exp_disc_per_bill", "Chiết khấu bình quân / hoá đơn kỳ vọng (đ)."),
    ("cm_pct", f"Biên lợi nhuận (0–1). Trống = mặc định {C['default_cm_pct']:.0%}."),
    ("submitted", "Ngày nộp target. Nộp SAU date_from → không dùng để chấm ĐẠT."),
    ("note", "Ghi chú."),
]
COST_COLS = [
    ("campaign_id", "Mã ở dim_campaign."),
    ("cost_type", "GIFT_COGS · ADS · KOL · PRINT · MERCH · AGENCY · PARTNER_SHARE. KHÔNG khai DISCOUNT/VOUCHER — tự lấy từ POS."),
    ("planned", "Chi phí kế hoạch (đ)."),
    ("actual", "Chi phí thực (đ). Trống = hệ thống tạm dùng số kế hoạch và ghi rõ."),
    ("note", "Diễn giải: số lượng × đơn giá…"),
]
ITEM_COLS = [
    ("campaign_id", "Mã ở dim_campaign — chương trình chạy theo MÓN (LTO, món mới)."),
    ("item_code", "Mã hàng trên POS (vd LTD0009). Bỏ hậu tố MK cũng được — LTD0009MK tính chung LTD0009. Tra ở sheet DS_MON_LTO."),
    ("item_name", "Tên món (để đọc; chỉ dùng để khớp khi không có mã)."),
    ("note", "Ghi chú."),
]
LTO_REF_COLS = [
    ("item_base", "Mã món (đã bỏ hậu tố MK)."), ("item_name", "Tên món trên POS."), ("group", "Nhóm món."),
    ("stores", "Cửa hàng có bán."), ("first", "Ngày đầu thấy trên POS."), ("last", "Ngày cuối thấy trên POS."),
    ("qty", "Số lượng bán."), ("bills", "Số hoá đơn có món."), ("line_rev", "Doanh thu riêng dòng món (Thành tiền)."),
    ("campaign_id", "Chương trình đã nối (trống = chưa nối)."),
]
CTRL_COLS = [("campaign_id", "Mã ở dim_campaign."),
             ("control_store", "Cửa hàng KHÔNG chạy chương trình, dùng khử mùa vụ. Trống cả sheet = tự chọn cửa hàng chính cùng brand.")]

# ───────────────────────── chương trình ví dụ (thật trên POS) ─────────────────────────
SAMPLES = [
    dict(campaign_id="NDC-2026-02-LUCKY500", name="Lucky Draw · Cash voucher 500K", brand="NDC",
         name_pos="CASH VOUCHER 500K MINI GAME & LUCKY DRAW", store_scope="NDC_NTMK",
         lever_primary="TC_FREQ", mechanic="LUCKY_DRAW", window="TET_AL", cadence="BURST",
         date_from="2026-02-20", date_to="2026-04-22", discount_rule="Voucher 500K", cost_owner="NOIRE",
         owner="Brand NDC", status="ENDED",
         hypothesis="Voucher 500K trúng thưởng kéo khách quay lại sau Tết, TC tăng 10% trong 2 tháng.",
         _uplift=0.10, _costs=[("MERCH", 4_000_000, 3_600_000, "Bộ quà mini game")]),
    dict(campaign_id="NJFB-2026-05-HIGHBALL", name="The Highball Summer", brand="NJFB",
         name_pos="The Highball Summer*", store_scope="NJFB_CRE",
         lever_primary="AOV_QTY", lever_secondary="TC_DAYPART", mechanic="BXGY", window="SUMMER",
         cadence="BURST", date_from="2026-05-02", date_to="2026-06-29", discount_rule="1 tặng 1 cocktail / beer",
         cost_owner="NOIRE", ads_match="NOIRE JFB - Promotion", owner="Brand NJFB", status="ENDED",
         hypothesis="1 tặng 1 highball buổi tối kéo khách gọi thêm đồ uống, TA tăng 12%.",
         _uplift=0.12, _costs=[("GIFT_COGS", 3_200_000, 2_900_000, "64 ly tặng × ~45K giá vốn"),
                               ("KOL", 5_000_000, None, "2 KOC ẩm thực")]),
    dict(campaign_id="NJFB-2026-06-CARBONARA", name="Tặng Carbonara · Pre-booking", brand="NJFB",
         name_pos="Tặng Carbonara Pre-booking", store_scope="NJFB_SSV|NJFB_CRE",
         lever_primary="TC_BASE", mechanic="GIFT_ITEM", window="SUMMER", cadence="BURST",
         date_from="2026-06-11", date_to="2026-07-27", discount_rule="Tặng 1 Carbonara khi đặt bàn trước",
         cost_owner="NOIRE", owner="Brand NJFB", status="ENDED",
         hypothesis="Tặng món khi đặt bàn trước kéo khách mới, TC tăng 15%.",
         _uplift=0.15, _costs=[("GIFT_COGS", 2_700_000, 2_450_000, "45 phần × ~55K giá vốn")]),
    dict(campaign_id="NCB-2026-07-POWERLUNCH", name="Bistro Power Lunch · đồng giá nước", brand="NCB",
         name_pos="BISTRO POWER LUNCH (ĐỒNG GIÁ NƯỚC)", store_scope="NCB_SKC|NCB_ET|NCB_MET",
         lever_primary="TC_DAYPART", mechanic="COMBO_SET", window="SUMMER", cadence="BURST",
         date_from="2026-07-14", date_to="2026-08-15", discount_rule="Đồng giá nước buổi trưa",
         cost_owner="NOIRE", owner="Brand NCB", status="ENDED",
         hypothesis="Đồng giá nước buổi trưa kéo khách văn phòng, TC khung 11–14h tăng 8%.",
         _uplift=0.08, _costs=[("PRINT", 1_500_000, 1_350_000, "Standee + menu bàn 3 cửa hàng")]),
    dict(campaign_id="NCB-2026-01-HAPPYTUE", name="Happy Tuesday", brand="NCB",
         name_pos="HAPPY TUESDAY", store_scope="ALL",
         lever_primary="TC_DAYPART", mechanic="TIME_WINDOW", window="ALWAYS_ON", cadence="RECURRING",
         recur_dow=1, date_from="2026-01-06", discount_rule="Ưu đãi mỗi thứ 3", cost_owner="NOIRE",
         owner="Brand NCB", status="RUNNING",
         hypothesis="Ưu đãi thứ 3 lấp ngày thấp điểm đầu tuần, TC thứ 3 tăng 20%."),
    dict(campaign_id="NDC-2026-08-BKL-PREBOOK", name="Berkley · Pre-booking offer", brand="NDC",
         name_pos="BERKLEY - PRE-BOOKING OFFER", store_scope="NDC_BKL",
         lever_primary="TC_BASE", mechanic="PCT_OFF", window="OPENING", cadence="BURST",
         date_from="2026-08-14", date_to="2026-09-13", discount_rule="Ưu đãi đặt bàn trước tuần khai trương",
         cost_owner="NOIRE", owner="Brand NDC", status="ENDED",
         hypothesis="Ưu đãi đặt bàn trước lấp đầy tuần khai trương Berkley."),
    dict(campaign_id="NJFB-2026-08-CREST10", name="10% Off The Crest", brand="NJFB",
         name_pos="10% OFF THE CREST - JFB CREST", store_scope="NJFB_CRE",
         lever_primary="TC_FREQ", mechanic="PCT_OFF", window="ALWAYS_ON", cadence="BURST",
         date_from="2026-08-06", discount_rule="Giảm 10% toàn hoá đơn", cost_owner="NOIRE",
         owner="Brand NJFB", status="RUNNING",
         hypothesis="Giảm 10% cho cư dân/khách quen The Crest, TC tăng 10%.", _uplift=0.10),
    dict(campaign_id="NDC-2026-03-0803", name="8/3 · Giảm 15%", brand="NDC",
         name_pos="08/03 - GIẢM 15% (DC)", store_scope="NDC_NTMK",
         lever_primary="TC_PARTY", mechanic="PCT_OFF", window="INT_WOMEN_0803", cadence="BURST",
         date_from="2026-03-06", date_to="2026-03-08", discount_rule="Giảm 15% dịp 8/3",
         cost_owner="NOIRE", owner="Brand NDC", status="ENDED",
         hypothesis="Giảm 15% dịp 8/3 kéo nhóm khách nữ, quy mô nhóm tăng.", _uplift=0.10),
]


def build_targets():
    """Target ví dụ = kỳ nền THẬT × (1 + mức tăng kỳ vọng), nộp 7 ngày trước khi chạy."""
    daily, promo, ads, first, last = E.load_facts()
    targets = []
    for s in SAMPLES:
        if "_uplift" not in s:
            continue
        c = {k: v for k, v in s.items() if not k.startswith("_")}
        r, _, _ = E.measure(c, None, [], [], daily, promo, ads, first, last)
        if not r.get("measurable"):
            continue
        u = s["_uplift"]
        en, et, eg = r["exp_net"], r["exp_tc"], r["exp_guest"]
        d0 = date.fromisoformat(s["date_from"])
        targets.append(dict(
            campaign_id=s["campaign_id"], base_method="DOW4W",
            tgt_net=round(en * (1 + u), -3), tgt_tc=round(et * (1 + u)),
            tgt_aov=round(en / et, -3) if et else None, tgt_ta=round(en / eg, -3) if eg else None,
            tgt_incr_net=round(en * u, -3), exp_redeem_rate=0.3, cm_pct=None,
            submitted=str(date.fromordinal(d0.toordinal() - 7)),
            note=f"SỐ MẪU — kỳ nền thật × (1 + {u:.0%})"))
    return targets


FILL = {"sample": "FFF7E6", "need": "FFD8A8", "guess": "DDEBF7"}


def write_book(path, guide, dims, targets, costs, controls=(), fills=None, sample=False, items=(), lto_ref=None):
    """Ghi file khai báo M7.2 — dùng chung cho file MẪU và file THẬT (tools/campaign_seed.py).
    fills: {(sheet, số_thứ_tự_dòng_dữ_liệu, cột): 'need' | 'guess'} — tô ô cần nhập / ô máy đoán."""
    from openpyxl import Workbook
    from openpyxl.comments import Comment
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    HDR = PatternFill("solid", fgColor="1F1F26")
    PF = {k: PatternFill("solid", fgColor=v) for k, v in FILL.items()}
    fills = fills or {}
    wb = Workbook()
    g = wb.active
    g.title = "HUONG_DAN"
    for t, bold in guide:
        g.append([t])
        g.cell(g.max_row, 1).font = Font(bold=bold, size=12 if bold else 10)
        for key in ("need", "guess"):
            if t.startswith(f"[{key}]"):
                g.cell(g.max_row, 1).value = t[len(key) + 2:].strip()
                g.cell(g.max_row, 1).fill = PF[key]
    g.column_dimensions["A"].width = 130

    def sheet(name, cols, rows):
        ws = wb.create_sheet(name)
        for j, (col, desc) in enumerate(cols, 1):
            c = ws.cell(1, j, col)
            c.font = Font(bold=True, color="F3F2EE")
            c.fill = HDR
            c.alignment = Alignment(horizontal="center")
            c.comment = Comment(desc, "NOIRE")
            ws.column_dimensions[get_column_letter(j)].width = max(14, min(46, len(col) + 6))
        for i, r in enumerate(rows):
            ws.append([r.get(col) for col, _ in cols])
            for j, (col, _) in enumerate(cols, 1):
                k = "sample" if sample else fills.get((name, i, col))
                if k:
                    ws.cell(ws.max_row, j).fill = PF[k]
        ws.freeze_panes = "C2"
        ws.auto_filter.ref = ws.dimensions
        return ws

    lists = {
        "nature": NAT, "lever": [x["code"] for x in C["levers"]], "mechanic": sorted(CODES("mechanics")),
        "window": sorted(CODES("windows")),
        "cost_owner": sorted(CODES("cost_owners")), "status": sorted(CODES("statuses")),
        "objective": [x["code"] for x in C["objectives"]],
        "cost_type": [x["code"] for x in C["cost_types"] if not x.get("auto")],
        "base_method": ["DOW4W", "MANUAL", "PRE_ANALYSIS"], "brand": ["NCB", "NDC", "NJFB", "ALL"],
        "store": sorted(STORE_META), "source": [x["code"] for x in C["sources"]],
    }
    dm = wb.create_sheet("DANH_MUC")
    ranges = {}
    for j, (k, vals) in enumerate(lists.items(), 1):
        dm.cell(1, j, k).font = Font(bold=True)
        for i, v in enumerate(vals, 2):
            dm.cell(i, j, v)
        L = get_column_letter(j)
        ranges[k] = f"DANH_MUC!${L}$2:${L}${len(vals) + 1}"
        dm.column_dimensions[L].width = 18
    j0 = len(lists) + 2
    dm.cell(1, j0, "mã").font = Font(bold=True)
    dm.cell(1, j0 + 1, "nghĩa").font = Font(bold=True)
    i = 2
    for key in ("objectives", "levers", "mechanics", "windows", "cost_types", "sources"):
        for x in C[key]:
            dm.cell(i, j0, x["code"])
            extra = x.get("hint") or x.get("desc") or x.get("method")
            grp = f"[{x['group']}] " if key == "levers" else ""
            dm.cell(i, j0 + 1, grp + x["label"] + (f" — {extra}" if extra else ""))
            i += 1
    dm.column_dimensions[get_column_letter(j0 + 1)].width = 80

    def dv(ws, cols, col, key, maxrow=1000):
        j = [c for c, _ in cols].index(col) + 1
        L = get_column_letter(j)
        v = DataValidation(type="list", formula1=f"={ranges[key]}", allow_blank=True,
                           showErrorMessage=True, errorTitle="Sai danh mục",
                           error=f"Chọn giá trị trong danh sách ({key}) — xem sheet DANH_MUC.")
        ws.add_data_validation(v)
        v.add(f"{L}2:{L}{maxrow}")

    ws = sheet("dim_campaign", DIM_COLS, dims)
    for col, key in (("brand", "brand"), ("nature", "nature"), ("lever_primary", "lever"),
                     ("lever_secondary", "lever"), ("mechanic", "mechanic"), ("window", "window"),
                     ("objective", "objective"), ("cost_owner", "cost_owner"), ("status", "status"),
                     ("source", "source")):
        dv(ws, DIM_COLS, col, key)
    ws = sheet("campaign_target", TGT_COLS, targets)
    dv(ws, TGT_COLS, "base_method", "base_method")
    ws = sheet("campaign_cost", COST_COLS, costs)
    dv(ws, COST_COLS, "cost_type", "cost_type")
    ws = sheet("campaign_control", CTRL_COLS, list(controls))
    dv(ws, CTRL_COLS, "control_store", "store")
    sheet("campaign_item", ITEM_COLS, list(items))
    if lto_ref is not None:
        sheet("DS_MON_LTO", LTO_REF_COLS, list(lto_ref))
    wb.save(path)


GUIDE = [
    ("M7.2 · CAMPAIGN TRACKING — MẪU NHẬP LIỆU", True),
    ("", False),
    ("CÁCH DÙNG", True),
    ("1. Lưu file này thành Campaign_Tracking_2026.xlsx, đặt cùng thư mục (03_MARKETING/07_Campaign_Tracking).", False),
    ("2. XOÁ các dòng ví dụ tô vàng, khai chương trình thật. Mỗi chương trình MỘT dòng ở dim_campaign.", False),
    ("3. Target nộp TRƯỚC ngày chạy (cột submitted). Nộp sau là không được chấm ĐẠT.", False),
    ("4. Chương trình có trong file Pre-Analysis: điền pre_id — target và chi phí kế hoạch tự lấy, không gõ lại.", False),
    ("5. Nháy đúp CAP_NHAT.bat. Lỗi khai báo hiện ở báo cáo và bảng 'Lỗi khai báo' trên màn M7.2.", False),
    ("", False),
    ("KHÔNG CẦN KHAI", True),
    ("· Giảm giá, phiếu giảm giá, số hoá đơn, doanh thu — hệ thống tự lấy từ POS theo name_pos + store_scope + kỳ chạy.", False),
    ("· Kỳ nền (base) — hệ thống tự tính 28 ngày trước ngày bắt đầu, cùng thứ trong tuần.", False),
    ("· Chi phí Meta Ads — khai tên chiến dịch ở ads_match là tự cộng.", False),
    ("", False),
    ("DÒNG VÍ DỤ LÀ CHƯƠNG TRÌNH THẬT, chọn để thấy đủ mọi trạng thái trên màn M7.2:", True),
    ("· Lucky500 · Highball · Carbonara · Power Lunch — đo được lift (BURST có kỳ nền).", False),
    ("· Happy Tuesday — RECURRING chạy từ trước khi hệ thống có số → CHƯA ĐO ĐƯỢC.", False),
    ("· Berkley pre-booking — cửa hàng mới khai trương → CHƯA ĐO ĐƯỢC.", False),
    ("· 10% Off The Crest (đang chạy) → CHƯA ĐỦ CHÍN.", False),
    ("· Target ví dụ = kỳ nền THẬT × (1 + mức tăng kỳ vọng); chi phí quà tặng / KOL / in ấn là SỐ MẪU.", False),
]


def write(path, targets):
    dims = [{k: v for k, v in s.items() if not k.startswith("_")} for s in SAMPLES]
    costs = [dict(campaign_id=s["campaign_id"], cost_type=t, planned=p, actual=a, note=n)
             for s in SAMPLES for t, p, a, n in s.get("_costs", [])]
    write_book(path, GUIDE, dims, targets, costs, sample=True)


def CODES(k):
    return {x["code"] for x in C[k]}


def main():
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    d = l0_dir("S23_campaign")
    if not d:
        d = os.path.join(E.DATA_INPUT, "..", "L0_input", *SOURCES["S23_campaign"]["dir"].split("/"))
        os.makedirs(d, exist_ok=True)
    targets = build_targets()
    path = os.path.join(d, "_MAU_Campaign_Tracking.xlsx")
    write(path, targets)
    print(f"đã ghi {os.path.relpath(path)} · {len(SAMPLES)} chương trình ví dụ · {len(targets)} target")
    return 0


if __name__ == "__main__":
    sys.exit(main())
