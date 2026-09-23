# 15 · HỢP ĐỒNG DỮ LIỆU VÀO — CẤU TRÚC BA TẦNG

> **Nguồn sự thật của hợp đồng là [`../data_contract.json`](../data_contract.json)**, không
> phải file này. `scripts/build-data.mjs` (Node) và `tools/*.py` (Python) cùng đọc nó, và
> phần bảng sheet ở §4 dưới đây được **sinh lại** từ nó bằng `python tools/gen_contract_doc.py`.
>
> Cần hướng dẫn thao tác từng bước? → [`16_CAP_NHAT_HANG_THANG.md`](16_CAP_NHAT_HANG_THANG.md)

---

## 1. Hai lane — khác nhau ở đâu

| | Lane THÔ | Lane ĐÃ XỬ LÝ *(lane chính)* |
|---|---|---|
| Đầu vào | export gốc iPOS / Meta / Google / Zalo | Excel đã tổng hợp |
| Thư mục | `05 Data Raw/` · `09 Tracking Sales Tool/` | **`data_input/`** |
| Bộ máy | `tools/build_month.py` (Python) | **`scripts/build-data.mjs` (Node)** |
| Việc chính | gỡ bảy cái bẫy dữ liệu thô | **kiểm tra hợp đồng** + tính chỉ số dẫn xuất |
| Chạy ở đâu | chỉ máy local | **máy local VÀ Vercel** |
| Thời gian | ~1 phút/tháng | **dưới 1 giây** |
| Lên GitHub | không | **có — đây là nguồn sự thật** |

Lane thô là nơi *sinh ra* dữ liệu đã xử lý. Nếu bạn có sẵn file đã tổng hợp từ nơi khác thì
bỏ qua lane thô hoàn toàn — điền tay vào `data_input/monthly/YYYY-MM.xlsx` cũng đúng.

---

## 2. Luồng chạy thật

```
   dữ liệu thô                    data_input/                     dashboard
   ───────────                    ───────────                     ─────────
   05 Data Raw/          python    01_master.xlsx      npm run     src/data/*.json
   09 Tracking Sales  ─────────▶   02_snapshot.xlsx  ──────────▶   (không commit)
                      build_month  monthly/*.xlsx     build:data         │
                                          │                              ▼
                                          │  git push              localhost:3001
                                          ▼                              │
                                    Vercel kéo repo ──▶ npm run build ──▶ deploy
```

**Điểm mấu chốt:** `src/data/*.json` **không nằm trong git** (`.gitignore` đã loại). Chúng
là sản phẩm sinh ra, không phải nguồn. Nguồn sự thật là **Excel trong `data_input/`**.

Hệ quả: không còn cảnh hai bản JSON lệch nhau, và mỗi lần đổi số chỉ cần commit file Excel.

---

## 3. Ba tầng file

```
data_input/
├── 01_master.xlsx      TẦNG A · chiều & kế hoạch (đổi khi có thay đổi)
├── 02_snapshot.xlsx    TẦNG C · bảng luỹ kế toàn kỳ
└── monthly/
    ├── 2026-07.xlsx    TẦNG B · một tháng một file
    └── 2026-08.xlsx
```

**Loader quét ĐỆ QUY mọi `.xlsx` trong `data_input/`** và gộp các sheet cùng tên. Thứ tự đọc
là thứ tự alphabet của **đường dẫn**, nên `01_master` < `02_snapshot` < `monthly/…` — số liệu
tháng luôn đè lên bản khai chung khi trùng khoá.

### Tháng lấy từ tên file

Với file nằm trong `monthly/`, loader đọc `YYYY-MM` từ **tên file** và tự điền vào cột tháng
của mọi dòng bỏ trống. Đây là cơ chế khiến "mỗi tháng chỉ cần thả một file" chạy được: người
nộp không phải gõ lại `2026-09` vào từng dòng của hai chục sheet.

Nếu một dòng CÓ ghi tháng mà lệch với tháng của file, **chốt #14 báo** — copy-paste sót là
cách phổ biến nhất để nhân đôi số của một tháng.

### Khử trùng theo khoá tự nhiên

Mỗi sheet có một **khoá tự nhiên** khai ở hợp đồng. Sau khi đọc hết, loader khử trùng theo
khoá đó, **dòng đọc sau thắng**. Nộp lại một tháng (đặt tên `2026-09_v2.xlsx` để cạnh bản gốc)
là *thay thế* đúng những dòng đó, không phải cộng thêm.

Khoá phải là khoá **thật**. Ví dụ `product` có khoá `ma + name + cat + grp` chứ không phải
`ma`: cùng một mã món xuất hiện ở hai nhóm menu khác nhau là chuyện bình thường, khử trùng
theo `ma` sẽ nuốt mất 94/700 dòng doanh thu.

