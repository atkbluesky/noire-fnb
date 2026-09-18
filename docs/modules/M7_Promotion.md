# M7 · PROMOTION — TỔNG QUAN & 5 BẢN CHẤT CHI PHÍ ƯU ĐÃI

| | |
|---|---|
| **Câu hỏi** | Bán bằng cách nào, tốn bao nhiêu? |
| **`activeView`** | `m7` *(mục mẹ — con: `m71` Pre-Analytics · `m72` Promotion Tracking)* |
| **View** | `src/views/PromotionView.tsx` |
| **ETL** | `tools/build_month.py` — `read_pos()` *(nature · fact_promo_day · fact_partner)* · `read_promotion()` *(aggregator — chỉ Dining City + đối soát)* |
| **Nguồn** | `monthly/YYYY-MM.xlsx`: `nature` · `fact_promo_day` · `fact_partner` · `aggregator` · `02_snapshot.xlsx`: `campaigns` |
| **Giai đoạn** | P4 — ✅ xong phần phân loại |
| **Trạng thái** | ✅ đủ số · ✅ **Đối tác = Aggregator + Partner** (18/09/2026, chung số với M9) · ✅ **chi phí ưu đãi đã sửa** · ⛔ chưa đo được Lift → **M7.2** |

> **Đo Lift, ROI, target-vs-actual nằm ở [M7.2 · Promotion Tracking](M7_2_Promotion_Tracking.md).**
> M7 trả lời *“tiền ưu đãi chảy vào đâu”* — kế toán. M7.2 trả lời *“chương trình tạo thêm
> được bao nhiêu”* — marketing. Hai câu hỏi, hai đơn vị phân tích, hai màn hình.

---

## 0. Cụm M7 PROMOTION — một danh mục, ba màn *(từ 17/09/2026)*

Promotion là **mục mẹ**; Pre-Analytics và Promotion Tracking là **hai mục con**. Cả ba cùng đọc
MỘT danh mục chương trình, nên một chương trình chỉ có một mã, một tên, một bộ số.

```
 KẾ HOẠCH (S16)                       THỰC TẾ (S02 · POS hoá đơn)             BÁO CÁO (S17)
 05_Promotion_Ke_Hoach/               01_DOANH_THU/03_POS_Hoa_Don/            06_Promotion_Ket_Qua/
 NOIRE_Promotion_Pre-Analysis_*.xlsx  accounting_sale T*.xlsx → Tên CTKM      Bao_Cao_Hieu_Qua_LTO_*.xlsx
        │ tools/pre_analysis.py              │ build_month → fact_promo_day          │
        │ (bộ đọc DUY NHẤT)                  │                                       │
        └────────────── pre_id ──────┐  ┌── name_pos ─────────────────┘  ┌── kỳ · cửa hàng · chi phí ──┘
                                     ▼  ▼                                ▼
                 DANH MỤC CHƯƠNG TRÌNH  —  07_Campaign_Tracking/Campaign_Tracking_2026.xlsx (S23)
                 dựng sẵn: python tools/campaign_seed.py  ·  tháng sau: --merge (chỉ thêm dòng mới)
                                     │ tools/campaign.py
                                     ▼
                 data_input/03_campaign.xlsx: campaign_result · pre_plan · campaign_daily · …
                                     │ scripts/build-data.mjs
                                     ▼
                 src/data/campaign.json ──► M7 (tra tên POS → chương trình) · M7.1 (plan) · M7.2 (chấm)
```

| Màn | `activeView` | Trả lời | Đọc |
|---|---|---|---|
| **M7 · Promotion** | `m7` | Chi phí ưu đãi đi đâu (5 bản chất) · CTKM nào thuộc chương trình nào | `nature` · `campaigns` + `CAMPAIGN.pos_map` |
| └ **M7.1 · Pre-Analytics · Plan** | `m71` | Trước khi chạy: có lãi không · Sau khi chạy: có đúng dự báo không | `CAMPAIGN.plan` |
| └ **M7.2 · Promotion Tracking** | `m72` | Từng chương trình tạo thêm bao nhiêu, tốn bao nhiêu, đạt không | `CAMPAIGN.campaigns` |

