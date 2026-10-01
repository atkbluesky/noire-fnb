# M7 · QUY CHUẨN CHUNG — TÊN GỌI · VIẾT TẮT · CÁCH TÍNH (M7 · M7.1 · M7.2)

| | |
|---|---|
| **Mục đích** | Một chỉ số = **một mã · một tên · một công thức · một nơi tính**. Mỗi lần chạy `CAP_NHAT.bat` hoặc sửa màn hình đều lấy chung bộ này, không mỗi màn một cách |
| **Phạm vi** | [M7 Promotion](M7_Promotion.md) · [M7.1 Pre-Analytics](M7_1_Pre_Analytics.md) · [M7.2 Promotion Tracking](M7_2_Promotion_Tracking.md) |
| **Trạng thái** | 🟢 **Đã triển khai 30/09/2026** — POSM = `PRINT` · `MERCH` thuộc Quà tặng · CT Q3 quy về mẫu M7.1 · khối Giá vốn ở bảng chuẩn (phương án A) · engine `tools/promo_eval.py` · màn `PromoScoreTable` |
| **Ưu tiên khi mâu thuẫn** | File này > ghi chú cũ trong 3 tài liệu M7 |

---

## 1. Bốn luật nền

| # | Luật | Vì sao |
|---|---|---|
| **N1** | **Công thức chỉ nằm ở engine.** Kế hoạch: `tools/preeval.py`. Thực tế: `tools/campaign.py`. Màn hình (`.tsx`) **chỉ hiển thị**, không tự nhân/chia/cộng số nghiệp vụ | Trước đây 3 chỗ tính lãi khác nhau (§7) |
| **N2** | **Tên, đơn vị, nhãn nằm ở `data_contract.json`** (khối `$metrics`, §6). Engine và màn hình cùng đọc | `CAMPAIGN.taxonomy` đã làm đúng cách này cho nhãn/đòn bẩy/cơ chế — mở rộng cho chỉ số |
| **N3** | **Một chương trình = một phạm vi chấm:** hoá đơn gắn CTKM (hoặc chứa món LTO). Cấp cửa hàng chỉ để **kiểm chứng**, không có Target, không cộng vào KPI | Khối "chấm" và khối "kiểm chứng" từng hiện 2 số "Tăng thêm" lệch 13 lần |
| **N4** | **Kế hoạch = bản đã khoá của M7.1** (`05_plan_lock.xlsx`). Không còn nhánh chấm riêng cho kế hoạch Q3 (`pre_id`) — Q3 được chuyển sang cùng schema | Hai nguồn kế hoạch ⇒ hai cách tính tăng thêm |

## 2. Từ điển thuật ngữ & viết tắt

