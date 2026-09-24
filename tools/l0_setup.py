# -*- coding: utf-8 -*-
"""
DỰNG CÂY L0_input/ CHUẨN — chạy an toàn nhiều lần
=================================================
    python tools/l0_setup.py              dựng thư mục + README (không đụng file dữ liệu)
    python tools/l0_setup.py --import     dựng + gom file thô hiện có vào đúng chỗ
    python tools/l0_setup.py --import --dry   chỉ in ra sẽ làm gì

Cây thư mục sinh ra THEO SỔ ĐĂNG KÝ (data_sources.json) — thêm nguồn ở
tools/l0_registry.py rồi chạy lại lệnh này là có thư mục mới kèm hướng dẫn.

--import làm ba việc, KHÔNG xoá file nào:
  1. File đang nằm ở cây L0_input/ CŨ (đặt tên kiểu `05 Data Raw/01 Sales Revenue/…`)
     → DỜI sang thư mục chuẩn (cùng ổ đĩa, không tốn dung lượng).
  2. File đang nằm ở cây HIGHGATE (nơi các phòng ban làm việc) mà L0_input chưa có
     → SAO CHÉP sang (bản gốc giữ nguyên).
  3. Thư mục cũ còn sót lại → dời vào _archive/L0_input_cu/ để bạn tự xoá khi yên tâm.
"""
from __future__ import annotations

import glob
import io
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from monthly_lib import (  # noqa: E402
    L0_ROOT, ROOT, SOURCES, SOURCES_DOC, _is_data, file_month, l0_files,
)

HIGHGATE = os.path.abspath(os.path.join(ROOT, "..", "..", ".."))

# Mẫu SAO CHÉP rộng hơn mẫu KIỂM KÊ: kiểm kê chỉ cần biết tháng đó có báo cáo chính
# chưa, còn lane cần đủ bộ file (Google Ads cần cả báo cáo cụm từ, báo cáo cửa hàng).
COPY_GLOB = {
    "S09_ads_google": ["Tháng */*.xlsx"],
    "S18_social": ["Facebook*.xlsx"],
    "S08_ads_meta": ["*_report.xlsx", "*_content.xlsx"],
    "S04_monthly": ["Tháng*revenue*.xlsx"],
    "S22_tiktok": ["TikTok*.xlsx"],
}

# Cây L0_input CŨ (trước 16/09/2026) → nguồn tương ứng.
OLD_LAYOUT = {
    "05 Data Raw/01 Sales Revenue/1. Bảng Kê HD 2026": "S02_bill",
    "05 Data Raw/01 Sales Revenue/2. Báo Cáo bán hàng 2026": "S01_item",
    "05 Data Raw/01 Sales Revenue/Doanh thu 2026": ["S03_daily", "S04_monthly"],
    "02 Products/2. Costing BOM/BOM Update T7.2026": "S05_bom",
}


# Thư mục CHUẨN đã đổi tên — file bên trong dời sang chỗ mới, khung cũ (chỉ còn
# README.md/.gitkeep do chính script này sinh) được gỡ.
RENAMED = {
    "03_MARKETING/03_Fanpage_Facebook": "S18_social",   # → 03_MARKETING/03_Social/Facebook
    "03_MARKETING/07_Aggregator": "S19_aggregator",     # → 05_DOI_TAC/03_Aggregator
    "03_MARKETING/03_Social/Facebook": "S18_social",    # → 03_Social/01_Fanpage (tên người dùng đặt)
    "03_MARKETING/03_Social/TikTok": "S22_tiktok",      # → 03_Social/02_Tiktok
}


def _patterns(sid):
    return COPY_GLOB.get(sid) or [p.strip() for p in SOURCES[sid]["pattern"].split("|")]


def _match(sid, base_dir):
    out = []
    for pat in _patterns(sid):
        for f in glob.glob(os.path.join(base_dir, pat)):
            if _is_data(f):
                out.append(f)
    # Doanh thu tháng và doanh thu ngày chung một thư mục nguồn — đừng để file
    # ngày lọt vào thư mục tháng.
    if sid == "S04_monthly":
        out = [f for f in out if "group-by-date" not in f and "per_day" not in f]
    return sorted(set(out))


