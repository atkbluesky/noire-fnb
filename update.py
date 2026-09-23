# -*- coding: utf-8 -*-
"""
NOIRE ANALYTICS HUB — CẬP NHẬT MỘT CHẠM
=======================================
    CAP_NHAT.bat                 nháy đúp — cập nhật những gì đã thay đổi
    CAP_NHAT_TU_DONG.bat         để cửa sổ mở — thả file là tự cập nhật

    python update.py             như CAP_NHAT.bat
    python update.py --watch     như CAP_NHAT_TU_DONG.bat (mặc định soát mỗi 30 giây)
    python update.py --force     dựng lại TẤT CẢ, bỏ qua bộ nhớ thay đổi
    python update.py --check     chỉ kiểm kê thiếu file, không dựng gì

QUY TRÌNH
  Thả file Excel thô vào L0_input/<thư mục nguồn>/ → chạy lệnh trên. Hệ thống:
    1. So từng file với lần chạy trước (kích thước + giờ sửa) → biết file nào MỚI / THAY / XOÁ.
    2. Suy ra phải dựng lại gì — chỉ đúng tháng và đúng phần bị ảnh hưởng:
         file Meta Ads T8 mới      → build_month 2026-08 --parts=meta
         file doanh thu ngày mới   → tools/tracking.py → build_month mọi tháng --parts=tracking
         file POS T9 thay bản mới  → build_month 2026-09 --parts=pos + build_hub + export
    3. Chạy loader Node (scripts/build-data.mjs) → src/data/*.json + 16 chốt QA.
    4. Ghi L0_input/_BAO_CAO_CAP_NHAT.txt: đã dựng gì, chốt QA nào đỏ, THIẾU FILE GÌ.
  Bước nào lỗi thì KHÔNG ghi nhớ thay đổi — lần chạy sau tự làm lại bước đó.
"""
from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, "tools")
sys.path.insert(0, TOOLS)

import monthly_lib as L  # noqa: E402
from l0_report import build_report  # noqa: E402

MANIFEST = os.path.join(HERE, "_cache", "l0_manifest.json")
REPORT = os.path.join(L.L0_ROOT, "_BAO_CAO_CAP_NHAT.txt")
PY = sys.executable or "python"

# Nguồn → phần của tools/build_month.py (khai ở BUILDERS bên đó, đọc lại cho khỏi lệch).
def _part_map():
    import importlib
    bm = importlib.import_module("build_month")
    return {sid: key for key, srcs in bm.PART_SOURCES.items() for sid in srcs}


# Nguồn nuôi hai lane cũ (bảng luỹ kế: Menu · giờ · khu vực · voucher · đối tác · KPI CRM).
HUB_SOURCES = {"S01_item", "S02_bill", "S03_daily", "S04_monthly", "S05_bom"}
MKT_SOURCES = {"S08_ads_meta", "S09_ads_google", "S10_budget", "S11_voucher", "S12_zalo_oa",
               "S13_member", "S14_crm_kpi", "S15_partnership", "S16_pre_analytics", "S19_aggregator", "S21_evoucher",
               "S17_lto_actual"}
# Nguồn luỹ kế: một file phủ nhiều tháng → đổi file là dựng lại mọi tháng.
ALL_MONTH_SOURCES = {"S03_daily", "S00_targets", "S13_member", "S07_lead", "S22_tiktok"}


# ─────────────────────────── ảnh chụp L0 ───────────────────────────
def _entry(v):
    """Manifest cũ lưu mỗi file một chuỗi chữ ký — đọc được cả hai dạng."""
    return v if isinstance(v, dict) else {"sig": v, "sha": None}