| Viết tắt | Đọc là | Định nghĩa | **Không dùng** (tên cũ) |
|---|---|---|---|
| **CTKM** | Chương trình khuyến mãi | Chuỗi ở cột `Tên CTKM` trên POS. Một hoá đơn gắn tối đa một tên | — |
| **CT** | Chương trình | Một dòng `dim_campaign` (có `campaign_id`), gộp ≥ 1 tên CTKM | "chiến dịch" |
| **KH** | Kế hoạch | Số của M7.1 **đã khoá** | "Plan" trong câu tiếng Việt |
| **Nền** | Không có khuyến mãi | Phần doanh thu/TC/khách **vẫn xảy ra nếu không chạy CT** | "Nền KH", "Kỳ vọng", "Base" |
| **Target** | Mục tiêu | Số KH đã khoá, nộp **trước** `date_from` | "Target KH" |
| **Thực tế** | | Số đo từ POS (+ chi phí khai tay) | "Actual" |
| **% đạt** | | Thực tế ÷ Target. Chi phí: **dùng ÷ ngân sách** (≤ 100% là tốt) | — |
| **TC** | Transaction count | Số hoá đơn. Trong câu văn viết "hoá đơn" hoặc "HĐ"; trong bảng viết **TC** | "bills" |
| **Guest** | Khách | Tổng `Số khách` | "pax", "khách" lẫn lộn |
| **DT CTKM** | Doanh thu CTKM | **Σ Tổng tiền cả hoá đơn** có CT — sau giảm giá, gồm phí + VAT | "Doanh thu chạm", "DT trước ưu đãi" |
| **AOV** | Average order value | DT CTKM ÷ TC | — |
| **TA** | Trung bình chi tiêu / khách | DT CTKM ÷ Guest | "spend per head" |
| **Party** | Quy mô nhóm | Guest ÷ TC | "pax/bill" |
| **Tăng thêm** | Doanh thu tăng thêm | DT CTKM − phần vốn sẽ đến khi không có CT (§3-N3). **Gồm VAT** | "Lift" (chỉ dùng cho **tỷ lệ** %) |
| **DT thuần** | | Tổng tiền ÷ 1,08 (`$preeval.vat`) — chỉ dùng trong khối lợi nhuận | — |
| **COGS** | Giá vốn | Xem §3-C | "Biên LN" (`cm_pct`) ở màn hình |
| **Lãi gộp** | GP | DT thuần tăng thêm − COGS | — |
| **Quà tặng** | | Giá vốn món tặng (`GIFT_COGS`) **+** vật phẩm (`MERCH`) | "Vật phẩm" đứng riêng |
| **POSM** | In ấn / POSM | `PRINT` | — |
| **Opex** | Chi phí vận hành biến đổi | % DT thuần tăng thêm theo brand (`ty_le_chi_phi`, Finance khoá) | — |
| **EBITDA tăng thêm** | | Kết quả cuối, công thức §3-E | "Lãi thực thêm", "Đóng góp ròng", "Flow-through", "Net contribution" |
| **ROI** | | EBITDA tăng thêm ÷ (giảm giá + quà + chi phí CT), đơn vị **×** | — |
| **Cannib** | Ăn thịt lẫn nhau | % khách vốn sẽ đến dù không có CT | — |
| **pb** | Phân bổ | Kết quả cả kỳ chạy chia theo tỷ trọng DT CTKM vào tháng/brand đang lọc | — |
| **ex-VAT** | | Đã chia 1,08 | — |

**Quy ước trình bày**
- Tiền: `tr` (triệu) · `k` (nghìn) · đầy đủ khi < 1k. Tỷ lệ: 1 số lẻ (`15,0%`). ROI: 2 số lẻ + `×`.
- **Ô rỗng có 3 nghĩa, không được lẫn:** `—` = không áp dụng / không có dữ liệu · `chưa khai` = chi phí chưa nhập (**không phải 0**) · `0` = đã khai bằng 0.
- Số **ước tính** (không đo được) ghi thêm `≈`; số đo thật thì không.
- Màu % đạt: doanh thu/lợi nhuận — xanh ≥ 100%, vàng 80–99%, đỏ < 80%. Chi phí **đảo chiều**: xanh ≤ 100%.
- Target EBITDA ≤ 0 thì không hiện %, hiện **chênh lệch tuyệt đối**.

## 3. Cách tính — một công thức cho mỗi chỉ số

**A. Nền tảng (mọi màn)**
```
DT CTKM = Σ Tổng tiền cả hoá đơn có CT          (sau giảm giá; Phiếu GG là cách thanh toán, đã nằm trong Tổng tiền)
AOV = DT CTKM ÷ TC        TA = DT CTKM ÷ Guest        Party = Guest ÷ TC
Không đếm trùng: hoá đơn LTO đồng thời gắn tên CTKM (dup_*) bị trừ khi cộng nhiều CT
```

**N3. Tăng thêm** *(thay cho công thức giả định `sales × (Target − Nền) ÷ Target`)*
```
c          = %cannib. ĐO: 1 − TC tăng thêm của cửa hàng (đã khử mùa vụ) ÷ TC CTKM   |   ≈: %cannib của kế hoạch khoá
Tăng thêm  = DT CTKM × (1 − c)  −  c × Giảm giá            (gồm VAT; ex-VAT ÷ 1,08)
```
Khách **mới** (1 − c) mang trọn hoá đơn sau giảm giá. Khách **vốn sẽ đến** (c) vẫn nhận giảm giá mà không mang thêm doanh thu ⇒
**mất đúng phần giảm giá đó** (`− c × Giảm giá`). Bỏ số hạng này thì CT giảm giá nào cũng trông có lãi hơn thực tế. Không đo
mức chi tăng thêm của khách vốn sẽ đến (`uplift_pct` của M7.1) ⇒ bảo thủ với CT set/đồng giá.