### Nguồn dữ liệu promotion *(trả lời: lấy ở đâu)*

| Dữ liệu | File gốc | Cột / sheet |
|---|---|---|
| **Tên CTKM · hoá đơn · doanh thu · giảm giá · phiếu GG** | `L0_input/01_DOANH_THU/03_POS_Hoa_Don/accounting_sale T*.xlsx` — sheet `Tất cả cửa hàng` | `Tên CTKM` · `Thanh toán trước giảm giá` · `Giảm giá` · `Chiết khấu` · `Phiếu GG` · `Tổng tiền` |
| Doanh thu cả cửa hàng theo ngày (kỳ nền) | `01_DOANH_THU/01_Doanh_Thu_Ngay` → Tracking Sales | `daily` |
| Kế hoạch · target · chi phí kế hoạch | `03_MARKETING/05_Promotion_Ke_Hoach/NOIRE_Promotion_Pre-Analysis_*.xlsx` | 6 sheet loại |
| Báo cáo hiệu quả LTO | `03_MARKETING/06_Promotion_Ket_Qua/` | kỳ · cửa hàng · chi phí |
| Nội dung · giả thuyết · mục tiêu · phương án · người phụ trách | `03_MARKETING/07_Campaign_Tracking/Campaign_Tracking_2026.xlsx` | sheet `dim_campaign` — **nhập tay** |

Đối soát 17/09/2026: NDC tháng 8 trên file hoá đơn gốc chỉ có một CTKM review là `BERKLEY - GOOGLE REVIEW`
(68 hoá đơn, The Berkley) — khớp 100% với `fact_promo_day`. NDC_NTMK không có CTKM Google Review trong T8.

### Định nghĩa doanh thu & tăng thêm *(sửa 17/09/2026)*

Cột tiền trên hoá đơn iPOS (đối chiếu từng dòng file gốc):

```
Tổng tiền = Thanh toán trước giảm giá − Giảm giá − Chiết khấu + Phí dịch vụ + Thuế
Phiếu GG  = phần khách THANH TOÁN bằng phiếu — NẰM TRONG Tổng tiền, KHÔNG phải khoản giảm thêm
```

Bảng chấm điểm M7.2 — thứ tự cột theo **SALES = TC × AOV**: quy mô → cấu thành → hiệu quả → lợi nhuận.
Mỗi ô hai tầng: **trên = số tuyệt đối · dưới = % so với CẢ cửa hàng cùng kỳ**.

| Cột | Trên | Dưới |
|---|---|---|
| Phân loại | bản chất (ai trả tiền) | Mục tiêu · Phương án — chỉ hiện khi đã khai |
| **Doanh thu CTKM** | Σ `Tổng tiền` CẢ hoá đơn có chương trình (gồm món khác gọi kèm, gồm VAT) | % doanh thu cửa hàng |
| **Hoá đơn** | số hoá đơn của chương trình | % hoá đơn cửa hàng |
| **AOV** | Doanh thu CTKM ÷ hoá đơn | ± % so AOV cửa hàng |
| **DT tăng thêm** | có kế hoạch: DT trước ưu đãi × (Target − Nền) ÷ Target · chưa kế hoạch: lift cả cửa hàng (chỉ khi CTKM ≥ 5% DT, ≥ 20 HĐ, \|lift\| ≤ DT CTKM) | ± % = tăng thêm ÷ (DT cửa hàng − tăng thêm) |
| Lãi thực thêm · ROI | tăng thêm × biên LN − chi phí | ROI |