---

## 4. Sheet và cột

<!-- AUTO:SHEETS -->
### TẦNG A · `01_master.xlsx` — CHIỀU & KẾ HOẠCH

Đổi khi có cửa hàng mới, target quý mới, ngân sách mới, đối tác mới. KHÔNG phải file nộp hằng tháng.

| Sheet | Cột | Khoá tự nhiên | Loader tự tính |
|---|---|---|---|
| `dim_store` | **code** · **brand** · **tier** · **name** · open · aliases · alias_re | code | — |
| `dim_target` | **month** · **store** · **target** | month + store | — |
| `dim_cogs` | _brand_ · **ma** · name · cogs · pct | brand + ma | — |
| `budget_brand` | _brand_ · budget · plan | brand | — |
| `budget_extra` | _name_ · plan | name | — |
| `budget_channel` | _channel_ · _source_ · plan | channel + source | — |
| `budget_store` | _store_ · brand · target · meta · google · zalo · total · pct | store | — |
| `partners` | **code** · **name** · **channel** · kind · brand · stores · start · end · status · noire_share · fee · fee_period · commission_pct · fee_month · fee_unit · fee_unit_amount · sponsor · source · media · owner · note | code | — |
| `partner_program` | **prog** · **code** · name · brand · mech · offer · rate · cap · min_bill · condition · start · end · codes · cid · pos_name · note | prog | — |
| `partner_agg` | **month** · _brand_ · _store_ · **code** · bookings · cancels · guests · bills · net · disc_noire · disc_platform · commission · fee_other · method · note | month + code + brand + store | — |
| `partner_plan` | **month** · **code** · scenario · issued · use_rate · aov · rev · cost · gp · note | month + code | — |
| `partner_voucher` | **cid** · campaign · partner · brand · expire · **kind** · **month** · _store_ · issued · used · locked · gross · disc | cid + kind + month + store | — |
| `pre_analytics` | _name_ · _brand_ · kind · roi · nc | name + brand | — |
| `crm_target` | _month_ · _kpi_ · target | month + kpi | — |
| `system_tools` | _root_ · files · loc · dirs | root | — |
| `system_dashboards` | _path_ · _name_ · kb | path + name | — |
| `system_caches` | _path_ · files · mb | path | — |
| `dim_campaign` | **campaign_id** · **name** · content · hypothesis · objective · lever_primary · lever_secondary · **name_pos** · **brand** · store_scope · nature · mechanic · window · cadence · recur_dow · **date_from** · date_to · discount_rule · cost_owner · noire_share · ads_match · owner · status · pre_id · source · match_note | campaign_id | — |
| `campaign_target` | **campaign_id** · base_method · tgt_net · tgt_tc · tgt_aov · tgt_ta · tgt_incr_net · exp_redeem_rate · exp_disc_per_bill · cm_pct · submitted · note | campaign_id | — |
| `campaign_cost` | **campaign_id** · **cost_type** · planned · actual · note | campaign_id + cost_type | — |
| `campaign_control` | **campaign_id** · **control_store** | campaign_id + control_store | — |
| `campaign_item` | **campaign_id** · _item_code_ · item_name · note | campaign_id + item_code | — |

