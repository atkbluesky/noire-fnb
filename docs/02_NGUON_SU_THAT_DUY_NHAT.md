# 02 · NGUỒN SỰ THẬT DUY NHẤT — MỖI ĐỊNH NGHĨA MỘT CHỖ

> Mở file này trước khi gõ bất kỳ hằng số nào vào code.
> Nếu thứ bạn sắp gõ có tên trong bảng dưới — **đừng gõ**, hãy sửa ở nơi đã khai.

---

## 1. Bảng tra cứu

| Định nghĩa | Khai DUY NHẤT ở | Đọc qua | Ai dùng |
|---|---|---|---|
| **Chiều cửa hàng** — mã · brand · tier · tên · ngày mở | `data_input/01_master.xlsx` → sheet `dim_store` | `monthly_lib.STORE_META` · `BRAND_OF_STORE` · `CORE_STORES` | mọi lane Python + loader |
| **Bí danh cửa hàng** — mọi cách viết tên trong file export | cùng sheet, cột **`aliases`** *(ngăn `\|`)* | `monthly_lib.store_code()` | build_hub · build_mkt · build_month |
| **Nhận cửa hàng từ chuỗi tự do** — tên chiến dịch ads | cùng sheet, cột **`alias_re`** *(regex)* | `monthly_lib.store_in_text()` | build_mkt · build_month |
| **Bản chất CTKM** — nhãn · màu · thứ tự · có vào ROI không | `data_contract.json` → **`$promo_nature.labels`** | `monthly_lib.NATURE_META` · `HUB_DATA.nature_meta` | 2 lane Python + loader + 2 file .tsx |
| **Luật phân loại CTKM** — regex, có thứ tự | `data_contract.json` → **`$promo_nature.rules`** | `monthly_lib.classify_nature()` · `classifyNature()` ở loader | build_hub · build_month · loader |
| **Đối tác = Aggregator + Partner** — kênh · cách nhận hoá đơn (Nguồn/PTTT nền tảng) · bảng tên báo cáo → Mã ĐT | `data_contract.json` → **`$partner`** | `monthly_lib.partner_of_bill()` · `buildPartner()` ở loader | build_month · loader · M7 · M9 |
| **Tên CTKM → đối tác** — Mã ĐT gắn trên luật PARTNER | `data_contract.json` → **`$promo_nature.rules[].partner`** | `monthly_lib.classify_partner()` · `classifyPartner()` ở loader | build_month · loader |
| **Danh mục đối tác** — tên · kênh · kỳ hạn · cơ chế ưu đãi · phí · chiết khấu · % NOIRE chịu · kế hoạch | L0 `05_DOI_TAC/01_Danh_Muc/NOIRE_Doi_Tac_Partner_Aggregator.xlsx` *(cột khai ở `tools/partner_template.py`)* | `build_mkt.py` → `partners` · `partner_program` · `partner_plan` | loader · M7 · M9 |
| **Số aggregator tự thống kê** — Dining City (POS không ghi nhận) · hoa hồng / ưu đãi theo sao kê Grab | L0 `05_DOI_TAC/03_Aggregator/NOIRE_Aggregator_Theo_Thang.xlsx` | `build_mkt.py` → `partner_agg` | loader · M7 · M9 |
| **Phễu booking tiệc** — chốt là gì · đặt bàn nhỏ · chiến dịch ads nào là booking · loại kết quả ads · nhóm lý do mất · loại sự kiện | `data_contract.json` → **`$booking`** | `monthly_lib.booking_*()` · `ads_is_booking()` · `HUB_DATA.booking_meta` | build_month · loader · M10 |
| **Cấu trúc sheet Excel** — cột · khoá · tier | `data_contract.json` → `sheets` | `monthly_lib.SHEETS` · `CONTRACT.sheets` | mọi lane |
| **Nguồn L0** — thư mục · mẫu tên · nhịp · tháng bắt đầu | `tools/l0_registry.py` *(xuất ra `data_sources.json`)* | `monthly_lib.l0_files` · `l0_latest` · `l0_by_month` · `l0_scan` | mọi script + `update.py` |
| **Gốc dữ liệu L0** | `L0_input/` cố định *(đổi bằng `NOIRE_ROOT`)* | `monthly_lib.L0_ROOT` | mọi script |
| **Tháng nào cần dựng lại** | `tools/build_month.py → BUILDERS` *(cột nguồn)* | `update.py → plan()` | `update.py` |

---

## 2. Vì sao — bốn lần đã sai vì nhiều bản sao

Bảng trên không phải lý thuyết. Mỗi dòng là một lỗi đã xảy ra trên dữ liệu thật và
được phát hiện trong đợt rà ngày **16/09/2026**.

### ❶ Luật phân loại CTKM — 5 bản sao, và chúng đã lệch

Bảng luật từng nằm cùng lúc ở `build_hub.py`, `tools/build_month.py`,
`scripts/build-data.mjs`, `src/types/hub.ts`, `src/views/PromotionView.tsx`.

Hai bản Python đã lệch nhau về **thứ tự luật**: một bản bắt `nhân viên` trước `skg`,
nên `Giảm 50% cho Nhân Viên SonKim Group` — nhân viên của **đối tác** — bị xếp vào
`INTERNAL`. **88,8 tr** nằm sai ô. Thêm nhãn mới thì phải sửa đủ 5 chỗ; quên một chỗ
là màn hình nuốt mất cả một nhóm chi phí mà không báo gì.

