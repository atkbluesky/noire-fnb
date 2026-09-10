# -*- coding: utf-8 -*-
"""
DI TRÚ MỘT LẦN — bộ 4 workbook cũ  →  cấu trúc ba tầng theo hợp đồng
====================================================================
    data_input/01_master.xlsx      (giữ nguyên vai trò — chiều & kế hoạch)
    data_input/02_snapshot.xlsx    (bảng luỹ kế toàn kỳ)
    data_input/monthly/YYYY-MM.xlsx   (một file cho mỗi tháng)

Chạy:  python tools/split_to_monthly.py
Bản cũ được dời vào  _archive/data_input_v1/  chứ không xoá.

Ba sheet bị CỐ Ý bỏ khi di trú vì bản cũ là ảnh chụp lệch kỳ, sẽ được
tools/build_month.py dựng lại đúng tháng từ dữ liệu thô:
    ads_campaign_detail                      (Meta — bản cũ là top-40 gộp cả 8 tháng)
    ads_google · gads_channel · gads_kw      (Google Ads — bản cũ là ảnh chụp 01–26/08)
    lead_month · lead_source · lead_type     (Lead tiệc — bản cũ dừng ở 05/2026)
"""
from __future__ import annotations

import os
import re
import shutil
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import (  # noqa: E402
    DATA_INPUT, MONTHLY_DIR, ROOT, SHEETS, cols_of, month_col_of, month_of,
    read_workbook, tier_of, write_workbook,
)

LEGACY = ["01_master.xlsx", "02_sales.xlsx", "03_marketing.xlsx", "04_social.xlsx"]

# Sheet dựng lại từ dữ liệu thô — không mang bản cũ sang.
REBUILD = {"ads_campaign_detail", "ads_google", "gads_channel", "gads_kw",
           "lead_month", "lead_source", "lead_type"}

# Khai báo ở `_stats` sẽ hoá cũ khi dữ liệu chuyển sang theo tháng: loader tính
# lại đúng hơn nên phải gỡ, nếu không con số sẽ đóng băng ở kỳ cũ.
DROP_STATS = {
    ("gads_stat", "*"),
    ("member_stat", "months_filled"),
    ("member_stat", "total"),
    ("member_stat", "blank"),
}


def _dropped(table, field):
    return (table, "*") in DROP_STATS or (table, field) in DROP_STATS


# Cột YYYY-MM (ngân sách theo tháng ở budget_brand/extra/channel) là cột thật, giữ lại.
_MONTH_COL = re.compile(r"^\d{4}-\d{2}$")


def clean(name, rows, dropped_cols):
    """Giữ đúng cột khai trong hợp đồng + cột YYYY-MM. Ghi chú ở dòng tiêu đề của
    bản cũ sẽ bị đọc thành một cột giả toàn ô rỗng — gỡ luôn ở bước di trú."""
    allow = set(cols_of(name)) | set(SHEETS.get(name, {}).get("derived", []))
    out = []
    for r in rows:
        o = {}
        for k, v in r.items():
            if k in allow or _MONTH_COL.match(str(k)):
                o[k] = v
            elif v is not None:
                o[k] = v                      # cột lạ CÓ số liệu → giữ, không vứt số
            else:
                dropped_cols.add(f"{name}.{k}")
        out.append(o)
    return out