def snapshot(prev=None):
    """{đường_dẫn_tương_đối: {sig, sha}} cho MỌI file dữ liệu trong thư mục các nguồn.

    `sig` (kích thước + giờ sửa) để soát nhanh; `sha` (hash nội dung) để QUYẾT ĐỊNH.
    File có `sig` y như lần trước thì dùng lại `sha` cũ — không băm lại 567 MB mỗi 30 giây.
    Giới hạn đã biết: sửa nội dung mà giữ nguyên kích thước VÀ cùng giây sửa thì lọt —
    trường hợp đó chạy `--force`."""
    prev = prev or {}
    out = {}
    for sid in L.SOURCES:
        d = L.l0_dir(sid)
        if not d:
            continue
        for root, _, files in os.walk(d):
            for f in files:
                p = os.path.join(root, f)
                if not L._is_data(p):
                    continue
                rel = os.path.relpath(p, L.L0_ROOT).replace("\\", "/")
                sig, old = L.file_sig(p), prev.get(rel)
                sha = old["sha"] if old and old["sig"] == sig and old.get("sha") else L.file_sha(p)
                out[rel] = {"sig": sig, "sha": sha}
    return out


def current(man):
    """Ảnh chụp đĩa + file đang GIỮ SỐ (bị cách ly sau khi đè lên bản đúng — xem quarantine)."""
    snap = snapshot(man["files"])
    held = man["held"]
    for rel in list(held):
        if rel in snap or _held_superseded(rel):
            del held[rel]                    # đã có bản mới → dựng lại bình thường
        else:
            snap[rel] = held[rel]
    return snap


def _held_superseded(rel):
    """Nguồn đã có file khác thay chỗ file bị cách ly (cùng tháng, hoặc nguồn không theo tháng)."""
    sid = source_of(rel)
    if not sid:
        return True
    m = L.file_month(sid, os.path.join(L.L0_ROOT, rel))
    return m in L.l0_by_month(sid) if m else bool(L.l0_files(sid))


def source_of(rel):
    best = None
    for sid, s in L.SOURCES.items():
        if rel.startswith(s["dir"] + "/") and (best is None or len(s["dir"]) > len(L.SOURCES[best]["dir"])):
            best = sid
    return best