**Hoá đơn "có chương trình" lấy theo 2 cách:**
- Chương trình thường → hoá đơn gắn **tên CTKM** (`fact_promo_day`).
- Chương trình **LTO chạy theo món** → hoá đơn **chứa món** đã nối ở sheet **`campaign_item`** của Campaign_Tracking_2026.xlsx
  (`fact_lto_line`: mọi dòng món có Nhóm món chứa "LTO", gắn Tổng tiền của cả hoá đơn). Tra mã món ở sheet `DS_MON_LTO`.
  Đối soát LTO Summer Crush với báo cáo S17: **777 hoá đơn · 1.138 ly · 101.282.000 đ doanh thu ly** — khớp tuyệt đối;
  Doanh thu CTKM (cả hoá đơn, gồm VAT) = 396,9 tr.

Cột "Chi phí" bỏ khỏi bảng (còn ở thẻ KPI và khối Chi tiết).

**Cả 3 màn dùng CÙNG định nghĩa "Doanh thu CTKM" (Tổng tiền cả hoá đơn):**
- M7 · bảng Top 25: đọc `promo_month` (loader gộp `fact_promo_day` theo tháng × tên × brand) — lọc được theo tháng,
  dòng dưới là % so với cả cửa hàng của brand trong tháng đang lọc. Bỏ nguồn cũ `campaigns` (doanh thu chạm theo
  THÀNH TIỀN dòng món, không lọc tháng — lệch với M7.2).
- M7.1 · cột Thực tế: `act_promo_net` = Σ Tổng tiền các hoá đơn của chương trình (mọi tên POS cùng pre_id).
- M7.2 · hàng KPI xếp đúng thứ tự cột bảng: Doanh thu CTKM → Hoá đơn → AOV → DT tăng thêm → Lãi thực thêm → Đạt target.

Lỗi cũ: cột "Doanh thu" của chương trình chưa có kế hoạch hiện doanh thu CẢ các cửa hàng trong kỳ chạy
(`CASH VOUCHER 100K - HIGHGATE 30/04/2026`: 4 hoá đơn · 886 nghìn, màn hình hiện 11,77 tỷ và "tăng thêm +818,8 tr").

### Một nền số cho cả cụm M7 *(sửa 17/09/2026)*

| Màn | Trước | Nay |
|---|---|---|
| M7 thẻ bản chất · cột chồng · donut | sheet `nature`: **Thành tiền dòng món** (trước VAT/phí) — NJFB T8 Thương mại 109,9 tr / 86 HĐ | `fact_promo_day`: **Tổng tiền cả hoá đơn** — 149,7 tr / 84 HĐ; dòng dưới = % DT brand kỳ lọc |
| M7.2 KPI + bảng | cộng cả kỳ chạy, cả cửa hàng brand khác — NJFB T8 4,09 tỷ | `campaign_month` cắt tháng × cửa hàng — 269,0 tr = 18,0% DT brand |

Kiểm tra chéo NJFB T8: M7 (bỏ nội bộ) 149,7 + 70,6 + 40,1 + 8,7 = **269,0 tr** = M7.2 = POS. Sheet `nature` chỉ còn dự phòng cho tháng
chưa có bảng kê hoá đơn (`basis = ITEM`, không so được với `BILL`). Chi tiết quy tắc phạm vi: M7_2 §⓪.

### Danh mục chương trình *(dựng lại 17/09/2026 — MỖI TÊN CTKM MỘT DÒNG)*

| | Số dòng |
|---|---:|
| Kế hoạch Pre-Analysis | 25 kế hoạch |
| └ đã khớp tên trên POS | 5 kế hoạch = **8 dòng**: G1 · G3 *(chỉ Bánh Millie Crepe)* · G7 · G8 *(2 tên)* · V1 *(3 mức 50K/100K/150K)* |
| └ chưa chạy | 20 |
| Tên CTKM trên POS chưa có kế hoạch | 125 |
| **Tổng** | **153** — không gom tên gần giống, không ghép đoán (D3 Pre-booking 15% ≠ BERKLEY - PRE-BOOKING OFFER) |