def main():
    src = {}
    for f in LEGACY:
        p = os.path.join(DATA_INPUT, f)
        if not os.path.exists(p):
            print(f"   (bỏ qua {f} — không có)")
            continue
        for name, rows in read_workbook(p).items():
            src.setdefault(name, []).extend(rows)
        print(f"   đọc {f}")

    master, snapshot = {}, {}
    monthly = defaultdict(dict)
    stats_master, stats_snapshot = [], []
    skipped, noMonth, dropped_cols = [], defaultdict(int), set()

    for name, rows in src.items():
        if name in REBUILD:
            skipped.append(f"{name} ({len(rows)} dòng)")
            continue
        if name == "_stats":
            for r in rows:
                t, fld = r.get("table"), r.get("field")
                if not t or not fld or _dropped(t, fld):
                    continue
                keep = {"table": t, "field": fld, "value": r.get("value")}
                (stats_master if t in ("bom_stat", "system") else stats_snapshot).append(keep)
            continue

        rows = clean(name, rows, dropped_cols)
        tier = tier_of(name)
        if tier == "master":
            master[name] = rows
        elif tier == "snapshot":
            snapshot[name] = rows
        elif tier == "monthly":
            mc = month_col_of(name)
            for r in rows:
                m = month_of(r.get(mc)) if mc else None
                if not m:
                    noMonth[name] += 1
                    continue
                monthly[m].setdefault(name, []).append(r)
        else:
            snapshot[name] = rows
            print(f"   ! {name}: chưa khai trong hợp đồng — tạm xếp vào snapshot")

    if stats_master:
        master["_stats"] = stats_master
    if stats_snapshot:
        snapshot["_stats"] = stats_snapshot

    # ---- dời bản cũ vào kho lưu ----
    arch = os.path.join(ROOT, "_archive", "data_input_v1")
    os.makedirs(arch, exist_ok=True)
    for f in LEGACY:
        p = os.path.join(DATA_INPUT, f)
        if os.path.exists(p):
            shutil.move(p, os.path.join(arch, f))

    # ---- ghi cấu trúc mới ----
    write_workbook(
        os.path.join(DATA_INPUT, "01_master.xlsx"), master,
        title="01_MASTER — CHIỀU & KẾ HOẠCH (đổi khi có thay đổi, không phải hằng tháng)",
        guide_lines=GUIDE_MASTER)
    print(f"\n   → 01_master.xlsx      {len(master)} sheet")

    write_workbook(
        os.path.join(DATA_INPUT, "02_snapshot.xlsx"), snapshot,
        title="02_SNAPSHOT — BẢNG LUỸ KẾ TOÀN KỲ (không tách được theo tháng)",
        guide_lines=GUIDE_SNAPSHOT)
    print(f"   → 02_snapshot.xlsx    {len(snapshot)} sheet")

    os.makedirs(MONTHLY_DIR, exist_ok=True)
    for m in sorted(monthly):
        write_workbook(
            os.path.join(MONTHLY_DIR, f"{m}.xlsx"), monthly[m],
            title=f"{m} — SỐ LIỆU THÁNG (một tháng một file)",
            guide_lines=guide_monthly(m))
        n = sum(len(v) for v in monthly[m].values())
        print(f"   → monthly/{m}.xlsx  {len(monthly[m])} sheet · {n:,} dòng".replace(",", "."))

    if skipped:
        print("\n   Bỏ qua (sẽ dựng lại từ dữ liệu thô):")
        for s in sorted(set(skipped)):
            print(f"     · {s}")
    print(f"\n   Bản cũ đã dời vào _archive/data_input_v1/")


GUIDE_MASTER = [
    "▸ KHI NÀO SỬA FILE NÀY",
    "   Mở thêm cửa hàng · chốt target quý mới · duyệt ngân sách mới · thêm đối tác.",
    "   KHÔNG phải file nộp hằng tháng — số liệu tháng nằm ở data_input/monthly/YYYY-MM.xlsx.",
    "",
    "▸ THÊM MỘT CỬA HÀNG",
    "   Thêm một dòng vào sheet dim_store: code · brand · tier · name · open.",
    "   tier: flagship/core = tính mặc định · satellite/popup = chỉ hiện khi bật 'tất cả'.",
    "   Nếu số liệu có cửa hàng chưa khai ở đây, CHỐT #2 báo đỏ và build DỪNG — không âm thầm bỏ qua.",
    "",
    "▸ THÊM TARGET THÁNG MỚI",
    "   Nối dòng vào dim_target: month (YYYY-MM) · store (mã ở dim_store) · target.",
    "   Được phép khai trước cho tháng tương lai.",
    "",
    "▸ HỢP ĐỒNG ĐẦY ĐỦ",
    "   data_contract.json · docs/15_PROCESSED_INPUT_CONTRACT.md",
]