Cờ độ tin cậy — **ĐO** chỉ khi đủ cả 4: CT ≥ 5% DT cửa hàng · ≥ 20 hoá đơn · |lift cửa hàng| ≤ DT CTKM · không chạy chồng kỳ
(`$campaign.min_store_share` · `min_store_bills`). Không thì dùng %cannib của kế hoạch và ghi **≈**. Không có kế hoạch
lẫn phép đo tin cậy ⇒ `CHƯA ĐO ĐƯỢC` (không hiện số lift cửa hàng thô nữa).

**C. COGS** — một quy tắc cho cả Target và Thực tế
```
COGS Target  = Σ giá vốn BOM món bắt buộc + (phần còn lại × base_cogs_pct[brand])          (M7.1, đã khoá)
COGS Thực tế = COGS% × giá MENU của hoá đơn tăng thêm = COGS% × (DT CTKM + Giảm giá) × (1 − c) ÷ 1,08     ≈
base_cogs_pct: NCB 32% · NDC 33% · NJFB 35% · ALL 33% (Kế toán khoá — data_contract $preeval)
```
COGS tính trên giá menu (giảm giá không làm giá vốn rẻ đi). POS không có giá vốn theo hoá đơn và BOM mới phủ ~45% doanh thu
món ⇒ COGS thực tế **luôn ghi `≈`**.

**E. EBITDA tăng thêm** — công thức M7.1, dùng cho cả Target và Thực tế
```
DT thuần tăng thêm  = Tăng thêm ÷ 1,08
Lãi gộp tăng thêm   = DT thuần tăng thêm − COGS
EBITDA tăng thêm    = Lãi gộp − Quà tặng − Chi phí CT (ads + KOL + POSM + khác) − Opex
Opex                = % opex theo brand (ty_le_chi_phi) × DT thuần tăng thêm (nếu > 0)
ROI                 = EBITDA tăng thêm ÷ (Giảm giá & phiếu + Quà tặng + Chi phí CT)
```
> ⚠ **Giảm giá không trừ lần hai.** Tăng thêm đo trên Tổng tiền (đã sau giảm giá) nên giảm giá **đã nằm trong doanh thu**
> (và phần cho khách vốn sẽ đến đã bị trừ ở `− c × Giảm giá`). Nó xuất hiện ở bảng như dòng *ghi nhớ* và ở **mẫu số ROI**.

**CT tặng quà (`GIFT_ITEM` · `MERCH_GIFT` · kế hoạch Q3 loại GIFT).** POS ghi món tặng là **dòng giảm 100%**: khoản này là
*giá menu* món tặng, không phải giảm giá. Chi phí thật là **giá vốn quà** (dòng Quà tặng). Engine đặt Giảm giá = 0 cho loại này
và ghi chú giá menu quà vào cờ của bảng — tính cả hai là tính hai lần.