Nhiều dòng cùng `pre_id` = các tên POS của MỘT kế hoạch → engine cộng lại chấm MỘT lần; chỉ dòng đầu
(`plan_primary = 1`) được cộng vào tổng.

### Phân loại chương trình — Mục tiêu → Phương án *(thay cho "Nhịp")*

| Mục tiêu (`objective`) | Phương án (`lever_primary`) — TC_AOV_FnB_Marketing.pdf |
|---|---|
| **TC** — tăng số lượt khách | Customer Base · Frequently · Party Size · Secondary Order · Sales Channel · Day-part Sales |
| **AOV** — tăng chi tiêu mỗi bill | Menu Item Sold · Menu Item Value · Pricing |
| **BRANDING** | Awareness · Engagement · Review — không chấm bằng doanh thu (nhãn `BRANDING`) |

Nhịp chạy (một đợt / lặp theo thứ / liên tục) **không còn là cột khai tay**: engine suy từ các ngày có
hoá đơn trên POS (≥ 80% rơi vào một thứ → lặp theo thứ; ≥ 120 ngày → liên tục) và chỉ dùng để chọn
cách đo lift cửa hàng.

Cột nhập tay mới nằm ngay sau tên: **`content`** (nội dung chương trình) · **`hypothesis`** (giả thuyết) —
cả hai hiện ở khối *Chi tiết* trên M7.2.

### Hai cách chấm — ghi ở `campaign_result.eval_scope`

| | `PROGRAM` — có `pre_id` | `STORE` — chưa có kế hoạch |
|---|---|---|
| Phạm vi | các **hoá đơn gắn CTKM** | **cả cửa hàng** trong kỳ chạy |
| Thực tế | net + giảm giá + phiếu GG *(trước ưu đãi, gồm VAT — cùng nền "Sales gross" của kế hoạch)* | net cửa hàng |
| So với | Nền / Target của Pre-Analysis | kỳ nền 28 ngày cùng thứ × hệ số mùa vụ |
| Chi phí KM | DISCOUNT · COMBO · VOUCHER: giảm giá POS · GIFT: đơn giá quà KH × số hoá đơn thực · LTO: 0 | giảm giá + phiếu GG POS |
| Đóng góp ròng | Tăng thêm ÷ 1,08 × (1 − COGS%) − chi phí *(đúng công thức file kế hoạch)* | Tăng thêm × biên LN − chi phí |
| Kiểm chứng | lift cửa hàng vẫn hiện; hoá đơn CTKM < 5% doanh thu cửa hàng thì ghi rõ **không đọc được** | — |

**Vì sao phải có `PROGRAM`:** Pre-Analysis đặt target cho phần doanh thu của chương trình (Tataki Wagyu:
nền 9 tr, target 10,4 tr, 3 lượt). Đem so với doanh thu cả cửa hàng (1,35 tỷ) ra tỉ lệ đạt −61 lần — vô nghĩa.

---

## 1. Chuỗi trace

```
S01 item (dòng món) → "Tên CTKM" → classify_nature() → rev · bills   ─┐
S02 bill (hoá đơn)  → "Tên CTKM" → disc · voucher · guests · net     ─┤
                                                                      ├→ nature[]
   gộp ngày × store × tên CTKM → fact_promo_day[]  ← nền của M7.2     ─┘
   gộp tên CTKM × nature × brand → campaigns[] (top 80 theo doanh thu)
      → PromotionView
```

**Hai lane đo hai thứ khác nhau và không được cộng chung.** Doanh thu chạm lấy ở cấp
dòng món theo `Thành tiền`; chi phí ưu đãi lấy ở cấp hoá đơn. Trộn base là ra số vô nghĩa.

Chiều `brand` được thêm vào cả hai bảng ở tầng ETL để **bộ lọc brand hoạt động thật**, không chỉ hiện nút.

## 2. Phát hiện gốc — bốn bản chất không được gộp