def readme_for(s):
    lines = [
        f"# {s['name']}",
        "",
        f"**Mã nguồn:** `{s['id']}` · **Bắt buộc:** {'CÓ' if s.get('required') else 'không'}"
        f" · **Nhịp:** {SOURCES_DOC['cadence_legend'].get(s['cadence'], s['cadence'])}",
        "",
        "## Thả file gì vào đây",
        "",
        s.get("how", ""),
        "",
        f"- Mẫu tên file: `{s['pattern']}`",
        f"- Ví dụ: `{s.get('example', '')}`",
    ]
    if s.get("template"):
        lines.append(f"- **Mẫu nhập liệu:** `{s['template']}` nằm ngay trong thư mục này (hệ thống bỏ qua file `_MAU_`).")
    sch = s.get("schema") or {}
    if sch.get("sheets") or sch.get("cols") or sch.get("month_files") or sch.get("csv_cols"):
        lines += ["", "## Mẫu chuẩn — sai là hệ thống BÁO NGAY", ""]
        for g in sch.get("sheets") or []:
            alts = [a for a in (g if isinstance(g, list) else [g]) if a]
            if alts:
                lines.append(f"- Sheet bắt buộc: {' hoặc '.join('`' + a + '`' for a in alts)}")
        for c in sch.get("cols") or []:
            lines.append(f"- Cột: {' / '.join('`' + a + '`' for a in (c if isinstance(c, list) else [c]))}")
        for c in sch.get("csv_cols") or []:
            lines.append(f"- Cột CSV: `{c}`")
        for fname in sch.get("month_files") or []:
            lines.append(f"- File bắt buộc trong mỗi thư mục tháng: `{fname}`")
    if s.get("since"):
        lines.append(f"- Có số từ tháng: `{s['since']}` — thiếu tháng nào sau mốc đó là hệ thống BÁO THIẾU.")
    lines += [
        "",
        "## Sau khi thả",
        "",
        "Nháy đúp `CAP_NHAT.bat` ở thư mục dự án (hoặc `python update.py`).",
        "Hệ thống tự nhận file mới/đã thay, dựng lại đúng những tháng bị ảnh hưởng.",
        "",
        "## Dùng cho",
        "",
        f"- Bảng dữ liệu: {', '.join(s.get('produces') or ['—'])}",
        f"- Màn hình: {', '.join(s.get('modules') or ['—'])}",
        f"- Xử lý bởi: {s.get('via', '—')}",
    ]
    if s.get("note"):
        lines += ["", f"> {s['note']}"]
    lines += ["", "_File này sinh tự động từ tools/l0_registry.py — sửa ở đó, đừng sửa tay._", ""]
    return "\n".join(lines)


def root_readme():
    rows = ["| Thư mục | Nguồn | Bắt buộc | Mẫu tên file |", "|---|---|:-:|---|"]
    for s in SOURCES.values():
        rows.append(f"| `{s['dir']}` | {s['name']} | {'✅' if s.get('required') else ''} | `{s['pattern']}` |")
    return "\n".join([
        "# L0_input — NƠI DUY NHẤT THẢ FILE EXCEL THÔ",
        "",
        "## Quy trình mỗi lần có số mới",
        "",
        "1. Export file từ POS / Meta / Google / Zalo… **giữ nguyên tên file gốc**.",
        "2. Thả vào đúng thư mục bên dưới (mỗi thư mục có `README.md` riêng hướng dẫn chi tiết).",
        "3. Nháy đúp **`CAP_NHAT.bat`** ở thư mục dự án.",
        "4. Đọc **`_BAO_CAO_CAP_NHAT.txt`** ở ngay thư mục này: file nào thiếu, tháng nào thiếu, file nào bị bỏ qua.",
        "",
        "Muốn tự động hoàn toàn: chạy `CAP_NHAT_TU_DONG.bat` và để cửa sổ mở —",
        "cứ thả file là hệ thống tự cập nhật sau khi file chép xong.",
        "",
        "## Bốn quy tắc",
        "",
        "- **Không đổi tên file export.** Tháng được đọc từ tên file (`T8.2026`, `2026-08`, `Tháng 8.2026`).",
        "- **Thay file = thả đè hoặc thả bản mới.** Hai file cùng tháng → hệ thống lấy bản MỚI NHẤT và báo bản bị bỏ qua. Không bao giờ cộng đôi.",
        "- **Không sửa file trong `data_input/`.** Đó là đầu ra do hệ thống sinh.",
        "- **File sai mẫu bị dời vào `_REJECT/`.** Thiếu sheet/cột bắt buộc → hệ thống không đọc, dời file vào `_REJECT/` kèm `….LY_DO.txt`; số đang có giữ nguyên. Xuất lại đúng mẫu rồi thả lại.",
        "",
        "## Các thư mục",
        "",
        *rows,
        "",
        "_Sinh tự động từ tools/l0_registry.py._",
        "",
    ])