- **`dim_store`** — Danh mục cửa hàng. tier ∈ flagship|core|satellite|popup · brand ∈ NCB|NDC|NJFB|OTHER. `aliases` = MỌI cách viết tên cửa hàng trong ô 'tên cửa hàng' của file export, ngăn bằng `|` — khớp CHÍNH XÁC hoặc chuỗi con, dùng cho store_code(). `alias_re` = regex nhận cửa hàng từ CHUỖI TỰ DO (tên chiến dịch ads), dùng cho store_in_text(). Cả hai là nguồn DUY NHẤT — không hard-code bản đồ cửa hàng ở bất kỳ file .py nào.
- **`dim_target`** — Target doanh thu theo cửa hàng × tháng. Được phép khai cả tháng tương lai.
- **`dim_cogs`** — Bảng giá vốn theo mã món — nuôi cảnh báo món có giá vốn bất thường.
- **`budget_brand`** — Ngân sách marketing theo brand. Các cột tên YYYY-MM là ngân sách từng tháng.
- **`budget_extra`** — Ngân sách ngoài brand (Chạy Tiệc, CRM…).
- **`budget_channel`** — Ngân sách theo kênh × nguồn túi tiền.
- **`budget_store`** — Phân bổ ngân sách quảng cáo theo cửa hàng.
- **`partners`** — Danh mục đối tác — từ file đối tác L0 S15, sheet 1_PARTNER (channel = PARTNER) và 2_AGGREGATOR (channel = AGGREGATOR). `source` = POS | TU_THONG_KE. `noire_share` = phần ưu đãi NOIRE chịu. `fee` + `fee_period` = phí hợp tác · `commission_pct` = hoa hồng / chiết khấu cho đối tác · `fee_month` = phí cố định tháng · `fee_unit_amount` theo `fee_unit` (booking / khách). Kết quả KHÔNG nằm ở đây — loader tính từ fact_partner + partner_agg.
- **`partner_program`** — Chương trình ưu đãi của đối tác — sheet 3_CHUONG_TRINH: cơ chế, nội dung ưu đãi khách nhận, mức, trần, HĐ tối thiểu, kỳ chạy, số mã phát, Campaign ID iPOS (nối log eVoucher).
- **`partner_agg`** — Số aggregator TỰ THỐNG KÊ theo tháng × brand — file 05_DOI_TAC/03_Aggregator/NOIRE_Aggregator_Theo_Thang.xlsx, sheet AGG_THANG. `net` = Tổng tiền hoá đơn (gồm VAT & phí phục vụ, KHÔNG trừ phí nền tảng). Với nền tảng nguồn POS chỉ lấy `commission` · `fee_other` (phí thực trả).
- **`partner_plan`** — Kế hoạch đối tác theo tháng — file danh mục đối tác, sheet 4_KE_HOACH. Ô trống = chưa đặt kế hoạch (hiện '—'), không phải 0.
- **`partner_voucher`** — Log eVoucher đối tác (L0 S21) theo chiến dịch × tháng. Dòng phát: `issued` theo THÁNG của Ngày phát hành mã (store trống) · dòng dùng: `used` · `gross` (HĐ trước giảm) · `disc` theo THÁNG của Ngày sử dụng × cửa hàng. Không lấy tháng từ tên file. Không chứa số điện thoại khách.
- **`pre_analytics`** — CŨ — không còn dùng. Thay bằng `pre_plan` (03_campaign.xlsx) đọc thẳng file Pre-Analysis S16 qua tools/pre_analysis.py.
- **`crm_target`** — KPI CRM cam kết theo tháng. kpi ∈ member|oa
- **`system_tools`** — Kiểm toán phân mảnh hệ thống — nuôi tab D2.
- **`system_dashboards`** — Danh sách dashboard HTML rời rạc — nuôi tab D2.
- **`system_caches`** — Cache trùng lặp — nuôi tab D2.
- **`dim_campaign`** — M7.2 · danh mục chương trình (MASTER chung của M7 · M7.1 · M7.2). Sinh từ L0_input/03_MARKETING/07_Campaign_Tracking bởi tools/campaign.py — KHÔNG sửa tay ở data_input. `pre_id` nối sang kế hoạch Pre-Analysis (S16).
- **`campaign_target`** — M7.2 · target nộp TRƯỚC khi chạy. `submitted` = ngày nộp; nộp sau date_from thì target bị đánh dấu không kiểm chứng.
- **`campaign_cost`** — M7.2 · chi phí theo loại. DISCOUNT/VOUCHER tự lấy từ POS.
- **`campaign_control`** — M7.2 · cửa hàng đối chứng. Bỏ trống = cửa hàng chính cùng brand không chạy chương trình.
- **`campaign_item`** — M7.2 · chương trình chạy theo MÓN (LTO) ↔ mã món trên POS. Có dòng ở đây thì doanh thu CTKM = Tổng tiền các hoá đơn chứa món đó (gồm món khác), không theo tên CTKM.

### TẦNG B · `monthly/YYYY-MM.xlsx` — SỰ THẬT THEO THÁNG

Mỗi tháng một file. Cột tháng (`month` / `m`) được loader **tự điền từ tên file** — bỏ trống cũng đúng.