48 CTKM trong một tháng, phủ 34,3% doanh thu. Nhưng chúng **không cùng bản chất**:

| Bản chất | Ví dụ thật trong data | Doanh thu T1 | Vào ROI marketing? |
|---|---|---|---|
| **INTERNAL** — nội bộ | CHAIRMAN AND FAMILY 30% · DIRECTORS AND MANAGERS 25% | **483,9tr** | ❌ **không** — đây là khoản mục P&L |
| **PARTNER** — đối tác = Aggregator + Partner | Shinhan · Techcombank × OneU · Grab Dine Out *(KHÔNG gồm SKG Members / RESIDENTS OFFERS — xem ghi chú dưới)* | ~25tr | tách riêng, ghi rõ phần NOIRE trả — xem M9 |
| **LOYALTY** — hạng thành viên | Hạng Black Diamond · Hạng Silver · Giảm 15% Thẻ VIP | ~82tr | ✅ nhưng tính ở M7 |
| **COMMERCIAL** — marketing thật | HAPPY TUESDAY · NOIRE THURSDAY DELIGHT | ~195tr | ✅ **chỉ nhóm này** |

**483,9tr chiết khấu nội bộ = 12,3% doanh thu tháng.**
Gộp chung vào “hiệu quả khuyến mãi” thì mọi con số ROI marketing đều sai nghiêm trọng —
và sai theo hướng **làm marketing trông tệ hơn thực tế**.

T7/2026: chi phí ưu đãi 221,8tr, trong đó **INTERNAL 166,4tr = 75%** chỉ cho **202 hoá đơn**.

## 3. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| **Doanh thu gắn CTKM theo tháng & bản chất** | cột chồng 4 nhãn |
| **Tỷ trọng 4 bản chất** | |
| **Top 25 chương trình khuyến mãi theo doanh thu chạm** | |

**Màu theo ngữ nghĩa:** `COMMERCIAL` xanh · `INTERNAL` đỏ · `PARTNER` vàng · `LOYALTY` ô liu —
nhìn màu là biết nhóm nào tính vào hiệu quả marketing.

> ⚠️ Chú ý cách gọi: **“doanh thu chạm”** — tức doanh thu của các dòng món có gắn tên CTKM.
> Đây **không phải** doanh thu do CTKM tạo ra. Muốn biết phần tạo ra thật thì phải đo Lift (mục 5).

## 4. Bộ lọc

Brand · Từ · Đến. Bộ lọc brand áp cho **cả bốn bản chất** — chiều brand đã có sẵn trong ETL.

## 5. ⛔ Đang thiếu gì — đo Lift

Module hiện trả lời được *“chương trình nào chạm nhiều doanh thu nhất”*
nhưng **chưa trả lời được *“chương trình nào tạo thêm doanh thu”***.

Để đo Lift cần:

| Thành phần | Công thức | Trạng thái |
|---|---|---|
| **CTKM theo ngày × store** | `fact_promo_day` | ✅ **đã dựng** |
| **Chi phí ưu đãi thật** | `Giảm giá + Chiết khấu + Phiếu GG` cấp hoá đơn | ✅ **đã sửa** *(xem §7)* |
| **Kỳ nền (baseline)** | TB 4 tuần liền trước, **cùng thứ trong tuần**, cùng cửa hàng | dữ liệu đã đủ (`daily`) |
| **Lift %** | `(Net kỳ chạy − Net kỳ nền) ÷ Net kỳ nền` | chưa dựng |
| **Store đối chứng** | cửa hàng không chạy campaign, cùng kỳ | chưa dựng |
| **ROI Promotion** | `(Net tăng thêm − chi phí ưu đãi − chi phí ads) ÷ tổng chi phí` | chưa dựng |
| **`dim_campaign`** | ngày bắt đầu/kết thúc, phạm vi cửa hàng, ngân sách | ⛔ **chưa có bảng này** |

