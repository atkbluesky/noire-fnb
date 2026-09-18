# M9 · PARTNERSHIP — ĐỐI TÁC = AGGREGATOR + PARTNER

| | |
|---|---|
| **Câu hỏi** | Đối tác mang lại bao nhiêu khách, bao nhiêu doanh thu, tốn bao nhiêu? |
| **`activeView`** | `m9` |
| **View** | `src/views/PartnershipView.tsx` · phép gộp dùng chung `src/utils/partner.ts` |
| **ETL** | `tools/build_month.py` — `read_pos()` → **`fact_partner`** · `read_promotion()` → `aggregator` · `read_partnership()` → `partner_month`<br>`build_mkt.py` → `partners` · `partner_camp` · `partner_plan` |
| **Loader** | `scripts/build-data.mjs` — `buildPartner()` → `partner_fact` · `partners` · `partner_recon` · `partner_month` · `partner_plan` |
| **Định nghĩa** | `data_contract.json` → **`$partner`** (kênh · cách nhận) · **`$promo_nature.rules[].partner`** (tên CTKM → Mã ĐT) |
| **Nguồn** | L0 S02 bảng kê hoá đơn POS · S15 danh mục đối tác · S19 báo cáo Promotion-AGG · S21 eVoucher đối tác |
| **Trạng thái** | ✅ đo trên hoá đơn thật từ 18/09/2026 · M7 và M9 cùng một bảng số (QA #17) |

---

## 0. Thống nhất định nghĩa *(18/09/2026)*

**Đối tác = hai kênh.** Dùng chung cho thẻ bản chất “Đối tác” ở M7 và toàn bộ M9.

| Kênh | Là gì | Đối tác trong danh mục |
|---|---|---|
| **AGGREGATOR** | Nền tảng trung gian bán hộ / đặt bàn hộ, thu hoa hồng hoặc phí | P03 Grab Dine Out · P11 GrabFood (giao hàng) · P02 Dining City |
| **PARTNER** | Đối tác mang khách tới bằng ưu đãi riêng | Ngân hàng: P01 Techcombank × OneU · P05 Shinhan · P04 HDBank — Ví & e-voucher: P06 Urbox · P07 Betakee — Tổ chức thẻ: P08 Visa |

Kênh của từng đối tác khai ở **cột `Kênh`** của danh mục (L0 `05_DOI_TAC/01_Danh_Muc/00_Danh_Muc_Partnership.xlsx`).
Tên CTKM nào thuộc đối tác nào khai ở **`data_contract.json → $promo_nature.rules[].partner`** — cùng bảng luật phân
loại bản chất, nên một tên không thể là “Đối tác” ở M7 mà lại không có chủ ở M9.

> ⚠️ **SonKim Group và Cư dân & toà nhà KHÔNG phải partnership** *(xác nhận 18/09/2026)* — hai chương trình này
> không có hợp đồng đối tác thật (không tách phần NOIRE/đối tác trả), mà là khuyến mãi NOIRE chủ động chạy nhắm
> vào hệ sinh thái SonKim/cư dân. Đã chuyển từ bản chất **PARTNER** sang **COMMERCIAL** — không còn hiện ở M9,
> đọc ở **M7 · Top chương trình** như mọi campaign thương mại khác. Guard `nhân viên sonkim` / `tòa nhà` vẫn giữ
> trong luật để không rơi nhầm vào INTERNAL.

## 1. Mỗi hoá đơn thuộc MỘT đối tác — nhận theo thứ tự

```
bảng kê hoá đơn POS (S02) ─┬─ ① Tên CTKM khớp luật PARTNER      → Mã ĐT theo luật              basis = CTKM
                           ├─ ② Nguồn đơn là nền tảng (GRAB*)   → P03 Grab Dine Out / P11      basis = NGUON
                           └─ ③ PTTT trả qua ví nền tảng        → P03 / P11                    basis = PTTT
                                (GRAB DEBIT, thu ngân chưa chọn Nguồn)
báo cáo Promotion-AGG (S19) ── ④ nền tảng KHÔNG có dấu vết POS → P02 Dining City              basis = REPORT
                                (chỉ dùng khi POS không có hoá đơn của đối tác trong tháng)
        │
        ▼  fact_partner (tháng × cửa hàng × đối tác × basis × tên CTKM)
        ▼  loader buildPartner() → partner_fact
        ├─► M7  thẻ “Đối tác” + khối “Đối tác = Aggregator + Partner”
        └─► M9  toàn bộ màn hình
```

**Grab Dine Out ≠ GrabFood giao hàng.** Hoá đơn Grab có **Hoa hồng ghi trên POS** (≈25%) hoặc **không có khách ngồi**
là đơn giao hàng (P11, chủ yếu NCB). Grab Dine Out (P03) là khách ăn tại quán NDC · NJFB, trả qua Grab, POS không ghi
hoa hồng — phí 13,8% (CMS theo báo cáo team) được **ước tính** từ `% Hoa hồng đối tác` của danh mục, đánh dấu `*`.

**Hoá đơn Grab có gắn CTKM khác** (vd. quà sinh nhật) vẫn tính cho Grab. Loader rút hoá đơn đó khỏi bản chất của CTKM
kia để tổng các bản chất ở M7 không đếm đôi (`$partner.overlap`).

## 2. Cột số — cùng base với M7 · M7.2

| Cột | Định nghĩa |
|---|---|
| **Doanh thu** | Σ `Tổng tiền` cả hoá đơn (gồm VAT/phí, cùng base Net Sales của `store_month`) · dòng dưới = % DT chuỗi kỳ lọc |
| **Hoá đơn · khách** | số hoá đơn · Σ Số khách |
| **AOV** | Doanh thu ÷ hoá đơn · ± % so AOV chuỗi |
| **Ưu đãi NOIRE chịu** | (`Giảm giá` + `Chiết khấu` + `Phiếu GG`) × `% Noire chịu chiết khấu` của danh mục |
| **Phí nền tảng** | cột `Hoa hồng` trên POS; POS không ghi → `% Hoa hồng đối tác` × (trước giảm giá − giảm giá), có `*`; Dining City lấy phí ở báo cáo |
| **Chi phí** | Ưu đãi NOIRE chịu + phí nền tảng · % trên doanh thu đối tác |
| **Kế hoạch DT · % đạt** | sheet `3. Kế Hoạch` của danh mục (tháng × đối tác) |
| **Nguồn số** | CTKM · Nguồn · PTTT · Báo cáo team (ước tính) |
| **Cần xử lý** | cờ tự sinh khi danh mục lệch hoá đơn thật (xem §4) |

## 3. Số liệu T1–T8/2026 *(dựng 18/09/2026, sau khi bỏ SonKim/Cư dân khỏi M9)*

| Kênh | Doanh thu | Hoá đơn |
|---|---:|---:|
| Aggregator | 197,3 tr | 249 |
| Partner | 84,9 tr | 353 |
| **Đối tác** | **282,2 tr = 0,8% DT chuỗi** | **602** |

Chi phí đối tác 37,6 tr = **13,3% doanh thu đối tác** (ưu đãi 10,4 tr + phí nền tảng 27,2 tr, phần lớn ước tính).
Kiểm tra chéo: thẻ “Đối tác” M7 = tổng M9 tới từng đồng ở cả 9 tháng (QA #17).

**Đối soát báo cáo team T8/2026 — Grab Dine Out:** báo cáo ghi 81.118.000 đ · 70 đơn = POS theo Nguồn **khớp tới đồng**
(NJFB The Crest 49.942.000 · NDC 31.176.000 sau giảm 1.570.000). Nhưng POS còn **45 hoá đơn · 63,8 tr** trả qua
`GRAB DEBIT` mà thu ngân không chọn Nguồn (NJFB SSV 24 · NJFB Crest 9 · NDC 12) — báo cáo team đang **bỏ sót**.
Grab Dine Out T8 thật: 115 đơn · 144,9 tr (trước VAT/phí) · 164,4 tr Tổng tiền.

**Kho mã Techcombank × OneU T8:** phát 4.500 mã, dùng 9 hoá đơn = **0,2%**. Tên CTKM có 3 biến thể theo brand
(`Noire -` · `Dining -` · `JFB -`) — luật nhận cả ba.

## 4. Cờ “Cần xử lý” — danh mục lệch thực tế

| Đối tác | Cờ | Việc cần làm |
|---|---|---|
| Grab Dine Out · Dining City | Khai “Chuẩn bị” nhưng đã phát sinh từ 2026-07 / 2026-08 | sửa `Trạng thái` → Đang chạy |
| Techcombank × OneU | Phát sinh ở brand chưa khai: NDC, NJFB | sửa `Brand áp dụng` |
| Shinhan | Không phát sinh từ 2026-05 | xác nhận còn hiệu lực không, hoặc thu ngân đã bỏ chọn CTKM |
| HDBank · Urbox · Betakee · Visa | Chưa phát sinh hoá đơn · (Urbox/Betakee/Visa) chưa khai kỳ hợp đồng | bổ sung kỳ, cơ chế; khi chạy nhớ tạo CTKM trên iPOS có tên đối tác |

**Visa:** chỉ tính CTKM mang tên Visa. PTTT `VISA` (~1,5 tỷ/tháng) là cách khách trả tiền, không phải chương trình đối tác.

## 5. Bộ lọc

Brand · Từ · Đến — áp cho mọi khối. Danh mục hiện đối tác áp dụng cho brand đang lọc hoặc đã phát sinh ở brand đó.

## 6. Thêm một đối tác mới

1. Danh mục L0 S15: thêm dòng `Mã ĐT` mới, điền `Kênh`, `Loại`, kỳ, `% Noire chịu`, `% Hoa hồng`.
2. `data_contract.json → $promo_nature.rules`: thêm một luật `{"nature": "PARTNER", "partner": "<Mã ĐT>", "re": [...]}`
   **trước** luật `P00` chung. Nền tảng mới không gắn CTKM (ShopeeFood…) → thêm vào `$partner.pos`.
3. `python update.py --force` (luật đổi thì phải dựng lại lane POS) → QA #16 · #17 phải xanh.

## 7. Còn thiếu

| Thiếu | Hệ quả |
|---|---|
| Hoa hồng Grab Dine Out thật (hoá đơn Grab gửi) | phí đang ước tính 13,8% |
| Dining City không có dấu vết trên POS | số lấy từ báo cáo team, không đối soát được — nên tạo CTKM `DINING CITY` trên iPOS |
| % NOIRE chịu của từng đối tác ngân hàng | đang khai 100% cho mọi đối tác |
| Kế hoạch cho Shinhan | cột “Kế hoạch DT” hiện `—` |