| Sheet | Cột | Khoá tự nhiên | Loader tự tính |
|---|---|---|---|
| `budget_nonmedia` | _month_ · _item_ · budget · actual | month + item | use_rate |
| `store_month` | **month** · **store** · **net** · **guest** · **tc** · gross · disc · voucher | month + store | ta · aov · brand · tier |
| `daily` | **date** · **store** · **net** · guest · tc | date + store | — |
| `daily_party` | **date** · **store** · **net** · guest · **tc** | date + store | — |
| `coverage` | _month_ · days_data · days_month · first · last | month | partial |
| `daypart` | _month_ · _daypart_ · net · tc · guest | month + daypart | — |
| `channel` | _month_ · _channel_ · net · tc | month + channel | — |
| `identify` | **month** · **bills** · **id_bills** · items | month | rate |
| `nature` | **month** · **nature** · **brand** · **rev** · disc · bills | month + nature + brand | — |
| `fact_promo_day` | **date** · **store** · brand · **name_pos** · nature · bills · guests · gross · disc · voucher · net · rev · items | date + store + name_pos | — |
| `fact_partner` | _month_ · **store** · brand · **partner** · **basis** · _camp_ · bills · guests · gross · disc · voucher · commission · net | month + store + partner + basis + camp | — |
| `fact_lto_line` | **date** · **store** · brand · **bill** · **item_code** · item_base · item_name · group · qty · line_rev · bill_net · bill_gross · bill_disc · bill_voucher · bill_guests · bill_camp | date + store + bill + item_code | — |
| `recon` | **month** · **store** · **net** · net_item · net_bill · tc · tc_bill · guest · guest_bill | month + store | d_bill |
| `cogs_cov` | _month_ · rev · rev_cov · sku · sku_cov | month | pct |
| `ads_month` | _month_ · spend · reach · impr · n | month | — |
| `ads_brand` | _month_ · _brand_ · spend · reach | month + brand | — |
| `ads_objective` | _month_ · _objective_ · spend · result | month + objective | — |
| `ads_campaign_detail` | _month_ · _brand_ · _objective_ · _campaign_ · spend · reach · impr · result · page · rkind · funnel · clicks | month + brand + objective + campaign | cpr |
| `ads_google` | _month_ · _campaign_ · store · brand · status · budget_day · spend · conv · clicks · impr | month + campaign | cpa |
| `gads_channel` | _month_ · _channel_ · impr · clicks · conv · spend | month + channel | — |
| `gads_kw` | _month_ · _kw_ · clicks · impr · spend · conv | month + kw | — |
| `voucher_month` | _m_ · _brand_ · used · rev · disc | m + brand | — |
| `voucher_join` | _m_ · n · hit | m | rate |
| `oa` | _month_ · follows · msgs · views · menu · content · days | month | — |
| `member` | _month_ · member · oa · days | month | — |
| `social_month` | **month** · **platform** · **brand** · _page_ · code · followers · follows · unfollows · reach · impr · views · profile_views · clicks · contacts · msgs · likes · comments · shares · saves · engage · posts · spend · days | month + platform + brand + page | net_follow · er · reach_rate · per_post · cpm · audience · unit |
| `social_post` | _date_ · _platform_ · _brand_ · _page_ · format · _title_ · reach · views · impr · likes · comments · shares · saves · clicks · watch_avg · spend · link | date + platform + brand + page + title | engage · audience · er · unit |
| `social_target` | _month_ · _platform_ · _kpi_ · target | month + platform + kpi | — |
| `booking` | **month** · _ev_month_ · _store_ · brand · _outlet_ · _seg_ · _etype_ · _source_ · **status** · stage · _lost_reason_ · leads · guests · exp · exp_n · closed · closed_n · inq_est | month + ev_month + store + outlet + seg + etype + source + status + lost_reason | — |
| `lead_month` | _m_ · leads · exp | m | — |
| `lead_source` | _month_ · _src_ · leads · exp | month + src | — |
| `lead_type` | _month_ · _etype_ · leads · exp | month + etype | — |