# Mẫu nhập liệu cho nguồn KHÔNG có file xuất sẵn (team tự tổng hợp). Dòng ví dụ là
# số thật T7/2026 để người nhập thấy đúng đơn vị; hệ thống bỏ qua mọi file `_MAU_…`.
TEMPLATES = {
    "_MAU_Facebook_Tong_hop.xlsx": ("Tong_hop_thang",
        ["Tháng", "Fanpage", "Lượt xem", "Người xem trong kỳ", "Lượt tương tác với nội dung",
         "Lượt click vào liên kết", "Lượt truy cập", "Lượt theo dõi", "Lượt bỏ theo dõi"],
        [["2026-07", "NCB", 324782, 178208, 3694, 774, 7790, 143, 60]],
        ["Mỗi dòng = một tháng × một fanpage. Fanpage ghi mã: NCB · NDC · NJFB · NEC.",
         "Người xem trong kỳ: chọn CẢ THÁNG trên Meta Business Suite rồi chép số — KHÔNG cộng các ngày.",
         "Ô chưa có số để TRỐNG, đừng gõ 0.",
         "Lưu thành Facebook_Tong_hop_<...>.xlsx. Nhiều file thì file sửa sau thắng cho cùng tháng × fanpage."]),
    "_MAU_TikTok_Tong_hop.xlsx": ("Tong_hop_thang",
        ["Tháng", "Tài khoản", "Lượt xem bài đăng", "Lượt xem hồ sơ", "Thích", "Bình luận",
         "Lượt chia sẻ", "Số follower ròng", "Tổng follower", "Số bài đăng"],
        [["2026-07", "NOIRE F&B", 25200, 1500, 263, 7, 172, -13, None, None]],
        ["Mỗi dòng = một tháng × một tài khoản. Số lấy từ TikTok Studio › Phân tích, chọn 28/30 ngày của đúng tháng.",
         "Số follower ròng có thể âm. Ô chưa có số để TRỐNG.",
         "Lưu thành TikTok_Tong_hop_<...>.xlsx."]),
    "_MAU_CRM_Member.xlsx": ("KPI_Thang",
        ["Tháng", "Khách đăng ký"],
        [["2026-07", 124]],
        ["Tối thiểu: sheet KPI_Thang (Tháng · Khách đăng ký).",
         "Tuỳ chọn: sheet Nguon_DangKy với cột Ngày · Member đăng ký mới · OA follow mới — để đếm số ngày có số.",
         "File CRM Dashboard đầy đủ (nhiều sheet) vẫn dùng được, miễn có hai sheet trên. Tên bắt đầu bằng CRM_Dashboard."]),
    # Không có dòng số mẫu: chưa có số thật để làm ví dụ, và số bịa dễ bị chép nhầm vào sổ thật.
    "_MAU_Zalo_OA_Follower.xlsx": ("Follower",
        ["Ngày", "Tổng người quan tâm", "Bỏ quan tâm", "Ghi chú"],
        [],
        ["Mỗi dòng = MỘT ngày chụp số (tối thiểu ngày cuối mỗi tháng). Ngày gõ dạng 31/08/2026 hoặc 2026-08-31.",
         "Tổng người quan tâm: OA Manager › Thống kê › Người quan tâm — con số TỔNG tại ngày đó, không phải số mới trong kỳ.",
         "Bỏ quan tâm: số bỏ quan tâm TRONG NGÀY đó (hoặc cả kỳ nếu chỉ chụp cuối tháng — ghi rõ ở Ghi chú). Không có thì để TRỐNG.",
         "Ô chưa có số để TRỐNG, đừng gõ 0. Lưu thành Zalo_OA_Follower_<năm>.xlsx trong thư mục này.",
         "Khi OpenAPI getoa kết nối được, M8.1 lấy tổng follower tự động và sổ này chỉ còn là lịch sử."]),
}
TEMPLATE_DIR = {"_MAU_Facebook_Tong_hop.xlsx": "S18_social", "_MAU_TikTok_Tong_hop.xlsx": "S22_tiktok",
                "_MAU_CRM_Member.xlsx": "S13_member", "_MAU_Zalo_OA_Follower.xlsx": "S26_zalo_follower"}


def write_template(path, sheet, header, sample, notes):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    wb = Workbook()
    ws = wb.active
    ws.title = sheet
    ws.append(header)
    for c in ws[1]:
        c.font = Font(bold=True, color="F3F2EE")
        c.fill = PatternFill("solid", fgColor="1F1F26")
    for r in sample:
        ws.append(r)
    for i, h in enumerate(header):
        ws.column_dimensions[chr(65 + i)].width = max(12, len(h) + 4)
    g = wb.create_sheet("HUONG_DAN")
    for n in notes:
        g.append([n])
    g.column_dimensions["A"].width = 120
    wb.save(path)


def ensure_tree(dry=False):
    made = 0
    os.makedirs(L0_ROOT, exist_ok=True)
    for s in SOURCES.values():
        d = os.path.join(L0_ROOT, *s["dir"].split("/"))
        if not os.path.isdir(d):
            made += 1
            if not dry:
                os.makedirs(d, exist_ok=True)
        if not dry:
            io.open(os.path.join(d, "README.md"), "w", encoding="utf-8").write(readme_for(s))
            open(os.path.join(d, ".gitkeep"), "a").close()
    if not dry:
        io.open(os.path.join(L0_ROOT, "README.md"), "w", encoding="utf-8").write(root_readme())
        for name, (sheet, header, sample, notes) in TEMPLATES.items():
            d = os.path.join(L0_ROOT, *SOURCES[TEMPLATE_DIR[name]]["dir"].split("/"))
            write_template(os.path.join(d, name), sheet, header, sample, notes)
    return made