**Phiếu GG.** Với CT voucher (`CASH_VOUCHER` · `NEXT_VISIT` · kế hoạch V#) giá trị phiếu đã dùng được cộng vào Giảm giá & phiếu.

**Đối tác bù giảm giá (`cost_owner` = SPLIT/PARTNER).** DT NOIRE thực nhận = DT + phần đối tác bù; chỉ phần `noire_share`
của giảm giá là chi phí của NOIRE.

**Kế hoạch Q3 (file S16) → mẫu M7.1** (`promo_eval.q3_lock`)
| Mẫu M7.1 | Lấy từ Q3 |
|---|---|
| `bills` | `est_tc` |
| `cannib` | Nền ÷ Target (Voucher: 1 − % incremental thật) |
| Giảm giá | `promo_cost` nếu loại DISCOUNT · COMBO · VOUCHER |
| Quà tặng | `promo_cost` nếu loại GIFT (đơn giá quà × TC) **+** `fixed_cost` *(MERCH thuộc Quà tặng)* |
| Tăng thêm ex-VAT | (Target − Nền) ÷ 1,08 − Giảm giá |
| COGS | `cogs_pct` × (Target − Nền) ÷ 1,08 |
| Opex | tỷ lệ brand của M7.1 · EBITDA **tính lại** bằng công thức trên (không lấy `net_contrib` của file Q3) |
| Guest · Ads · KOL · POSM | không có target — hiển thị `—` |
| Khoá | `submitted` = ngày sửa file S16 (lập trước kỳ chạy) |

**Chi phí — phân loại cố định** (`campaign_cost.cost_type`)
| Dòng hiển thị | `cost_type` | Nguồn Thực tế |
|---|---|---|
| Giảm giá & phiếu *(ghi nhớ)* | `DISCOUNT` · `VOUCHER` | POS, tự động |
| Quà tặng | `GIFT_COGS` + `MERCH` | khai tay; trống → đơn giá KH × TC thực (ghi `≈`) |
| Chi phí ads | `ADS` | Meta tự động + khai tay |
| Chi phí KOL | `KOL` | khai tay |
| Chi phí POSM | `PRINT` | khai tay |
| Chi phí khác | `AGENCY` · `PARTNER_SHARE` (số âm nếu đối tác bù) | khai tay |

## 4. Bảng gộp M7.2 — khung chuẩn

> **Rút gọn 30/09/2026:** bỏ cột *Nền* (chỉ là Target × %cannib, không có đối ứng ở Thực tế) và dòng *DT thuần tăng thêm* (= Tăng thêm ÷ 1,08, vẫn tính nhưng ẩn `hide`);
> *Quà tặng* chuyển sang khối Chi phí; dòng chi phí trống ẩn đi; **% đạt chỉ hiện cho số ĐO** (dòng `≈` không hiện vì chỉ lặp lại DT thực ÷ DT target);
> chân bảng còn 2 dòng, cờ chi tiết nằm trong "Ghi chú". Bảng đặt ngay dưới ô vàng cảnh báo ở "Chi tiết" M7.2. Phần dưới là khung gốc (khối II gồm cả Quà tặng — đã chuyển).

Cột: **Chỉ số · Nền · Target · Thực tế · % đạt**. Thay hai khối "Chấm theo kế hoạch" và "Kiểm chứng cấp cửa hàng".

| Khối | Dòng |
|---|---|
| **I · Bán hàng** | DT CTKM · TC · Guest · AOV · TA · **Tăng thêm** |
| **II · Lợi nhuận tăng thêm** *(Nền = —)* | DT thuần tăng thêm · **Giá vốn (COGS) ≈** · **Lãi gộp** *(+ %GM)* · Quà tặng |
| **III · Chi phí** *(Target = ngân sách, % = dùng ÷ ngân sách)* | *Giảm giá & phiếu (ghi nhớ — đã trừ trong DT)* · Chi phí ads · Chi phí KOL · Chi phí POSM · Chi phí khác · **Tổng chi phí CT** |
| **IV · Kết quả** | Opex · **EBITDA tăng thêm** · ROI |
| Dòng chân | Kiểm chứng cửa hàng: `HĐ CTKM = x% DT cửa hàng · TC cửa hàng a → b · %cannib thực tế · ĐO / ≈` |

**Vị trí khối Giá vốn — 3 phương án** *(đề xuất A)*
| | Cách làm | Ưu | Nhược |
|---|---|---|---|
| **A** ✅ | Khối II riêng: DT thuần → COGS → Lãi gộp → … → EBITDA | Cộng trừ từng dòng ra EBITDA, khớp bố cục phiếu M7.1 (`gp_incr`, `ebitda`) | Bảng dài thêm 3 dòng |
| B | Chỉ 1 dòng "Lãi gộp tăng thêm", COGS% ghi chân bảng | Gọn | COGS ẩn, khó kiểm; muốn đổi tỷ lệ phải mở footnote |
| C | Bỏ khỏi bảng, chỉ tooltip | Gọn nhất | EBITDA không đối chiếu được bằng mắt |

## 5. Nhãn trạng thái *(không đổi tên, đổi điều kiện)*

`ĐẠT` = % đạt **Tăng thêm** ≥ 100% **và** EBITDA thực > 0 · `ĐẠT DOANH THU · LỖ` = Tăng thêm ≥ 100% nhưng EBITDA ≤ 0 · `GẦN ĐẠT` 80–99% · `KHÔNG ĐẠT` < 80% khi đã chốt · `CHƯA CHÍN` (BURST đang chạy / lặp < 2 lần) · `CHƯA ĐO ĐƯỢC` · `CHƯA CÓ TARGET` (không có kế hoạch, hoặc nộp SAU ngày chạy).
Target Tăng thêm ≤ 0 (kế hoạch tự biết lỗ): không tính %, nhãn theo Thực tế ≥ Target và dấu EBITDA.

**Nhãn có `≈`:** khi %cannib lấy theo kế hoạch (cờ `basis = UOC`) nhãn vẫn hiện nhưng **chỉ là số tạm theo khối lượng so kế hoạch**, không phải bằng chứng tăng thêm; bảng, cột Tăng thêm, KPI và ma trận đều gắn `≈`, và dòng đó **không được dùng hiệu chỉnh** M7.1 (`pre_calib.usable = 0`).

## 6. Chạy/sửa lấy chung một dữ liệu — cách thực hiện

```
data_contract.json → $metrics          (mã · tên · viết tắt · đơn vị · công thức dạng chữ)              ← MỘT nguồn tên
tools/preeval.py   → pre_eval / 05_plan_lock          (Target M7.1, đã khoá; ghi guests · cogs · gift · ads · kol · posm · other · disc)
tools/promo_eval.py→ evaluate()                       (Nền · Target · Thực tế · % đạt · nhãn — MỘT hàm cho M7.1 và M7.2)  ← MỘT nơi tính
tools/campaign.py  → campaign_result.u (JSON)         (gọi promo_eval, ghi bảng chuẩn + cổng QA G1–G3)
src/components/common/PromoScoreTable.tsx             (chỉ hiển thị; dùng ở M7.2 "Chi tiết" và M7.1 mục F)
```
Quy trình khi thêm/sửa một chỉ số: (1) sửa `$metrics` → (2) sửa engine → (3) `CAP_NHAT.bat` → (4) màn hình tự theo. **Không sửa số ở `.tsx`.**

**Cổng QA đề xuất** (`docs/40_QA_GATES.md`): với mỗi CT đã chấm — (a) `Lãi gộp − Quà − Chi phí CT − Opex = EBITDA` khớp đến 1 đồng; (b) `Tăng thêm` trong bảng = `Tăng thêm` trong scorecard = `Tăng thêm` trong `pre_calib`; (c) `DT CTKM` M7 = M7.2 = M7.1 cột Thực tế; (d) không dòng chi phí nào hiện `0` khi chưa khai.

## 7. Lệch đã xử lý (30/09/2026)

| # | Trước | Nay |
|---|---|---|
| 1 | Tăng thêm PROGRAM = `sales × (T−N)/T` ⇒ % đạt Tăng thêm ≡ % đạt Doanh thu | §3-N3 — `DT × (1−c) − c × Giảm giá`, %cannib đo hoặc ≈ |
| 2 | "Doanh thu CTKM" hiện 10,14 tr (trước giảm giá) cạnh 9,55 tr (Tổng tiền) | Chỉ Tổng tiền |
| 3 | 3 công thức lãi: `(1−COGS KH)/1,08` · `cm 65%` · M7.1 có opex + quà | §3-E một công thức, `tools/promo_eval.py` |
| 4 | Thẻ "Lãi thực thêm" ≠ "EBITDA tăng thêm" | Một thẻ: EBITDA tăng thêm |
| 5 | Dòng chi phí chưa khai không hiện, tổng trông đầy đủ | `chưa khai` (≠ 0) + cờ EBITDA tạm dùng số kế hoạch |
| 6 | "Kỳ vọng" (cửa hàng) và "Nền KH" cùng nghĩa, hai tên | "Nền" |
| 7 | Sổ khoá M7.1 thiếu guest/COGS/quà/chi phí tách loại | `pre_plan_lock` thêm 10 cột; khoá cũ được **suy** từ số đã khoá bằng hằng đẳng thức (cờ `backfill`) |
| 8 | CT Q3 chấm bằng nhánh `program_eval` riêng | Đã xoá nhánh; Q3 → `q3_lock` → cùng `evaluate()` |
| 9 | Món tặng bị tính hai lần (giảm 100% trên POS + giá vốn quà) | Loại quà: Giảm giá = 0, chi phí = giá vốn quà |
| 10 | Chi phí giảm giá cho khách vốn sẽ đến bị mất khỏi EBITDA | Số hạng `− c × Giảm giá` |
| 11 | ROI thực tế chia giảm giá cho 1,08 (POS đã ở mức giá menu) | Giảm giá POS × hệ số thuế/phí ÷ 1,08 như bộ tính kế hoạch |
| 12 *(01/10)* | M7.1 cộng lại tổng nhóm ở mọi dòng tên POS: V1 hiện 149,2 tr / 333 HĐ (×3), G8 ×2 | `plan_rows` cộng số POS **riêng** từng tên (`campaign_month`) — V1 49,7 tr / 111 HĐ = M7.2 |
| 13 *(01/10)* | Ô `nature` khai tay ở Campaign_Tracking thắng luật M7 — 11 CT SonKim/Cư dân/IFC là "Đối tác" ở M7.2 nhưng "Thương mại" ở M7 (T9: 406,6 tr) | Có tên POS ⇒ `classify_nature` (luật `$promo_nature`) thắng; khai lệch ghi `campaign_issue` field `nature` |
| 14 *(01/10)* | Bản khoá M7.1 `KHOA_MUON` (khoá sau ngày chạy) thắng kế hoạch Q3 nộp trước — G1 chấm theo 13 HĐ thay vì 24 HĐ | Khoá muộn + có `pre_id` Q3 ⇒ chấm theo Q3 (§5); bản M7.1 vẫn hiện ở `pre_calib`, chỉ tham khảo |
| 15 *(01/10)* | Tên CTKM mới trên POS không vào danh mục nếu không ai chạy `campaign_seed --merge` (T9: 8 tên · 91,2 tr) | `update.py` tự chạy `--merge` khi có tháng POS mới; `--merge` điền tên POS vào dòng kế hoạch đang chờ khi `PRE_MATCH` khớp (G4 · G5 · D2) |

**Ảnh hưởng lên 6 chương trình đã chấm** *(trước → sau; `≈` = %cannib theo kế hoạch)*

| Kế hoạch | Chương trình | Nhãn | % đạt Tăng thêm | Tăng thêm (tr) | EBITDA (tr) |
|---|---|---|---|---|---|
| G1 · Monday Treat | NDC-2026-08-DININGMONDAY | CHƯA CHÍN → CHƯA CHÍN | 33% → 83% | 0,84 → 4,50 | 0,41 → 2,36 ≈ |
| G3 · Birthday Decoration | NDC-2026-08-TANGQUASINH | CHƯA CHÍN → CHƯA CHÍN | 256% → 235% | 5,89 → 5,42 | −0,09 → 2,33 ≈ |
| G7 · Complimentary | NJFB-2026-08-COMPLIMEMTARY | ĐẠT DT·LỖ → **ĐẠT** | 467% → 407% | 6,33 → 5,52 | −4,10 → 0,43 ≈ |
| G8 · Obon Table | NJFB-2026-08-OBONTABLE | KHÔNG ĐẠT → KHÔNG ĐẠT | 15% → 14% | 1,32 → 1,25 | 0,13 → 0,51 ≈ |
| V1 · Noire Passport | NCB-2026-07-PASSPORT* | CHƯA CHÍN → CHƯA CHÍN | 37% → 86% | 21,20 → 11,72 | 4,44 → 3,97 ≈ |
| M7.1 · LTO Summer Crush | ALL-2026-06-LTOSUMMERCRUSH | KHÔNG ĐẠT → **ĐẠT** ≈ | −60% → 171% | −56,09 → 158,77 | −93,13 → 51,19 ≈ |

Ba chương trình 8/3 (`NDC-2026-03-0803*`) và `NJFB-2026-08-10OFFCREST` chuyển `CHUA_TARGET`/`CHUA_CHIN` → `CHƯA ĐO ĐƯỢC`: trước đây cả ba CT 8/3
cùng hiện "tăng thêm 9,09 tr" (một số lift cửa hàng bị đếm cho 3 CT chạy chồng kỳ); nay bị loại vì không có kế hoạch để ước tính %cannib.

> **LTO Summer Crush cần đọc kỹ.** Phép đo cửa hàng cho lift **−56,1 tr** nhưng bị loại (chạy chồng kỳ) ⇒ bảng dùng %cannib kế hoạch 60% ⇒
> +158,8 tr. Đây là nhãn `≈`: nó nói *khối lượng vượt kế hoạch (777 vs 600 hoá đơn, AOV 511k vs 387k)*, chưa chứng minh tăng thêm thật.
> Muốn chốt thật cần cửa hàng đối chứng hoặc một tuần tắt CT.