- **`budget_nonmedia`** — Chi phí NGOÀI media theo tháng: KOL/KOC, POSM & in ấn, sản xuất nội dung, quà tặng, sự kiện.
- **`store_month`** — XƯƠNG SỐNG của hệ thống. net = doanh thu thuần · guest = số khách · tc = số hoá đơn.
- **`daily`** — Doanh thu theo NGÀY × cửa hàng. Ngày phải nằm trong tháng của file.
- **`daily_party`** — Phần KHÁCH TIỆC của `daily`: chỉ các hoá đơn có Số khách ≥ $guest_segment.party_min_guests, gộp theo NGÀY × cửa hàng. ETL tự sinh từ bảng kê hoá đơn (S02). Khách lẻ = daily − daily_party.
- **`coverage`** — Số ngày THỰC CÓ dữ liệu — nhận diện tháng chưa trọn kỳ. Không khai thì loader suy từ daily.
- **`daypart`** — Doanh thu theo khung giờ trong ngày.
- **`channel`** — Doanh thu theo kênh bán (tại chỗ, mang về, giao hàng…).
- **`identify`** — Tỷ lệ hoá đơn nhận diện được khách — trần trên của mọi phép quy doanh thu về khách. `items` = số dòng món đã xử lý trong tháng, nuôi thẻ đếm ở tab D1.
- **`nature`** — Bản chất chương trình khuyến mãi. nature ∈ COMMERCIAL|INTERNAL|PARTNER|LOYALTY. `rev` = doanh thu chạm (cấp dòng món, THÀNH TIỀN) · `disc` = chiết khấu thật (cấp HOÁ ĐƠN) — hai base khác nhau, xem fact_promo_day.
- **`fact_promo_day`** — CTKM theo NGÀY × cửa hàng — nền của M7.2. `disc` = Giảm giá + Chiết khấu ở cấp HOÁ ĐƠN · `voucher` = Phiếu GG, để riêng vì voucher là phương thức thanh toán chứ không phải giảm giá. `net` = Tổng tiền (cùng base với daily/store_month — kỳ nền của M7.2 lấy từ đó). `rev`/`items` từ lane dòng món theo THÀNH TIỀN — base khác `net`, đừng cộng chung. `name_pos` giữ nguyên văn, chuẩn hoá ở dim_campaign.
- **`fact_partner`** — Hoá đơn ĐỐI TÁC theo tháng × cửa hàng × đối tác — nền chung của M7 (thẻ Đối tác) và M9. Mỗi hoá đơn thuộc MỘT đối tác, nhận theo thứ tự `basis`: CTKM (tên CTKM khớp luật PARTNER, mã ở $promo_nature.rules[].partner) → NGUON (cột Nguồn là nền tảng) → PTTT (trả qua ví nền tảng). `camp` = tên CTKM nguyên văn (có thể rỗng). `net` = Tổng tiền (cùng base store_month) · `gross` = trước giảm giá · `disc` = Giảm giá + Chiết khấu · `voucher` = Phiếu GG · `commission` = cột Hoa hồng của POS.
- **`fact_lto_line`** — Dòng món thuộc nhóm LTO (Nhóm món chứa $campaign.lto_group_rx) gắn TỔNG hoá đơn chứa nó — nền doanh thu CTKM của chương trình LTO chạy theo món. `bill_net` = Tổng tiền cả hoá đơn (gồm món khác) · `line_rev` = Thành tiền riêng dòng LTO. Một hoá đơn có nhiều dòng LTO → cộng bill_net theo hoá đơn DUY NHẤT.
- **`recon`** — Đối soát ba tầng: bảng tháng ↔ bảng món ↔ bảng hoá đơn.
- **`cogs_cov`** — Độ phủ giá vốn theo tháng.
- **`ads_month`** — Meta Ads tổng theo tháng. CHỈ cộng dòng cấp campaign — cộng cả adset là nhân đôi.
- **`ads_brand`** — Meta Ads theo brand. Nhãn `Tuyển dụng` không phải marketing thương hiệu.
- **`ads_objective`** — Meta Ads theo mục tiêu chiến dịch.
- **`ads_campaign_detail`** — Chi tiết từng chiến dịch Meta trong tháng. page = mã fanpage đầu tên chiến dịch · rkind = loại kết quả chuẩn hoá · funnel = 'booking' nếu thuộc phễu booking tiệc (luật $booking.ads).
- **`ads_google`** — Google Ads theo chiến dịch. Đã loại dòng 'Tổng số: …'.
- **`gads_channel`** — Google Ads theo kênh phân phối (Maps, Tìm kiếm, YouTube…).
- **`gads_kw`** — Google Ads theo cụm từ tìm kiếm. Đã loại dòng 'Tổng số: …'.
- **`voucher_month`** — Voucher đã dùng theo tháng × brand.
- **`voucher_join`** — Tỷ lệ voucher khớp được với hoá đơn trong cùng tháng.
- **`oa`** — Zalo OA. follows = Quan tâm · views = Xem trang thông tin OA · menu = Tương tác thanh menu · content = Xem nội dung.
- **`member`** — Member đăng ký mới & OA follow mới theo tháng (số toàn chuỗi).
- **`social_month`** — Fanpage & TikTok. Facebook điền reach · TikTok điền views — KHÔNG gộp hai cột. platform ∈ FACEBOOK|TIKTOK|INSTAGRAM|YOUTUBE|ZALO code = mã fanpage (NCB · NDC · NJFB · NEC). contacts = Tổng số người liên hệ, msgs = Lượt bắt đầu cuộc trò chuyện qua tin nhắn (Facebook, cả tự nhiên lẫn trả phí).
- **`social_post`** — Bài đăng / video. watch_avg tính bằng GIÂY.
- **`social_target`** — KPI social cam kết theo tháng, ví dụ kpi = net_follow hoặc er.
- **`booking`** — Booking tiệc & sự kiện — gộp theo tháng NHẬN LEAD (month) × tháng DIỄN RA (ev_month) × cửa hàng × phân khúc × loại × nguồn × trạng thái. month = Inquiry Date → Input Date → (thiếu cả hai) ngày sự kiện, khi đó inq_est đếm số lead bị ước. seg ∈ event|table, stage ∈ won|open|lost — luật ở $booking. exp chỉ cộng ô có số (exp_n lead); ô trống/TBA KHÔNG tính là 0. closed_n = số lead Confirmed đã nhập Closed Revenue.
- **`lead_month`** — Lead tiệc theo tháng. Loader tự sinh từ sheet booking nếu sheet này trống.
- **`lead_source`** — Lead tiệc theo nguồn. Loader tự sinh từ sheet booking nếu sheet này trống.
- **`lead_type`** — Lead tiệc theo loại sự kiện. Loader tự sinh từ sheet booking nếu sheet này trống.