### ❷ Chiều cửa hàng — 3 bản sao

`dim_store` ở `01_master.xlsx`, `STORE_ALIAS`/`BRAND_OF_STORE` ở `monthly_lib.py`,
`DIM_STORE` + `TARGET_ALIAS` ở `build_hub.py`. Thêm một cửa hàng phải sửa ba chỗ —
quên một chỗ là doanh thu cửa hàng đó lặng lẽ rơi khỏi một nửa hệ thống.

Bảng regex nhận cửa hàng từ tên chiến dịch còn có **2 bản đã lệch**: bản ở
`build_mkt.py` nhận `minh khai` cho NDC_NTMK, bản ở `build_month.py` thì không —
nên cùng một chiến dịch được gán store ở lane này và bỏ trống ở lane kia.

### ❸ Gốc dữ liệu L0 — 4 bản `find_root()`, 2 cây khác nhau

`check_input.py` chốt trên cây khung `L0_input/` (mỗi thư mục chỉ có một `.gitkeep`)
và báo **4/18 nguồn sẵn sàng**. `tools/build_month.py` lại đọc cây HIGHGATE thật và
chạy bình thường. **Chốt kiểm tra một cây, lane sản xuất một cây khác** — chốt xanh
hay đỏ đều không nói lên điều gì.

### ❹ Đường dẫn L0 nối cứng — 5 nguồn chết âm thầm

`tools/build_month.py` trỏ vào `05 Data Raw/3. Digital Ads` và
`05 Data Raw/2. Data Khách Hàng CRM`. Thư mục thật là `6. Digital Ads` và
`5. Data Khách Hàng CRM` — phòng ban đã đánh lại số. Lane không báo lỗi, chỉ ghi
**“chưa có dữ liệu”**, nghe hệt như chưa ai nộp file.

Hậu quả: **Meta Ads · Google Ads · Zalo OA · Member đăng ký · Fanpage Facebook**
chết nhiều tháng. Các sheet đó trong `monthly/*.xlsx` vẫn có số — nhưng là **số đóng
băng** từ đợt di trú, vì lane giữ nguyên sheet nào nó không dựng lại được.

> **Đây là dạng hỏng tệ nhất của một hệ thống dữ liệu: không có màn hình nào trống,
> mọi con số vẫn hiện ra, chỉ là chúng cũ.**

---

## 3. Hai chốt canh đã dựng

| Chốt | Bắt cái gì |
|---|---|
| **QA #16** *(loader)* | Phân loại CTKM của **lane Python** ≡ **lane JS**. Cùng bảng luật ở hợp đồng, nhưng thi hành bằng hai engine regex khác nhau — chốt này đối chiếu `fact_promo_day.nature` (Python tính) với kết quả phân loại lại bằng JS. Lệch một tên là báo đỏ. |
| **Kiểm kê L0** *(`l0_scan` — in ở `check_input.py` và cuối `_BAO_CAO_CAP_NHAT.txt`)* | Nguồn chưa có file · **tháng bị thiếu** tới tháng đã khép sổ · hai file cùng tháng (bản nào bị bỏ) · file đặt tên không đọc được tháng. |

Thêm vào đó, `resolve_path()` **bỏ qua số thứ tự đầu tên thư mục**, nên đánh lại số
không giết được nguồn nào. Đổi phần **chữ** thì phải sửa `tools/l0_registry.py` — đó là
thay đổi có ý nghĩa, không phải nhiễu.

---

## 4. Thêm một thứ mới thì làm ở đâu

| Việc | Sửa ở | KHÔNG đụng vào |
|---|---|---|
| Mở cửa hàng mới | `01_master.xlsx` → `dim_store`: thêm dòng, điền cả `aliases` | bất kỳ file `.py` nào |
| POS đổi cách viết tên cửa hàng | cùng sheet, thêm vào cột `aliases` | — |
| Thêm một bản chất CTKM | `data_contract.json` → `$promo_nature.labels` + `rules` | `.py` · `.mjs` · `.tsx` |
| Sửa luật phân loại CTKM | `$promo_nature.rules` — **nhớ thứ tự, khớp đầu tiên thắng** | — |
| Thêm đối tác mới | danh mục L0 S15 (dòng mới + cột `Kênh`) · `$promo_nature.rules` (luật có `partner`) · nền tảng không gắn CTKM → `$partner.pos` | `.tsx` |
| Thêm màu / đổi nhãn hiển thị | `$promo_nature.labels[].color` · `.label` · `.short` | `PromotionView.tsx` |
| Thêm nguồn L0 | `tools/l0_registry.py` → chạy lại + `tools/l0_setup.py` | `data_sources.json` *(sinh tự động)* |
| Thư mục nguồn bị đánh lại số | **không phải làm gì** | — |
| Thư mục nguồn đổi tên chữ | `tools/l0_registry.py` → `dir` | `data_sources.json` |

Riêng nhãn bản chất mới còn cần **một** dòng CSS ở
`src/components/common/StatusBadge.tsx` cho giá trị `badge` đã khai — đó là chỗ duy
nhất còn phải chạm tay, vì Tailwind cần class tĩnh để biên dịch.