GUIDE_SNAPSHOT = [
    "▸ ĐÂY LÀ BẢNG LUỸ KẾ TOÀN KỲ, KHÔNG PHẢI THEO THÁNG",
    "   product · category · group · heat · zone · staff · payment · dwell · repeat …",
    "   Chúng cộng dồn mọi tháng đang có trong hệ thống. Nộp lại là THAY THẾ toàn bộ,",
    "   không phải nối thêm — nên chỉ nộp khi lane dữ liệu thô chạy lại toàn kỳ.",
    "",
    "▸ VÌ SAO KHÔNG TÁCH THEO THÁNG",
    "   Ma trận Menu Engineering, phân bố giờ vào, thời gian ngồi bàn đều cần cỡ mẫu lớn.",
    "   Cắt theo tháng thì trung vị nhảy loạn và xếp sai hạng món.",
    "",
    "▸ SHEET _stats",
    "   Khi bảng product bị cắt top-N, tổng thật phải khai ở đây. Loader ưu tiên giá trị khai.",
    "   Trung vị cắt ma trận (menu_median) BẮT BUỘC khai nếu product đã cắt.",
    "",
    "▸ KHAI KỲ MÀ BẢNG NÀY THỰC SỰ PHỦ",
    "   Dòng  product_stat · covers · 2026-01-01 → 2026-08-18  ở sheet _stats.",
    "   Khối doanh thu theo tháng cập nhật mỗi tháng, còn bảng luỹ kế chỉ đổi khi chạy lại",
    "   toàn kỳ — hai khối có thể lệch vài ngày. Màn hình M2 hiện đúng dòng khai này để",
    "   người đọc biết mình đang nhìn kỳ nào, thay vì tưởng hai khối cùng kỳ.",
    "   SỬA DÒNG NÀY mỗi lần nộp lại 02_snapshot.xlsx.",
]


def guide_monthly(m):
    return [
        f"▸ FILE NÀY LÀ TOÀN BỘ SỐ LIỆU THÁNG {m[5:7]}/{m[:4]}",
        "   Thêm một tháng mới = chép file này, đổi tên thành YYYY-MM.xlsx, thay số. Hết.",
        "   Không sửa code. Không đụng src/. Không commit JSON.",
        "",
        "▸ CỘT month / m / date",
        "   Loader TỰ ĐIỀN tháng từ TÊN FILE — bỏ trống cũng đúng.",
        "   Cột `date` của sheet daily thì phải ghi đủ YYYY-MM-DD.",
        "",
        "▸ Ô TRỐNG ≠ SỐ 0",
        "   Trống = chưa đo được (màn hình hiện —). 0 = đã đo và bằng không.",
        "   Ví dụ: Zalo Ads chưa chạy thì ĐỂ TRỐNG, đừng điền 0.",
        "",
        "▸ CỘT DẪN XUẤT — ĐỪNG ĐIỀN",
        "   ta · aov · cm_pct · mclass · rate · d_bill · cpa · cpr · er · net_follow …",
        "   Loader tự tính. Điền tay sẽ bị ghi đè và làm lệch với phần còn lại của hệ thống.",
        "",
        "▸ FACEBOOK ĐIỀN reach · TIKTOK ĐIỀN views",
        "   Facebook đếm TÀI KHOẢN tiếp cận, TikTok đếm LƯỢT xem. Cộng hai cột là sai bản chất.",
        "",
        "▸ NỘP LẠI BẢN SỬA",
        "   Đặt tên YYYY-MM_v2.xlsx và để cạnh file gốc — file đọc sau thắng theo khoá tự nhiên.",
        "",
        "▸ SAU KHI SỬA XONG",
        "   npm run build:data     → đọc phần CHỐT QA in ra",
        "   git add data_input && git commit -m \"so lieu %s\" && git push" % m,
    ]


if __name__ == "__main__":
    print("─" * 74)
    print("NOIRE — di trú data_input/ sang cấu trúc ba tầng")
    print("─" * 74)
    main()