### TẦNG C · `02_snapshot.xlsx` — BẢNG LUỸ KẾ TOÀN KỲ

Cộng dồn mọi tháng đang có. Nộp lại là THAY THẾ toàn bộ, không nối thêm.

| Sheet | Cột | Khoá tự nhiên | Loader tự tính |
|---|---|---|---|
| `product` | **ma** · **name** · _cat_ · _grp_ · **qty** · **rev** · cogs | ma + name + cat + grp | has_cogs · cm · cm_pct · mclass |
| `category` | _cat_ · qty · rev | cat | — |
| `group` | _grp_ · qty · rev | grp | — |
| `heat` | _dow_ · _hour_in_ · net · tc | dow + hour_in | — |
| `zone` | _store_ · _zone_ · net · tc | store + zone | — |
| `staff` | _store_ · _name_ · net · tc · guest | store + name | aov |
| `payment` | _pttt_ · net · tc | pttt | — |
| `dwell` | _store_ · n · mean · median | store | — |
| `repeat` | _label_ · n | label | — |
| `campaigns` | _name_ · _nature_ · _brand_ · rev · bills | name + nature + brand | — |
| `voucher_prog` | _prog_ · _brand_ · issued · used · rev · disc | prog + brand | rate |
| `social_format` | _platform_ · _format_ · posts · reach · views · engage | platform + format | er |
| `campaign_result` | **campaign_id** · demo · label · measurable · reason · days_run · period_from · period_to · stores · overlap · ramp_warning · base_to · base_from · control_stores · control_factor · act_net · act_tc · act_guest · exp_net · exp_tc · exp_guest · incr_net · lift_pct · d_tc · d_aov · d_party · d_ta · d_mix · driver · lever_note · promo_bills · promo_guests · promo_net · cost_discount · cost_voucher · cost_manual · cost_ads_auto · cost_total · cost_planned_used · cm_pct · flow_through · roi · breakeven_lift · target_verified · att_net · att_tc · att_aov · att_ta · att_incr · eval_scope · eval_note · promo_disc · promo_voucher · noire_share · plan_sales · base_sales · plan_tc · act_sales · promo_share · store_incr_net · store_lift_pct · store_flow_through · cost_promo_actual · cost_fixed_actual · breakeven_sales · objective · cadence · recur_dow · plan_group · plan_primary · promo_gross · promo_sales · store_net · revenue_basis · lto_qty · lto_rev · lto_items · store_tc | campaign_id | — |
| `campaign_daily` | **campaign_id** · **date** · in_period · act_net · exp_net · promo_bills | campaign_id + date | — |
| `campaign_month` | **campaign_id** · **month** · **store** · bills · guests · net · gross · disc · voucher · dup_bills · dup_guests · dup_net | campaign_id + month + store | — |
| `campaign_unmapped` | **name_pos** · nature · _brand_ · first · last · days · bills · net · disc | name_pos + brand | — |
| `campaign_issue` | **campaign_id** · **field** · level · **msg** | campaign_id + field | — |
| `pre_plan` | **pre_id** · campaign_id · **name** · brand · kind · plan_status · est_tc · base_gross · growth · target_gross · incr_gross · target_aov · cogs_pct · cm_pct · promo_cost · fixed_cost · total_cost · net_contrib · roi · breakeven_incr · assessment · driver · source_file · label · period_from · period_to · act_net · act_tc · incr_net · cost_total · flow_through · roi_actual · act_promo_net · act_promo_bills | pre_id | — |
| `pre_eval` | **program_id** · _scenario_ · name · brand · stores · date_from · date_to · days · objective · lever · status · decision · decision_note · bills · bills_incr · cannib_pct · rev_incl · net_incr · gp_incr · promo_cost · program_cost · opex_incr · ebitda_incr · ebitda_pct · roi · breakeven_bills · max_cannib · redemption_needed · stock_days · gate_flags · campaign_id · quarter · season_factor · scheme_mode · tc_base · tc_share · participation_src · cannib_src · other_cogs_pct · opex_pct · base_note · safety_bills · input_source · missing | program_id + scenario | — |
| `pre_eval_scheme` | **program_id** · _scheme_id_ · scheme_name · condition · benefit · bills · bill_value · discount · rev_after_disc · ta · cogs · cogs_pct · margin_pct · merch_cost · promo_cost · basis_note | program_id + scheme_id | — |
| `pre_eval_fin` | **program_id** · _scenario_ · _row_ · label · base · without · with_promo · total · cannib_pct · incr · incr_pct | program_id + scenario + row | — |
| `pre_eval_base` | **program_id** · _store_ · base_from · base_to · base_days · net_incl · tc · guests · aov_incl · ta_incl · tc_day · net_day · tax_factor · disc_share · note | program_id + store | — |
| `pre_eval_input` | **program_id** · **field** · value · source · level · status · hint | program_id + field | — |

