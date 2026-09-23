# M9 · PARTNERSHIP — ĐỐI TÁC = AGGREGATOR + PARTNER

| | |
|---|---|
| **Câu hỏi** | Đối tác mang lại bao nhiêu khách, bao nhiêu doanh thu, tốn bao nhiêu? |
| **`activeView`** | `m9` |
| **View** | `src/views/PartnershipView.tsx` · phép gộp dùng chung `src/utils/partner.ts` |
| **Nhập liệu** | `05_DOI_TAC/01_Danh_Muc/NOIRE_Doi_Tac_Partner_Aggregator.xlsx` — danh mục *(S15)*<br>`05_DOI_TAC/03_Aggregator/NOIRE_Aggregator_Theo_Thang.xlsx` — số aggregator theo tháng *(S19)*<br>`05_DOI_TAC/02_eVoucher_Doi_Tac/` — log eVoucher đối tác *(S21)*<br>Tạo mẫu: `python tools/partner_template.py` (không đè file đã có) |
| **ETL** | `tools/build_month.py` — `read_pos()` → `fact_partner` *(hoá đơn POS)*<br>`build_mkt.py` §5 → `partners` · `partner_program` · `partner_plan` · `partner_agg` · `partner_voucher` → `01_master.xlsx` |
| **Loader** | `scripts/build-data.mjs` — `buildPartner()` → `partner_fact` · `partners` · `partner_voucher` · `partner_campaigns` · `partner_check` · `partner_plan` |
| **Định nghĩa** | `data_contract.json` → **`$partner`** (kênh · cách nhận số) · **`$promo_nature.rules[].partner`** (tên CTKM → Mã ĐT) · cột file nhập: `tools/partner_template.py` |
| **Trạng thái** | ✅ M7 và M9 cùng một bảng số (QA #17) · ⚠️ Dining City là số tự thống kê |
| **Cổng chuẩn hoá** | File lạ trong 3 thư mục trên được `tools/l0_ingest.py` nạp vào schema chuẩn — xem [`10_L0_INPUT_CONTRACT.md`](../10_L0_INPUT_CONTRACT.md) §Cổng chuẩn hoá |

---

## 0. Định nghĩa *(thống nhất 18/09/2026)*

| Kênh | Đối tác | Nguồn doanh thu |
|---|---|---|
| **AGGREGATOR** — nền tảng trung gian, thu hoa hồng / phí | P03 Grab Dine Out · P11 GrabFood (giao hàng) | **POS** — hoá đơn có Nguồn = GRAB / GRABFOOD |
| | P02 Dining City | **Tự thống kê** — POS không ghi nhận được, team nhập file `03_Aggregator` |
| **PARTNER** — ngân hàng · ví · thẻ | P01 Techcombank × OneU · P05 Shinhan · P04 HDBank · P06 Urbox · P07 Betakee · P08 Visa | **POS** — hoá đơn gắn tên CTKM của đối tác |

> ⚠️ SonKim Group và Cư dân & toà nhà KHÔNG phải partnership — khuyến mãi NOIRE tự chạy, chấm COMMERCIAL ở M7.

**Doanh thu = Tổng tiền hoá đơn** (gồm VAT & phí phục vụ) — cùng cách tính Net Sales toàn hệ thống, nên “% DT chuỗi”
mới đúng mẫu số. Báo cáo team ghi Sales **trước VAT/phí**: T8 Grab Dine Out 81.118.000 trước VAT = 92.064.588 Tổng tiền —
khớp tuyệt đối, chỉ khác cách tính.

## 1. File nhập — hai file, mỗi file một việc

Cột khai ở MỘT chỗ: `tools/partner_template.py` (sinh file mẫu, `build_mkt.py` đọc lại đúng định nghĩa đó).
Màu ô: **CAM** cần điền · **XANH** đã điền sẵn, kiểm lại · **XÁM** hệ thống tự lấy từ POS, không điền.

**① Danh mục** — `01_Danh_Muc/NOIRE_Doi_Tac_Partner_Aggregator.xlsx` *(sửa khi có hợp đồng mới)*

| Sheet | Mỗi dòng | Nội dung |
|---|---|---|
| `1_PARTNER` | một đối tác ngân hàng · ví · thẻ | loại, brand, cửa hàng, **kỳ hạn hợp đồng**, trạng thái, **% NOIRE chịu ưu đãi**, **phí hợp tác** + kỳ tính phí, **chiết khấu cho đối tác**, media quy đổi, phụ trách |
| `2_AGGREGATOR` | một nền tảng | loại, kỳ hạn, **hoa hồng %**, **phí cố định tháng**, **phí theo booking/khách**, ai tài trợ ưu đãi, **nguồn số** (POS tự động / Tự thống kê) |
| `3_CHUONG_TRINH` | một chương trình | **cơ chế**, **nội dung ưu đãi khách nhận**, mức, trần, HĐ tối thiểu, điều kiện, **kỳ chạy**, số mã, **Campaign ID iPOS**, tên CTKM trên POS |
| `4_KE_HOACH` | tháng × đối tác | mã phát, tỷ lệ dùng, AOV, doanh thu, chi phí, LN gộp kế hoạch |

**② Số aggregator** — `03_Aggregator/NOIRE_Aggregator_Theo_Thang.xlsx`, sheet `AGG_THANG` *(điền mỗi tháng)*

Dòng xếp sẵn **THÁNG → BRAND → nền tảng** (T7–T12/2026). Cột: booking · huỷ/no-show · khách đến · hoá đơn ·
doanh thu (Tổng tiền) · ưu đãi NOIRE chịu · ưu đãi nền tảng chịu · hoa hồng thực trả · phí khác · cách tính.

| Nền tảng | Điền gì |
|---|---|
| Dining City *(tự thống kê)* | đủ mọi cột |
| Grab Dine Out · GrabFood *(POS)* | chỉ **ưu đãi NOIRE chịu** (giảm 20%/15% áp trên app — POS không ghi) · **hoa hồng thực trả** · **phí khác** theo sao kê → thay số ước tính 13,8%, chia theo doanh thu |

## 2. Mỗi hoá đơn thuộc MỘT đối tác

```
bảng kê hoá đơn POS (S02) ─┬─ ① Tên CTKM khớp luật PARTNER       → Mã ĐT theo luật       basis CTKM
                           ├─ ② Nguồn = GRAB / GRABFOOD          → P03 / P11              basis NGUON
                           ├─ ③ PTTT GRAB DEBIT + có Hoa hồng     → P11                   basis PTTT
                           └─ ④ PTTT GRAB DEBIT, Nguồn TẠI CHỖ,   → KHÔNG TÍNH             basis XAC_NHAN
                                không hoa hồng                       (khối “Cần kiểm tra”)
03_Aggregator · AGG_THANG ─── ⑤ nền tảng nguồn “Tự thống kê”     → P02 Dining City        basis TU_THONG_KE
danh mục · sao kê ────────── ⑥ phí hợp tác / cố định / thực trả  → dòng chỉ có chi phí    basis PHI
```

## 3. Các lỗi đã sửa *(18/09/2026)*

| Lỗi | Trước | Nay |
|---|---|---|
| Cộng hoá đơn GRAB DEBIT có Nguồn = TẠI CHỖ vào Grab Dine Out | T8: 115 HĐ · 164,4 tr | 70 HĐ · 92,1 tr (= 81,1 tr trước VAT, khớp báo cáo team). 45 HĐ · 72,4 tr chuyển sang **Cần kiểm tra** — trả chia VISA + GRAB DEBIT, không mã voucher, chưa đủ căn cứ |
| Dining City trừ phí hai lần | DT 7.847.714 (đã trừ phí) + phí 576.000 vào chi phí | DT 8.423.714 · phí 576.000 tính một lần |
| GrabFood giao hàng trừ hoa hồng hai lần | POS `Tổng tiền = trước giảm − Hoa hồng`, lại cộng hoa hồng vào chi phí | Hoa hồng hiện riêng “đã trừ trong DT”, không vào chi phí |
| eVoucher lấy tháng theo TÊN FILE | file `_T9.2026` → 6.000 mã “phát trong T9” | tháng phát theo Ngày phát hành, tháng dùng theo Ngày sử dụng |
| Cờ “eVoucher ≠ POS” | 31 ≠ 27 (log tới 17/09, bảng kê T9 tới 13/09) | chỉ so tháng đã đủ bảng kê: T7–T8 13 = 13 |
| Số aggregator đọc từ báo cáo MKT (S19) | hai nơi nhập, tên nền tảng đổi là mất số | một nơi: file `03_Aggregator` |

## 4. Log eVoucher đối tác

Log iPOS của mã đối tác (cùng định dạng log voucher S11): trạng thái, ngày phát hành, ngày dùng, nhà hàng dùng,
HĐ trước giảm, tiền giảm. Gắn vào đối tác qua **Campaign ID** ở `3_CHUONG_TRINH`. Không đưa số điện thoại khách ra dashboard.

| Campaign | Brand | Phát | Hạn | Mã | Đã dùng *(tới 17/09)* |
|---|---|---|---|---:|---:|
| 337795 | NCB — giảm 15%, tối đa 100k, HĐ ≥ 300k | 21/07 | 30/09 | 3.000 | 16 (0,5%) |
| 344574 | NDC — giảm 200.000đ | 26/08 | 31/10 | 1.500 | 10 (0,7%) |
| 344575 | NJFB — giảm 400.000đ | 26/08 | 31/10 | 1.500 | 5 (0,3%) |

## 5. Màn hình

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Doanh thu đối tác · Aggregator · Partner · Chi phí đối tác · Mã eVoucher dùng / phát |
| Biểu đồ | Doanh thu theo tháng (cột chồng hai kênh) · cơ cấu theo đối tác |
| **Aggregator** *(7 cột)* | đối tác · kỳ hạn · chương trình & cơ chế · hoa hồng & phí HĐ · booking / HĐ / khách · doanh thu & AOV · chi phí · cần xử lý |
| **Partner** *(8 cột)* | đối tác · kỳ hạn · chương trình & cơ chế · phí HĐ & chiết khấu · mã phát → dùng · HĐ / khách · doanh thu & AOV & kế hoạch · ưu đãi NOIRE chịu · cần xử lý |
| eVoucher theo chiến dịch | chiến dịch · ưu đãi · phát → dùng · HĐ trước giảm & tiền giảm |
| Cần kiểm tra | hoá đơn XAC_NHAN · cờ danh mục lệch thực tế |

Đã bỏ: Kết quả đối tác theo tháng · Nhận diện hoá đơn trên POS · Kho mã voucher iPOS (tham khảo) · Đối soát báo cáo team.

## 6. Số liệu T1–T8/2026

| | Doanh thu | HĐ |
|---|---:|---:|
| Grab Dine Out | 97,3 tr | 75 |
| GrabFood giao hàng | 16,8 tr | 114 |
| Dining City *(tự thống kê)* | 8,4 tr | 13 |
| **Aggregator** | **122,5 tr** | **202** |
| Shinhan | 75,0 tr | 340 |
| Techcombank × OneU | 9,9 tr | 13 |
| **Partner** | **84,9 tr** | **353** |
| **Đối tác** | **207,4 tr = 0,56% DT chuỗi** | **555** |

Chi phí đối tác 22,8 tr = 11,0% doanh thu đối tác (ưu đãi NOIRE chịu 10,4 tr + phí 12,4 tr, trong đó 11,8 tr ước tính
13,8% Grab Dine Out — nhập hoa hồng thực trả để thay). M7 thẻ “Đối tác” = tổng M9 từng tháng.

## 7. Xuất CSV

Mỗi bảng có nút **Xuất CSV** riêng, xuất **đúng những gì đang hiển thị** theo đúng bộ lọc tháng/brand,
tên file kèm kỳ lọc (`Noire_M9_Aggregator_2026-01_2026-08.csv`). Cột gộp trên màn được tách ra cho máy
đọc được (ô "Đối tác" → Mã ĐT · Đối tác · Kênh · Loại · Brand · Nguồn số…), số để dạng số thô nên Excel
cộng được ngay. Định nghĩa ở `Column.exportValue` + `columnsToRows()` của `DataTable` — dùng chung cho
mọi bảng toàn hệ thống.

*(sửa 23/09/2026: trước đây nút xuất đổ thẳng object dòng ra CSV nên cột `t` — toàn bộ hoá đơn, doanh
thu, chi phí — thành `[object Object]`, chương trình ưu đãi cũng mất; tiêu đề là khoá tiếng Anh.)*

## 8. Thêm một đối tác mới

1. Danh mục: thêm dòng ở `1_PARTNER` hoặc `2_AGGREGATOR` (Mã ĐT mới) + chương trình ở `3_CHUONG_TRINH`.
2. Đối tác đo trên POS: `data_contract.json → $promo_nature.rules` thêm `{"nature": "PARTNER", "partner": "<Mã ĐT>", "re": [...]}`
   **trước** luật `P00` chung. Nền tảng nhận theo Nguồn (ShopeeFood…) → thêm vào `$partner.pos`.
   Nền tảng không có trên POS → cột Nguồn số liệu = **Tự thống kê**, thêm dòng ở file `03_Aggregator`.
3. `python update.py` (đổi luật thì `--force`) → QA #16 · #17 phải xanh.
