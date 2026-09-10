# -*- coding: utf-8 -*-
"""
NOIRE ANALYTICS HUB — KIỂM TRA TẦNG L0 (trước khi chạy ETL)
===========================================================
Quét gốc dữ liệu theo đúng sổ đăng ký `data_sources.json` và trả lời 3 câu hỏi:

  1. Hệ thống đang lấy dữ liệu ở GỐC NÀO?
  2. Nguồn nào đã có file, nguồn nào còn trống?
  3. Nguồn theo tháng đã có tới tháng mấy — tháng nào bị THIẾU giữa chuỗi?

Chạy:  python check_input.py
Không đọc nội dung Excel, không sửa gì — chỉ soi thư mục nên chạy trong 1 giây.

Nguyên tắc NT1: raw bất khả xâm phạm. Script này CHỈ ĐỌC.
"""
import os, re, sys, json, glob, fnmatch
# Console Windows mặc định là cp1252 và không in được tiếng Việt: mọi print có dấu
# sẽ ném UnicodeEncodeError và giết cả script giữa chừng. Ép UTF-8 ngay từ đầu.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
REG  = os.path.join(HERE, "data_sources.json")

OK, WARN, BAD = "[OK]  ", "[TRỐNG]", "[THIẾU]"


def has_data(root, marker):
    d = os.path.join(root, marker)
    if not os.path.isdir(d):
        return False
    for _, _, files in os.walk(d):
        if any(f.lower().endswith((".xlsx", ".xls")) for f in files):
            return True
    return False


def find_root():
    """Cùng thứ tự ưu tiên với build_hub.py / build_mkt.py."""
    cands = [c for c in [os.environ.get("NOIRE_ROOT"),
                         os.path.join(HERE, "L0_input"),
                         os.path.abspath(os.path.join(HERE, "..")),
                         r"D:\PROJECT\3. HIGHGATE 5.2026"] if c]
    for c in cands:
        if has_data(c, "05 Data Raw"):
            return c, "có dữ liệu thật"
    for c in cands:
        if os.path.isdir(os.path.join(c, "05 Data Raw")):
            return c, "đúng cấu trúc nhưng CHƯA CÓ FILE"
    return cands[0], "KHÔNG tìm thấy gốc hợp lệ"


def match_files(folder, patterns):
    """Gom file theo danh sách mẫu, hỗ trợ 'a.xlsx | b.xlsx' và bộ lọc loại trừ."""
    if not os.path.isdir(folder):
        return None
    found = []
    for pat in patterns:
        pat = pat.strip()
        neg = "(loại trừ" in pat or "bỏ file" in pat
        pat = re.sub(r"\s*\(.*?\)\s*", "", pat).strip()
        for f in sorted(glob.glob(os.path.join(folder, "*"))):
            if os.path.isdir(f):
                continue
            base = os.path.basename(f)
            if base == ".gitkeep":
                continue
            if fnmatch.fnmatch(base.lower(), pat.lower()):
                found.append(base)
        if neg:
            found = [f for f in found if "group-by-date" not in f and "per_day" not in f]
    return sorted(set(found))


def months_of(files, rx):
    """Rút kỳ YYYY-MM từ tên file theo month_regex đã khai báo trong registry."""
    out = []
    for f in files:
        m = re.search(rx, f, re.I)
        if not m:
            continue
        a, b = m.group(1), m.group(2)
        # month_regex có 2 dạng: (tháng)(năm) hoặc (năm)-(tháng)
        if len(a) == 4:
            out.append("%s-%02d" % (a, int(b)))
        else:
            out.append("%s-%02d" % (b, int(a)))
    return sorted(set(out))


def gaps(months):
    if len(months) < 2:
        return []
    def idx(m):
        y, mm = m.split("-")
        return int(y) * 12 + int(mm)
    lo, hi = idx(months[0]), idx(months[-1])
    have = {idx(m) for m in months}
    return ["%04d-%02d" % ((i - 1) // 12, (i - 1) % 12 + 1)
            for i in range(lo, hi + 1) if i not in have]


def main():
    if not os.path.exists(REG):
        print("Không thấy data_sources.json — không kiểm tra được.")
        return 2
    reg = json.load(open(REG, encoding="utf-8"))
    root, how = find_root()

    print("=" * 78)
    print("NOIRE — KIỂM TRA TẦNG L0")
    print("=" * 78)
    print("Gốc dữ liệu : %s" % root)
    print("Trạng thái  : %s" % how)
    print("Sổ đăng ký  : data_sources.json  (v%s · cập nhật %s)" % (reg.get("version"), reg.get("updated")))
    print("-" * 78)

    ready = missing_req = 0
    monthly_report = []

    for s in reg["sources"]:
        folder = os.path.join(root, s["dir"])
        pats = s.get("files") or [s.get("pattern", "*.xlsx")]
        if isinstance(pats, str):
            pats = [pats]
        pats = [p for one in pats for p in one.split("|")]
        files = match_files(folder, pats)

        if files is None:
            state, note = BAD, "thư mục chưa tồn tại"
        elif not files:
            state = BAD if s.get("required") else WARN
            note = "chưa có file"
        else:
            state, note = OK, "%d file" % len(files)
            ready += 1

        if state == BAD and s.get("required"):
            missing_req += 1

        print("%s %-16s %-22s %s" % (state, s["id"], s.get("produces", ""), note))
        print("        %s" % s["dir"])

        rx = s.get("month_regex")
        if rx and files:
            ms = months_of(files, rx)
            if ms:
                g = gaps(ms)
                print("        kỳ: %s → %s (%d tháng)%s" % (
                    ms[0], ms[-1], len(ms), "  ⚠ THIẾU: " + ", ".join(g) if g else ""))
                monthly_report.append((s["id"], ms, g))
        if s.get("blocking"):
            print("        ⚠ %s" % s["blocking"])

    print("-" * 78)
    print("Sẵn sàng: %d/%d nguồn · nguồn BẮT BUỘC còn thiếu: %d" % (ready, len(reg["sources"]), missing_req))

    if monthly_report:
        common = set.intersection(*[set(m) for _, m, _ in monthly_report]) if monthly_report else set()
        if common:
            print("Kỳ có ĐỦ mọi nguồn theo tháng: %s → %s" % (min(common), max(common)))
        holes = sorted({g for _, _, gs in monthly_report for g in gs})
        if holes:
            print("Tháng bị hụt ở ít nhất một nguồn: %s" % ", ".join(holes))

    print("\nSổ thiếu dữ liệu (từ registry) — quyết định module nào chạy được:")
    for m in reg.get("missing_data_register", []):
        print("  %2d. %-52s chặn %-12s [%s]" % (
            m["no"], m["item"][:52], ",".join(m["blocks"]), m["status"]))

    print("\nBước tiếp theo:  python run_pipeline.py")
    return 1 if missing_req else 0


if __name__ == "__main__":
    sys.exit(main())