- **`product`** — Bảng món LUỸ KẾ toàn kỳ. Nếu cắt top-N thì bắt buộc khai tổng thật ở _stats.
- **`category`** — Cơ cấu theo Loại món — tính trên TOÀN BỘ SKU, không chỉ phần đã cắt.
- **`group`** — Cơ cấu theo Nhóm món — tính trên TOÀN BỘ SKU.
- **`heat`** — Ma trận giờ vào × thứ. dow: 0 = Thứ 2 … 6 = Chủ nhật.
- **`zone`** — Doanh thu theo khu vực bàn.
- **`staff`** — Doanh thu theo nhân viên phục vụ.
- **`payment`** — Doanh thu theo phương thức thanh toán.
- **`dwell`** — Thời gian ngồi bàn (phút). Bỏ trống `store` = số toàn chuỗi.
- **`repeat`** — Phân bố số lần quay lại của khách nhận diện được.
- **`campaigns`** — Chương trình khuyến mãi luỹ kế toàn kỳ.
- **`voucher_prog`** — Chương trình voucher luỹ kế toàn kỳ.
- **`social_format`** — Hiệu quả theo định dạng bài đăng — chỉ cần khi social_post đã cắt top-N.
- **`campaign_result`** — M7.2 · kết quả đo mỗi chương trình (tools/campaign.py tính).
- **`campaign_daily`** — M7.2 · chuỗi ngày thực tế vs kỳ vọng để vẽ pre/during/post.
- **`campaign_month`** — M7.2 · số POS của chương trình cắt theo tháng × cửa hàng (hoá đơn gắn CTKM; LTO: hoá đơn chứa món LTO). Nền để KPI và bảng chấm điểm cộng ĐÚNG tháng + brand đang lọc, so với store_month cùng kỳ. dup_*: hoá đơn LTO đồng thời gắn tên CTKM — trừ khi cộng tổng nhiều chương trình.
- **`campaign_unmapped`** — M7.2 · tên CTKM trên POS (COMMERCIAL/LOYALTY/PARTNER) chưa gắn vào chương trình nào.
- **`campaign_issue`** — M7.2 · lỗi khai báo trong file Campaign Tracking.
- **`pre_plan`** — M7.1 · kế hoạch từng chương trình đọc thẳng file Pre-Analysis (S16) + kết quả thực tế nối qua campaign_id (M7.2). Sinh bởi tools/campaign.py.
- **`pre_eval`** — M7.1 · kết quả đánh giá trước khi chạy — 1 dòng / chương trình × kịch bản. Sinh bởi tools/preeval.py.
- **`pre_eval_scheme`** — M7.1 · Program's details — kinh tế học 1 hoá đơn theo từng scheme (Cơ sở).
- **`pre_eval_fin`** — M7.1 · Financial evaluation (khung PP672): hàng Gross/Discount/Net/COGS/GP × cột Base · Không KM · Có KM · Tổng · %Cannib · Tăng thêm.
- **`pre_eval_base`** — M7.1 · dữ liệu nền tự lấy từ POS cho từng chương trình × cửa hàng.
- **`pre_eval_input`** — M7.1 · dữ liệu đầu vào ĐÃ CHUẨN HOÁ của từng chương trình theo $preeval.input_fields — mỗi trường một dòng: giá trị · nguồn (SO = sổ Pre_Analysis · DECK = file deck quý S16) · mức bắt buộc · trạng thái (OK / THIEU). Sinh bởi tools/preeval.py.

### TẦNG D · `_stats` — đặt ở file nào cũng được

Cửa thoát cho con số tổng mà bảng đã cắt top-N không suy lại được.

| Sheet | Cột | Khoá tự nhiên | Loader tự tính |
|---|---|---|---|
| `_stats` | _table_ · _field_ · value | table + field | — |

- **`_stats`** — Cửa thoát cho con số tổng mà bảng đã cắt top-N không suy lại được. Loader ƯU TIÊN giá trị ở đây. Dòng product_stat/covers khai kỳ mà bảng luỹ kế thực sự phủ — M2 hiện dòng này.

> Cột **đậm** là bắt buộc · cột _nghiêng_ nằm trong khoá tự nhiên (trùng khoá thì file đọc sau thắng).
<!-- /AUTO:SHEETS -->

---

## 5. Sheet `_stats` — cửa thoát cho con số tổng