def load_manifest():
    try:
        d = json.load(io.open(MANIFEST, encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    return {"files": {k: _entry(v) for k, v in (d.get("files") or {}).items()},
            "held": {k: _entry(v) for k, v in (d.get("held") or {}).items()}}


def save_manifest(files, held):
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    io.open(MANIFEST, "w", encoding="utf-8").write(json.dumps(
        {"files": files, "held": held, "saved": datetime.now().isoformat(timespec="seconds")},
        ensure_ascii=False, indent=1))


def _same(a, b):
    """Cùng NỘI DUNG. Manifest cũ chưa có hash thì so theo chữ ký như trước."""
    if a.get("sha") and b.get("sha"):
        return a["sha"] == b["sha"]
    return a["sig"] == b["sig"]


def diff(old, new):
    added = sorted(k for k in new if k not in old)
    changed = sorted(k for k in new if k in old and not _same(old[k], new[k]))
    removed = sorted(k for k in old if k not in new)
    return added, changed, removed


# ─────────────────────────── cách ly file sai mẫu ───────────────────────────
REJECT = os.path.join(L.L0_ROOT, "_REJECT")


def _reject_target(rel):
    dest = os.path.join(REJECT, *rel.split("/"))
    if os.path.exists(dest):                 # không bao giờ ghi đè bản đã cách ly trước
        stem, ext = os.path.splitext(dest)
        dest = f"{stem}__{datetime.now():%Y%m%d-%H%M%S}{ext}"
    return dest


def quarantine(rels, new, old, held):
    """File MỚI / VỪA THAY mà sai mẫu (thiếu sheet/cột bắt buộc) → dời vào L0_input/_REJECT/.

    Vì sao phải dời chứ không chỉ báo: hai file cùng tháng thì hệ thống lấy bản MỚI NHẤT,
    nên bản sai vừa thả sẽ thắng bản đúng đang dùng và dashboard đọc ra số hỏng.

    Chỉ xét file vừa đổi — file đang dùng ổn định không bị đụng. Chỉ xét file khớp MẪU TÊN
    của nguồn: file lạ là đầu vào của tools/l0_ingest.py (cổng chuẩn hoá), không phải lỗi.
    Bản sai ĐÈ lên bản đúng cùng tên → giữ số đã dựng (`held`) tới khi có bản đúng thay,
    thay vì dựng lại tháng đó với nguồn rỗng.
    → (đã cách ly [(rel, đích, lỗi, giữ_số)], chưa xử lý được [(rel, lý do)])"""
    from l0_validate import validate_file
    cands = []
    for rel in rels:
        sid = source_of(rel)
        if not sid or (L.SOURCES[sid].get("schema") or {}).get("month_files"):
            continue
        path = os.path.join(L.L0_ROOT, rel)
        if os.path.normcase(path) not in {os.path.normcase(f) for f in L.l0_files(sid)}:
            continue
        errs = validate_file(sid, path)
        if errs:
            cands.append((rel, sid, path, errs))
    moved, busy = [], []
    if not cands:
        return moved, busy
    time.sleep(2)                            # file còn đang chép thì chữ ký còn đổi
    for rel, sid, path, errs in cands:
        if L.file_sig(path) != new[rel]["sig"]:
            busy.append((rel, "đang chép dở — chạy lại khi chép xong"))
        else:
            dest = _reject_target(rel)
            try:
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                # rename chứ không shutil.move: file đang mở thì move lùi về chép-rồi-xoá,
                # xoá hỏng là để lại một bản sao rác trong _REJECT. Cùng ổ đĩa nên rename đủ.
                os.rename(path, dest)
            except OSError as e:
                busy.append((rel, f"không dời được (đang mở trong Excel?) — {str(e)[:60]}"))
            else:
                keep = rel in old
                io.open(dest + ".LY_DO.txt", "w", encoding="utf-8").write("\n".join([
                    f"CÁCH LY {datetime.now():%d/%m/%Y %H:%M} — file sai mẫu chuẩn, hệ thống KHÔNG đọc.",
                    f"Nguồn   : {L.SOURCES[sid]['name']}",
                    f"Từ      : L0_input/{rel}",
                    "", "Lỗi:", *(f"  · {e}" for e in errs), "",
                    f"Cách xử lý: xuất lại đúng mẫu (xem L0_input/{L.SOURCES[sid]['dir']}/README.md) "
                    f"rồi thả vào L0_input/{L.SOURCES[sid]['dir']}/.",
                    *(["Số trên dashboard đang giữ theo bản đúng dựng lần trước."] if keep else []),
                    "File này có thể xoá khi đã thả bản đúng.", ""]))
                moved.append((rel, os.path.relpath(dest, L.L0_ROOT).replace("\\", "/"), errs, keep))
                new.pop(rel)
                if keep:
                    held[rel] = old[rel]
                    new[rel] = old[rel]
                continue
        # chưa dời được → lần này coi như chưa thấy file, lần sau soát lại
        if rel in old:
            new[rel] = old[rel]
        else:
            new.pop(rel)
    return moved, busy


def quarantine_lines(moved, busy):
    out = []
    if moved:
        out += ["FILE SAI MẪU — ĐÃ DỜI VÀO L0_input/_REJECT/ (hệ thống KHÔNG đọc)"]
        for rel, dest, errs, keep in moved:
            out.append(f"  ✖ {rel}")
            out += [f"      · {e}" for e in errs]
            out.append(f"      → nằm ở {dest} (kèm file .LY_DO.txt)")
            if keep:
                out.append("      → file này ĐÈ lên bản đúng cùng tên: số trên dashboard giữ theo bản dựng lần trước")
        out.append("  Xuất lại đúng mẫu rồi thả vào thư mục nguồn như bình thường.")
    if busy:
        out += ["", "FILE SAI MẪU — CHƯA XỬ LÝ LẦN NÀY"] if out else ["FILE SAI MẪU — CHƯA XỬ LÝ LẦN NÀY"]
        out += [f"  ⚠ {rel}: {why}" for rel, why in busy]
    return out + [""] if out else []


# ─────────────────────────── lập kế hoạch ───────────────────────────
def all_months():
    ms = set(L.l0_by_month("S02_bill")) | set(L.l0_by_month("S01_item"))
    return sorted(m for m in ms if m >= "2026-01")


def plan(touched, force=False):
    """touched = [(đường_dẫn, nguồn)] → kế hoạch dựng."""
    pm = _part_map()
    p = {"tracking": False, "months": {}, "hub": False, "mkt": False, "campaign": False, "preeval": False}
    if force:
        p.update(tracking=True, hub=True, mkt=True, campaign=True, preeval=True)
        for m in all_months():
            p["months"][m] = None                      # None = mọi phần
        return p
    for rel, sid in touched:
        if not sid:
            continue
        if sid in ("S03_daily", "S00_targets"):
            p["tracking"] = True
        part = pm.get(sid)
        if part:
            if sid == "S07_lead":
                # Sổ booking có lead nhận TRƯỚC 2026 mà tiệc diễn ra trong 2026 — thiếu các
                # tháng đó thì lịch doanh thu tiệc theo tháng diễn ra hụt số.
                import build_month
                months = sorted(set(all_months()) | set(build_month.booking_months()))
            elif sid in ALL_MONTH_SOURCES:
                months = all_months()
            else:
                m = L.file_month(sid, os.path.join(L.L0_ROOT, rel))
                months = [m] if m else []
            for m in months:
                cur = p["months"].setdefault(m, set())
                if cur is not None:
                    cur.add(part)
        if sid in HUB_SOURCES:
            p["hub"] = True
        if sid in MKT_SOURCES:
            p["mkt"] = True
        if sid in ("S23_campaign", "S16_pre_analytics"):   # danh mục chương trình · kế hoạch Pre-Analysis
            p["campaign"] = True
        if sid in ("S24_preeval", "S16_pre_analytics"):     # sổ đánh giá · file deck quý → mẫu chuẩn M7.1
            p["preeval"] = True
    # M7.2 đo trên số tháng (ngày · fact_promo_day · ads) → tháng đổi là đo lại
    if p["months"] or p["tracking"]:
        p["campaign"] = True
        p["preeval"] = True          # dữ liệu nền (TC · AOV · giảm giá) đổi → đánh giá lại
    if p["hub"]:
        p["mkt"] = True          # build_mkt cần bill_index.pkl mới để khớp voucher ↔ hoá đơn
    return p


def describe(p):
    lines = []
    if p["tracking"]:
        lines.append("  · dựng lại Tracking Sales từ file doanh thu ngày")
    for m, parts in sorted(p["months"].items()):
        lines.append(f"  · tháng {m}: {'mọi phần' if parts is None else ', '.join(sorted(parts))}")
    if p["hub"]:
        lines.append("  · lane POS luỹ kế (Menu · giờ · khu vực · nhân viên · CTKM) — build_hub.py")
    if p["mkt"]:
        lines.append("  · lane Marketing luỹ kế (voucher · đối tác · KPI CRM) — build_mkt.py")
    if p.get("campaign"):
        lines.append("  · M7.2 đo chương trình (kỳ nền · đối chứng · lift · ROI) — tools/campaign.py")
    if p.get("preeval"):
        lines.append("  · M7.1 đánh giá chương trình trước khi chạy (PP672 × TC·AOV) — tools/preeval.py")
    return lines or ["  · không có gì thay đổi"]


# ─────────────────────────── chạy ───────────────────────────
def run(label, args, log):
    t0 = time.time()
    print(f"\n▶ {label}")
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    proc = subprocess.run(args, cwd=HERE, env=env, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
    out = (proc.stdout or "") + (proc.stderr or "")
    tail = [ln for ln in out.splitlines() if ln.strip()][-12:]
    for ln in tail:
        print("   " + ln)
    ok = proc.returncode == 0
    log.append((label, ok, round(time.time() - t0), out))
    print(f"   {'✔' if ok else '✖'} {label} ({round(time.time() - t0)}s)")
    return ok


def execute(p):
    log = []
    ok = True
    if p["tracking"]:
        ok &= run("Tracking Sales", [PY, os.path.join(TOOLS, "tracking.py")], log)
    # gom các tháng có CÙNG tập phần để gọi build_month một lần
    groups = {}
    for m, parts in p["months"].items():
        key = "ALL" if parts is None else ",".join(sorted(parts))
        groups.setdefault(key, []).append(m)
    for key, months in sorted(groups.items()):
        args = [PY, os.path.join(TOOLS, "build_month.py"), *sorted(months)]
        if key != "ALL":
            args.append(f"--parts={key}")
        ok &= run(f"Số liệu tháng {', '.join(sorted(months))} [{key}]", args, log)
    if p["hub"]:
        ok &= run("Lane POS luỹ kế (build_hub.py)", [PY, os.path.join(HERE, "build_hub.py")], log)
    if p["mkt"]:
        ok &= run("Lane Marketing luỹ kế (build_mkt.py)", [PY, os.path.join(HERE, "build_mkt.py")], log)
    if p["hub"] or p["mkt"]:
        ok &= run("Xuất bảng luỹ kế vào data_input/", [PY, os.path.join(TOOLS, "export_derived.py")], log)
    if p.get("campaign"):
        ok &= run("M7.2 đo chương trình (campaign.py)", [PY, os.path.join(TOOLS, "campaign.py")], log)
    if p.get("preeval"):
        ok &= run("M7.1 đánh giá trước khi chạy (preeval.py)", [PY, os.path.join(TOOLS, "preeval.py")], log)
    node = shutil.which("node")
    if node:
        ok &= run("Loader dashboard + chốt QA", [node, os.path.join(HERE, "scripts", "build-data.mjs"), "--strict"], log)
    else:
        log.append(("Loader dashboard", False, 0, "không thấy Node.js — cài Node rồi chạy npm run build:data"))
        ok = False
    return ok, log


def qa_lines(log):
    for label, _, _, out in log:
        if label.startswith("Loader"):
            rows = [ln.strip() for ln in out.splitlines()]
            return [ln for ln in rows
                    if "CHỐT QA" in ln or (ln.startswith(("✔ ", "✖ ")) and ". " in ln[:7])]
    return []


def write_report(changes, p, ok, log, qlines=()):
    lines = [
        f"BÁO CÁO CẬP NHẬT — {datetime.now():%d/%m/%Y %H:%M}",
        f"Kết quả: {'THÀNH CÔNG' if ok else 'CÓ LỖI — xem các bước ✖ bên dưới, lần chạy sau sẽ tự làm lại'}",
        "",
        *qlines,
        "FILE THAY ĐỔI SO VỚI LẦN TRƯỚC",
    ]
    added, changed, removed = changes
    for tag, fs in (("mới ", added), ("thay", changed), ("xoá", removed)):
        for f in fs[:40]:
            lines.append(f"  [{tag}] {f}")
        if len(fs) > 40:
            lines.append(f"  … và {len(fs) - 40} file {tag} khác")
    if not any(changes):
        lines.append("  (không có)")
    lines += ["", "ĐÃ DỰNG", *describe(p), "", "CÁC BƯỚC"]
    for label, s_ok, sec, out in log:
        lines.append(f"  {'✔' if s_ok else '✖'} {label} ({sec}s)")
        if not s_ok:
            lines += ["      " + ln for ln in out.splitlines()[-8:]]
    q = qa_lines(log)
    if q:
        lines += ["", "CHỐT QA", *("  " + x for x in q)]
    rep, _, _ = build_report()
    lines += ["", *rep]
    try:
        from month_audit import render
        m_lines, _ = render(L.last_closed_month())
        lines += ["", *m_lines]
    except Exception as e:  # noqa: BLE001
        lines += ["", f"⚠ không chạy được kiểm tra độ đủ tháng: {str(e)[:80]}"]
    os.makedirs(L.L0_ROOT, exist_ok=True)
    io.open(REPORT, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    return lines


def once(force=False):
    print("=" * 78)
    print(f"NOIRE — CẬP NHẬT DASHBOARD   {datetime.now():%d/%m/%Y %H:%M}")
    print(f"thư mục thả file: {L.L0_ROOT}")
    print("=" * 78)
    man = load_manifest()
    old, held = man["files"], man["held"]
    new = current(man)
    added, changed, removed = diff(old, new)
    moved, busy = quarantine(added + changed, new, old, held)
    if moved or busy:
        added, changed, removed = diff(old, new)
    qlines = quarantine_lines(moved, busy)
    for ln in qlines:
        print(ln)
    touched = [(f, source_of(f)) for f in added + changed + removed]
    p = plan(touched, force)
    print(f"file: {len(added)} mới · {len(changed)} thay · {len(removed)} xoá")
    print("\n".join(describe(p)))
    nothing = not (p["tracking"] or p["months"] or p["hub"] or p["mkt"] or p["campaign"] or p["preeval"])
    if nothing:
        rep, bad, _ = build_report()
        try:
            from month_audit import render
            rep += ["", *render(L.last_closed_month())[0]]
        except Exception as e:  # noqa: BLE001
            rep += ["", f"⚠ không chạy được kiểm tra độ đủ tháng: {str(e)[:80]}"]
        io.open(REPORT, "w", encoding="utf-8").write(
            f"BÁO CÁO CẬP NHẬT — {datetime.now():%d/%m/%Y %H:%M}\nKhông có file nào thay đổi — dashboard đã mới nhất.\n\n"
            + "\n".join([*qlines, *rep]) + "\n")
        save_manifest(new, held)             # nội dung không đổi — chỉ cập nhật chữ ký / file giữ số
        print("\nKhông có file nào thay đổi — dashboard đã mới nhất.")
        print(f"Báo cáo thiếu file: {REPORT}")
        return 0
    ok, log = execute(p)
    write_report((added, changed, removed), p, ok, log, qlines)
    # Lỗi thì KHÔNG ghi nhớ thay đổi (lần sau làm lại) — nhưng vẫn phải nhớ file nào đang
    # giữ số vì đã bị cách ly, nếu không lần sau tưởng file bị xoá và dựng tháng đó với nguồn rỗng.
    save_manifest(new if ok else old, held)
    print("\n" + "=" * 78)
    print("✔ XONG — dashboard đã cập nhật." if ok else "✖ CÓ BƯỚC LỖI — chưa ghi nhớ thay đổi, lần sau tự chạy lại.")
    print(f"Báo cáo: {REPORT}")
    print("=" * 78)
    return 0 if ok else 1


def watch(interval=30):
    print(f"TỰ ĐỘNG CẬP NHẬT — soát L0_input mỗi {interval}s. Đóng cửa sổ để dừng.")
    once()
    last = None
    while True:
        time.sleep(interval)
        man = load_manifest()
        cur = current(man)
        if not any(diff(man["files"], cur)):
            if cur != man["files"]:
                save_manifest(cur, man["held"])   # chỉ đổi giờ sửa, nội dung y nguyên
            last = None
            continue
        # Chờ file chép XONG: hai lần soát liên tiếp giống nhau mới chạy. File 60MB
        # đang chép dở mà dựng ngay là đọc ra Excel hỏng.
        if cur != last:
            last = cur
            print(f"{datetime.now():%H:%M:%S} thấy file thay đổi — đợi chép xong…")
            continue
        once()
        last = None


def main(argv):
    if "--check" in argv:
        rep, bad, _ = build_report()
        print("\n".join(rep))
        return 1 if bad else 0
    if "--watch" in argv:
        iv = next((int(a.split("=")[1]) for a in argv if a.startswith("--interval=")), 30)
        try:
            watch(iv)
        except KeyboardInterrupt:
            print("\nđã dừng.")
        return 0
    return once(force="--force" in argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