def _place(src, sid, base_dir, move, dry, log):
    """Đặt một file vào thư mục chuẩn, GIỮ cấu trúc con (`Tháng 8.2026/NCB/…`)."""
    rel = os.path.relpath(src, base_dir)
    dst = os.path.join(L0_ROOT, *SOURCES[sid]["dir"].split("/"), rel)
    if os.path.exists(dst):
        if os.path.getsize(dst) == os.path.getsize(src):
            return "trung"
        if os.path.getmtime(dst) >= os.path.getmtime(src):
            log.append(f"   ≠ giữ bản trong L0_input (mới hơn): {sid} · {rel}")
            return "giu"
    if not dry:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        (shutil.move if move else shutil.copy2)(src, dst)
    return "doi" if move else "chep"


def import_files(dry=False):
    log, stat = [], {"doi": 0, "chep": 0, "trung": 0, "giu": 0}
    # 1. cây L0_input cũ
    for old_rel, sids in OLD_LAYOUT.items():
        base = os.path.join(L0_ROOT, *old_rel.split("/"))
        if not os.path.isdir(base):
            continue
        for sid in ([sids] if isinstance(sids, str) else sids):
            for f in _match(sid, base):
                stat[_place(f, sid, base, True, dry, log)] += 1
    # 1b. thư mục chuẩn đã đổi tên
    for old_rel, sid in RENAMED.items():
        base = os.path.join(L0_ROOT, *old_rel.split("/"))
        if not os.path.isdir(base):
            continue
        for root, _, files in os.walk(base):
            for f in files:
                src = os.path.join(root, f)
                if _is_data(src):
                    stat[_place(src, sid, base, True, dry, log)] += 1
        left = [os.path.join(r, f) for r, _, fs in os.walk(base) for f in fs
                if _is_data(os.path.join(r, f))]
        if not left and not dry:
            shutil.rmtree(base)          # chỉ còn README.md/.gitkeep do script này sinh
            log.append(f"   → gỡ khung thư mục cũ: {old_rel}")
        elif left:
            log.append(f"   ! còn {len(left)} file chưa dời ở {old_rel} — kiểm tra tay")
    # 2. cây HIGHGATE
    if os.path.isdir(HIGHGATE):
        for sid, rel in SOURCES_DOC.get("highgate_origin", {}).items():
            base = os.path.join(HIGHGATE, *rel.split("/"))
            if not os.path.isdir(base):
                log.append(f"   ! HIGHGATE không có thư mục nguồn {sid}: {rel}")
                continue
            for f in _match(sid, base):
                stat[_place(f, sid, base, False, dry, log)] += 1
    # 3. thư mục cũ còn sót
    canon_top = {s["dir"].split("/")[0] for s in SOURCES.values()}
    # `_…` là thư mục hệ thống (_REJECT cách ly file sai mẫu, _archive) — không phải cây cũ.
    leftovers = [d for d in os.listdir(L0_ROOT)
                 if os.path.isdir(os.path.join(L0_ROOT, d)) and d not in canon_top
                 and not d.startswith("_")]
    arch = os.path.join(ROOT, "_archive", "L0_input_cu")
    for d in leftovers:
        log.append(f"   → dời thư mục cũ vào _archive/L0_input_cu/: {d}")
        if not dry:
            os.makedirs(arch, exist_ok=True)
            target, n = os.path.join(arch, d), 1
            while os.path.exists(target):          # không bao giờ ghi đè, không xoá
                n += 1
                target = os.path.join(arch, f"{d}_{n}")
            shutil.move(os.path.join(L0_ROOT, d), target)
    return stat, log


def main(argv):
    dry = "--dry" in argv
    print("─" * 74)
    print(f"DỰNG L0_input CHUẨN{'  (DRY — không ghi gì)' if dry else ''}")
    print(f"gốc: {L0_ROOT}")
    print("─" * 74)
    made = ensure_tree(dry)
    print(f"thư mục chuẩn: {len(SOURCES)} nguồn · tạo mới {made}")
    if "--import" in argv:
        stat, log = import_files(dry)
        for line in log:
            print(line)
        print(f"file: dời {stat['doi']} · chép {stat['chep']} · đã có sẵn {stat['trung']} · giữ bản mới hơn {stat['giu']}")
    ensure_tree(dry)   # README lại lần nữa sau khi dời thư mục cũ
    print("\nTiếp theo:  python check_input.py   (xem thiếu file gì)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