Một số bảng bị **cắt top-N** khi xuất (ví dụ `product` chỉ giữ 700 mã bán chạy nhất). Tính
lại tổng từ bảng đã cắt sẽ ra số sai. Sheet `_stats` cho phép khai giá trị đúng:

| table | field | value |
|---|---|---|
| `product_stat` | `sku` | 1439 |
| `menu_median` | `qty` | 216 |
| `meta` | `cogs_coverage` | 0.4627 |

Loader **ưu tiên giá trị ở `_stats`**, chỉ tự tính khi không có khai báo. Giá trị dạng danh
sách được ghi JSON và loader tự giải mã ngược.

> Trung vị cắt ma trận Menu Engineering **bắt buộc** phải khai ở đây nếu `product` đã cắt
> top-N — tính trên tập đã cắt sẽ đẩy trung vị lên và xếp sai hạng Star/Plow-horse/Puzzle/Dog.

**Đừng khai ở `_stats` những con số loader tính được.** Khai cứng là đóng băng: bản trước khai
`gads_stat.period = "1 tháng 8, 2026 – 26 tháng 8"` và `member_stat.total = 94`, nên mỗi lần
nộp tháng mới hai con số đó vẫn nói kỳ cũ. Cả hai đã được gỡ và tính lại từ dữ liệu.

---

## 6. Mười lăm chốt kiểm tra

Chi tiết ngưỡng và cách xử lý: [`40_QA_GATES.md`](40_QA_GATES.md).

**Chốt 1–4 là chốt gác cổng: fail thì build DỪNG** (thoát mã 1), Vercel báo lỗi deploy. Đây
là chủ ý — thà không deploy còn hơn phát tán số sai. Chốt 5–15 fail thì vẫn build, nhưng
hiện đỏ ở tab D1.

Nếu loader gặp lỗi mà `src/data/data.json` cũ vẫn còn, nó **giữ bản cũ và cho build tiếp** —
app không bao giờ trắng trang vì một file Excel hỏng.

---

## 7. Quy tắc điền dữ liệu

**❶ Ô trống ≠ số 0.** Ô trống nghĩa là *chưa đo được*; số 0 nghĩa là *đã đo và bằng không*.
Loader giữ nguyên phân biệt này và màn hình hiển thị `—` cho ô trống.

Đây không phải quy ước hình thức. Ba chỗ trong bản trước đã hiện `0` cho dữ liệu chưa đo và
nói sai hẳn nghĩa: `use_rate` của đối tác thành "0,0% — chương trình thất bại", `take_rate`
của GrabFood thành "nền tảng không giữ đồng nào", và số bài đăng Fanpage thành "tháng này
không đăng gì". Cả ba đã sửa thành `—`.

**❷ Đừng điền cột dẫn xuất.** Cột ở mục *Loader tự tính* của bảng §4. Điền tay sẽ bị ghi đè,
và nếu công thức của bạn khác thì số sẽ lệch với phần còn lại của hệ thống (vi phạm NT2).

**❸ Giữ nguyên tên sheet và tên cột.** Cột lạ được bỏ qua im lặng — thoải mái thêm cột ghi
chú riêng. Sheet lạ thì chốt #14 báo.

**❹ Ngày `YYYY-MM-DD`, tháng `YYYY-MM`.** Loader nhận cả ô Date của Excel.

**❺ Ô công thức được đọc theo kết quả**, không đọc công thức.

---

## 8. Lệnh

```bash
python tools/build_month.py 2026-09     # dữ liệu thô → data_input/monthly/2026-09.xlsx
python tools/build_month.py --all       # dựng lại mọi tháng có trong nguồn
python tools/gen_contract_doc.py        # sinh lại §4 của tài liệu này từ hợp đồng

npm run build:data                      # data_input/ → src/data/*.json + 15 chốt QA
npm run build:data -- --v               # thêm chi tiết từng sheet đọc được
npm run dev                             # localhost:3001
npm run build                           # build production (Vercel dùng lệnh này)
```

---

## 9. Di trú từ bộ 4 workbook cũ

Bản trước dùng `01_master` · `02_sales` · `03_marketing` · `04_social`. Chuyển sang cấu trúc
ba tầng bằng một lệnh:

```bash
python tools/split_to_monthly.py
```

Bản cũ được dời vào `_archive/data_input_v1/` chứ không xoá. Sáu sheet bị cố ý bỏ khi di trú
vì bản cũ là ảnh chụp lệch kỳ — `ads_campaign_detail` (top-40 gộp cả 8 tháng), `ads_google` ·
`gads_channel` · `gads_kw` (ảnh chụp 01–26/08), `lead_month` · `lead_source` · `lead_type`
(dừng ở 05/2026). Tất cả được `tools/build_month.py` dựng lại đúng tháng từ dữ liệu thô.