**Quy tắc chống thổi phồng:** Lift luôn phải so **cùng cửa hàng**, không so chain.
Và phải kiểm tra **store đối chứng** trong cùng kỳ — nếu store đối chứng cũng tăng tương đương
thì lift là do mùa vụ, không phải do campaign.
**Không có bước này, mọi báo cáo ROI đều là tự huyễn hoặc.**

**Rào chắn độ chín 14 ngày:** chương trình chạy dưới 14 ngày không được gắn nhãn KHÔNG ĐẠT.

## 6. Checklist nâng cấp

- [ ] **Dựng `dim_campaign`** — campaign_id · type · brand · store_scope · date_from · date_to · budget · kpi_target · **nature**
      *(một campaign chỉ được một `type`; nếu vừa đẩy promotion vừa thu lead thì tách thành 2 dòng với ngân sách chia rõ)*
- [ ] **Dựng mô hình Lift** + store đối chứng → mở khoá ROI Promotion
- [ ] **Timeline campaign trên nền đường doanh thu** — nhìn ra ngay chương trình nào trùng kỳ
- [ ] **Bảng pre/during/post** cho mỗi campaign
- [ ] Tách rõ **chi phí ưu đãi** (đang có ở `nature.disc`) khỏi **doanh thu chạm** trên màn hình
- [ ] Ghép chi tiêu Ads từ M5 để tính ROI đầy đủ
- [ ] Ghi kết quả lift thật vào **`lib_benchmark`** để nuôi M6 *(vòng lặp đóng của hệ thống)*

---

## 7. Chi phí ưu đãi — lỗi đã sửa (T9/2026)

Cột `nature.disc` trước đây lấy `Giảm giá` ở **cấp dòng món**. iPOS ghi chiết khấu
**một lần trên hoá đơn**, không rải xuống từng món — nên cột đó gần như luôn rỗng.
Cả năm 2026 chỉ nhận được 90,8 tr chiết khấu trên 10 tỷ doanh thu chạm: **0,9%**,
trong khi chương trình thật giảm 10–50%.

Nguyên nhân cụ thể hơn: export iPOS tách chiết khấu ra **ba cột riêng** và lane cũ
chỉ đọc một cột — đúng cột nhỏ nhất.

| Cột trong bảng kê hoá đơn | T1/2026 | T4/2026 | T7/2026 | Lane cũ đọc? |
|---|---:|---:|---:|:-:|
| `Giảm giá` *(số tiền cố định)* | 8,2 tr | 13,4 tr | 18,5 tr | ✅ |
| `Chiết khấu` *(theo %)* | 360,9 tr | 372,4 tr | 318,5 tr | ❌ **bỏ sót** |
| `Phiếu GG` *(voucher)* | 184,1 tr | 103,4 tr | 34,3 tr | ❌ **bỏ sót** |

**Giảm giá ≠ phiếu giảm giá — và đây là cách tự kiểm tra số.** Voucher là **phương thức
thanh toán**, không phải giảm giá, nên nó **không** nằm trong `store_month.disc`
(`gross − net` của Tracking Sales). Vì vậy chỉ có `disc` mới so được với `store_month.disc`.
Tách riêng ra thì phép so khớp ngay:

| | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fact.disc` ÷ `store_month.disc` | 97% | 92% | 97% | 96% | 92% | 89% | 92% | 94% |

Dưới 100% mọi tháng — đúng như phải thế, vì vẫn có ít chiết khấu rơi vào hoá đơn không
gắn CTKM. Gộp voucher vào cùng một cột thì tỷ lệ này vọt lên 123–150%, tức lớn hơn tổng
chiết khấu toàn chuỗi — dấu hiệu rõ ràng là đã cộng nhầm hai loại chi phí.

`nature.disc` = `disc + voucher` — **tổng chi phí ưu đãi**, đúng với tên gọi trên màn hình
M7 (voucher đã phát ra là tiền thật đã mất). M7.2 cần tách `DISCOUNT` khỏi `VOUCHER_REDEEM`
thì đọc thẳng `fact_promo_day`.

Cả năm 2026: `disc` **2,73 tỷ** + `voucher` **857 tr** = **3,58 tỷ** chi phí ưu đãi.

**Đối soát độc lập** — sheet *NOIRE JFB - Weekly Report* của team brand, NJFB T4/2026:

| | Lane ETL | Sheet team brand | Lệch |
|---|---:|---:|---:|
| Chi phí ưu đãi | 200.157.242 | 200.568.992 | **0,2%** |
| Doanh thu CTKM | 550.113.081 | 558.460.738 | 1,5% |
| Số hoá đơn | 260 | 267 | 7 bill |

> ⚠️ **Tháng không có bảng kê hoá đơn** thì lane rơi về cột cấp dòng món và in cảnh báo
> *“HỤT khoảng 20–45 lần, đừng dùng để tính ROI”*. Thấy cảnh báo đó thì đừng đọc số chi phí.

---

## Đối tác = Aggregator + Partner *(thống nhất 18/09/2026)*

Bản chất **PARTNER** giờ là **“Đối tác · Aggregator + Partner”** — cùng định nghĩa với M9
([`M9_Partnership.md`](M9_Partnership.md)), cùng một bảng số `partner_fact`:

| Kênh | Đối tác |
|---|---|
| **AGGREGATOR** | Grab Dine Out · GrabFood (giao hàng) · Dining City |
| **PARTNER** | Techcombank × OneU · Shinhan · HDBank · Urbox · Betakee · Visa |

> ⚠️ **SonKim Group và Cư dân & toà nhà KHÔNG phải partnership** *(xác nhận 18/09/2026)* — không có hợp đồng đối
> tác thật, là khuyến mãi NOIRE chủ động chạy. Đã chuyển từ PARTNER sang **COMMERCIAL**, nằm trong nhóm Thương
> mại ở bảng Top chương trình, không còn hiện ở M9.

**Thẻ “Đối tác” ở M7 = hoá đơn gắn CTKM đối tác + hoá đơn nền tảng KHÔNG gắn CTKM** (Grab nhận qua Nguồn / PTTT,
Dining City từ báo cáo team). Dòng phụ của thẻ tách hai kênh; khối **“Đối tác = Aggregator + Partner”** cuối trang
thay cho khối Aggregator cũ (số tự khai ở báo cáo S19) — giờ Grab đo thẳng trên hoá đơn POS.

**Không đếm đôi:** hoá đơn Grab có gắn CTKM không phải đối tác (quà sinh nhật, Monday Treat — T8: 5 HĐ) chỉ nằm ở
“Đối tác”; loader rút khỏi bản chất của CTKM đó.

**Kiểm tra chéo:** QA #17 — phần nhận theo tên CTKM của `fact_partner` = bản chất PARTNER của `fact_promo_day`,
9/9 tháng khớp từng đồng. Thẻ M7 = tổng M9 từng tháng (T8/2026: 183,0 tr, sau khi bỏ SonKim/Cư dân).

> ⚠️ Kiểm tra chéo M7 ↔ M7.2 ở §0 (“M7 bỏ nội bộ = M7.2”) giờ phải **bỏ thêm phần đơn nền tảng không gắn CTKM**
> (`partner_fact.basis ≠ CTKM`), vì M7.2 chấm theo chương trình CTKM.

**Sửa phân loại cùng đợt:** `Giảm 10% Cho Nhân Viên Thuộc Tòa Nhà IFC` (29 HĐ · 6,9 tr) và toàn bộ chương trình
SonKim Group / cư dân — không phải CBNV NOIRE nên không vào INTERNAL, cũng không phải partnership có hợp đồng
thật nên không vào PARTNER — chuyển hết về **COMMERCIAL**, chấm như campaign thương mại thường.
