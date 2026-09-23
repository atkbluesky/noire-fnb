# 10 · TẦNG L0 — THẢ FILE EXCEL THÔ, HỆ THỐNG TỰ CẬP NHẬT

> **Đây là tài liệu bạn mở mỗi tháng.**
> Việc hằng ngày chỉ có ba bước: **thả file → nháy đúp `CAP_NHAT.bat` → đọc báo cáo.**

---

## 1. Quy trình

```
Export từ POS / Meta / Google / Zalo…     (giữ nguyên tên file)
        │
        ▼
L0_input/<nhóm>/<nguồn>/                  (mỗi thư mục có README.md hướng dẫn riêng)
        │
        ▼
CAP_NHAT.bat   ─── hoặc ───   CAP_NHAT_TU_DONG.bat  (để cửa sổ mở, thả file là tự chạy)
        │
        ▼
L0_input/_BAO_CAO_CAP_NHAT.txt           file nào mới · đã dựng gì · chốt QA · THIẾU FILE GÌ
```

| Lệnh | Làm gì |
|---|---|
| `CAP_NHAT.bat` · `python update.py` | Cập nhật đúng phần có file thay đổi |
| `CAP_NHAT_TU_DONG.bat` · `python update.py --watch` | Soát `L0_input` mỗi 30 giây, thấy file mới **và đã chép xong** thì tự cập nhật |
| `python update.py --force` | Dựng lại tất cả, bỏ qua bộ nhớ thay đổi |
| `python check_input.py` · `python update.py --check` | Chỉ kiểm kê thiếu file, không dựng gì |
| `python run_pipeline.py` | Lối vào cũ — chuyển tiếp sang `update.py --force` |

---

## 2. Cây thư mục — một nơi duy nhất

Cây thư mục, tên nguồn, mẫu tên file, tháng bắt đầu **sinh ra từ một chỗ**:
`tools/l0_registry.py` → `data_sources.json` → `tools/l0_setup.py` dựng thư mục + README.

```
L0_input/
├── README.md                          ← bảng đầy đủ mọi nguồn (sinh tự động)
├── _BAO_CAO_CAP_NHAT.txt              ← báo cáo sau mỗi lần chạy
├── 01_DOANH_THU/
│   ├── 01_Doanh_Thu_Ngay/             S03 · revenue-report-group-by-date*.xlsx     [BẮT BUỘC]
│   ├── 02_Target/                     S00 · config_targets.csv                    [BẮT BUỘC]
│   ├── 03_POS_Hoa_Don/                S02 · accounting_sale T8.2026.xlsx           [BẮT BUỘC]
│   ├── 04_POS_Ban_Hang/               S01 · Báo cáo bán hàng tháng 8.2026.xlsx     [BẮT BUỘC]
│   ├── 05_Doanh_Thu_Thang/            S04 · Tháng 8. 2026 revenue.xlsx  (đối soát)
│   └── 06_Booking_Tiec/               S07 · NOIRE Booking Tiec Sales 2026.xlsx
├── 02_SAN_PHAM/01_BOM_COGS/           S05 · NOIRE_COGS_CHUAN_ALL_BRANDS_2026_CleanData.xlsx
├── 03_MARKETING/
│   ├── 01_Meta_Ads/                   S08 · 2026-08_report.xlsx
│   ├── 02_Google_Ads/Tháng 8.2026/    S09 · Báo cáo chiến dịch.xlsx + cụm từ + cửa hàng
│   ├── 03_Social/
│   │   ├── 01_Fanpage/                S18 · Facebook_Tong_hop_*.xlsx   (mẫu _MAU_Facebook_Tong_hop.xlsx)
│   │   └── 02_Tiktok/                 S22 · TikTok_Tong_hop_*.xlsx     (mẫu _MAU_TikTok_Tong_hop.xlsx)
│   ├── 04_Ngan_Sach/                  S10 · NOIRE_MKT_*Checked*.xlsx
│   ├── 05_Promotion_Ke_Hoach/         S16 · NOIRE_Promotion_Pre-Analysis*.xlsx | .xlsm (mỗi quý một file)
│   ├── 06_Promotion_Ket_Qua/          S17 · NOIRE_Bao_Cao_Hieu_Qua_LTO*.xlsx
│   └── 07_Campaign_Tracking/          S23 · Campaign_Tracking_2026.xlsx (mẫu _MAU_Campaign_Tracking.xlsx) → M7.2
├── 04_CRM/
│   ├── 01_Voucher_iPOS/               S11 · exportVoucherLogOfCampaign_*.xlsx
│   ├── 02_Zalo_OA/                    S12 · OA Zalo T8.2026.xls
│   ├── 03_Member/                     S13 · CRM_Dashboard_*.xlsx       (mẫu _MAU_CRM_Member.xlsx)
│   └── 04_KPI_CRM/                    S14 · *KPI CRM*.xlsx
└── 05_DOI_TAC/
    ├── 01_Danh_Muc/                   S15 · NOIRE_Doi_Tac_Partner_Aggregator.xlsx (danh mục Partner + Aggregator)
    ├── 02_eVoucher_Doi_Tac/           S21 · eVoucher*_T8.2026.xlsx (mỗi brand một file)
    └── 03_Aggregator/                 S19 · NOIRE_Aggregator_Theo_Thang.xlsx (số aggregator theo tháng → brand)
```

Git chỉ lưu **cấu trúc thư mục + README**; file Excel thô không bao giờ lên GitHub.

---

## 3. Bốn nhịp nộp file

| Nhịp | Nghĩa | Nguồn |
|---|---|---|
| `monthly` | **Một file mỗi tháng**, tháng nằm trong tên file | POS hoá đơn · POS bán hàng · Doanh thu tháng · Meta · Zalo OA · Aggregator · eVoucher |
| `monthly_folder` | **Một thư mục mỗi tháng** `Tháng N.YYYY/` | Google Ads |
| `cumulative` | Một file luỹ kế — xuất lại **từ đầu kỳ** rồi thả đè | Doanh thu ngày · Booking · Voucher · CRM Member · Facebook/TikTok tổng hợp |
| `config` / `quarterly` | Sửa khi có thay đổi | Target · BOM · Ngân sách · KPI CRM · Đối tác |

**Tháng được đọc từ tên file** — `T8.2026`, `tháng 8.2026`, `2026-08`, `T8-2026`. Đổi tên mất
tháng thì file bị **bỏ qua** và báo cáo ghi rõ dưới dòng *“không đọc được tháng từ tên file”*.

---

## 4. Hệ thống tự làm gì khi thấy file mới

`update.py` giữ dấu vân tay từng file ở `_cache/l0_manifest.json` — chữ ký (kích thước + giờ sửa)
để soát nhanh, **hash nội dung (sha256)** để quyết định. Chép lại / mở rồi đóng một file làm đổi
giờ sửa nhưng nội dung y nguyên → **không dựng lại**. So với lần trước rồi **chỉ dựng lại phần bị
ảnh hưởng**:

| File thay đổi | Dựng lại |
|---|---|
| Doanh thu ngày · Target | `tools/tracking.py` → phần `tracking` của **mọi tháng** + lane POS luỹ kế |
| POS hoá đơn / bán hàng tháng N | phần `pos` của **tháng N** + lane POS luỹ kế |
| Meta Ads tháng N | phần `meta` của tháng N |
| Google Ads / Fanpage / Zalo OA / AGG / eVoucher tháng N | đúng phần đó của tháng N |
| Member · Booking (luỹ kế) | phần tương ứng của mọi tháng |
| Voucher · KPI CRM · Đối tác · Ngân sách · Pre-Analysis | lane Marketing luỹ kế |
| Campaign Tracking (S23) — hoặc BẤT KỲ phần tháng nào dựng lại | `tools/campaign.py` → `data_input/03_campaign.xlsx` (M7.2 đo lại mọi chương trình) |

Sau đó luôn chạy `tools/export_derived.py` (nếu lane luỹ kế chạy) và loader Node → 16 chốt QA.

**Bước nào lỗi thì không ghi nhớ thay đổi** — lần chạy sau tự làm lại. Không có chuyện
“lỗi một lần là mất cập nhật vĩnh viễn”. Loader Node được gọi với `--strict` nên lỗi của nó
cũng tính là lỗi (chạy tay `npm run dev` thì vẫn giữ bản cũ để app mở được).

**Chốt gác cổng 1–4 đỏ → không ghi `src/data/`.** Loader kiểm chốt TRƯỚC khi ghi và ghi
năm file JSON nguyên khối (ra `.tmp` rồi mới tráo) — không có bộ JSON nửa mới nửa cũ.

### 4a. Cách ly file sai mẫu — `L0_input/_REJECT/`

File **mới hoặc vừa thay** mà thiếu sheet/cột bắt buộc (`SCHEMA` ở `tools/l0_registry.py`)
bị **dời** vào `L0_input/_REJECT/<cùng đường dẫn>` kèm file `….LY_DO.txt` ghi lỗi và cách xử lý.

Vì sao dời chứ không chỉ báo: hai file cùng tháng thì hệ thống lấy **bản mới nhất** — bản sai
vừa thả sẽ thắng bản đúng đang dùng và dashboard đọc ra số hỏng.

| Trường hợp | Hệ thống làm |
|---|---|
| File sai mẫu, tên mới | dời vào `_REJECT/`, bản đúng đang có vẫn được dùng |
| File sai mẫu **đè** lên bản đúng cùng tên | dời vào `_REJECT/`, **giữ số đã dựng** (không dựng lại tháng đó với nguồn rỗng) tới khi có bản đúng thay |
| File sai mẫu đang mở trong Excel / đang chép dở | chưa dời, **không dựng**, báo trong `_BAO_CAO_CAP_NHAT.txt`; lần chạy sau soát lại |
| File lạ (không khớp mẫu tên nguồn) | **không đụng** — đó là đầu vào của cổng chuẩn hoá `tools/l0_ingest.py` |
| File đã dùng ổn định từ trước | **không đụng**, kể cả khi mẫu chuẩn thay đổi — chỉ báo trong mục “FILE SAI MẪU” |

Xử lý: xuất lại đúng mẫu, thả vào thư mục nguồn như bình thường. File trong `_REJECT/` xoá được
khi đã thả bản đúng. `tools/l0_setup.py --import` không bao giờ dời thư mục `_…` (hệ thống).

**Chế độ tự động chờ file chép xong**: phải thấy hai lần soát liên tiếp giống nhau mới chạy.
File POS 60MB đang chép dở mà dựng ngay là đọc ra Excel hỏng.

---

## 4b. Ba lớp kiểm tra sau mỗi lần cập nhật

Cả ba in trong `L0_input/_BAO_CAO_CAP_NHAT.txt` và trong `python check_input.py`.

| Lớp | Công cụ | Trả lời |
|---|---|---|
| **Kiểm kê** | `tools/l0_report.py` | Nguồn nào chưa có file · tháng nào thiếu · hai file cùng tháng · tên file không đọc được tháng |
| **Mẫu file** | `tools/l0_validate.py` | File có đủ **sheet + cột bắt buộc** không. Mẫu chuẩn của từng nguồn khai ở `SCHEMA` trong `tools/l0_registry.py` và in trong `README.md` của từng thư mục. Tên cột cũ và mới của iPOS đều hợp lệ |
| **Độ đủ tháng** | `tools/month_audit.py [YYYY-MM]` | Có file ≠ đủ số. Kiểm **số ngày** (doanh thu · OA · member), **khớp chéo** POS ↔ Tracking ≤0,5%, file luỹ kế **xuất tới hết tháng** (voucher · booking), fanpage đủ 4 trang, aggregator đã khai hoa hồng. Ra % và danh sách việc còn thiếu |

### Mẫu nhập liệu cho nguồn không có file xuất sẵn

Bốn nguồn do team **tự tổng hợp**, mỗi thư mục có sẵn file mẫu `_MAU_…` (hệ thống bỏ qua mọi file bắt đầu bằng `_MAU_`):

| Thư mục | Mẫu | Vì sao phải dùng mẫu |
|---|---|---|
| `03_Social/01_Fanpage` | `_MAU_Facebook_Tong_hop.xlsx` | **Người xem (reach) không cộng theo ngày được.** Cộng 31 ngày CSV ra NCB T8 = 322.042; số thật cả kỳ = 238.590 — thổi phồng 35%. Phải chép số CẢ THÁNG từ Meta Business Suite |
| `03_Social/02_Tiktok` | `_MAU_TikTok_Tong_hop.xlsx` | TikTok Studio không xuất file số tháng, chỉ chụp màn hình |
| `03_MARKETING/07_Campaign_Tracking` | `_MAU_Campaign_Tracking.xlsx` | Khai báo chương trình · target · chi phí · đối chứng không nằm ở hệ thống nào. **Target phải điền `submitted` TRƯỚC ngày chạy.** Khi chưa có file thật, M7.2 chạy trên chính file mẫu và hiện băng DỮ LIỆU MẪU |
| `04_CRM/03_Member` | `_MAU_CRM_Member.xlsx` | CRM đăng ký không có export — tối thiểu sheet `KPI_Thang` (Tháng · Khách đăng ký) |

---

## 5. Ba quy tắc khi thả file

**❶ Không đổi tên file export.** Tên là nơi duy nhất chứa tháng.

**❷ Thay file = thả bản mới, không cần xoá bản cũ.** Hai file cùng tháng (ví dụ
`accounting_sale T9.2026_ tới 13-09.xlsx` rồi `accounting_sale T9.2026.xlsx`) → hệ thống lấy
**bản sửa gần nhất** và ghi tên bản bị bỏ qua vào báo cáo. **Không bao giờ cộng đôi.**

**❸ Không sửa tay file trong `data_input/`.** Đó là đầu ra — lần cập nhật sau ghi đè.
Ngoại lệ có chủ đích: các sheet khai tay trong `01_master.xlsx` (dim_store · ngân sách ·
pre_analytics · system_*) — hệ thống không bao giờ ghi đè chúng.

---

## 6. Các bẫy đã chặn sẵn trong code

Lỗi đã từng xảy ra trên dữ liệu thật. **Liệt kê để đừng ai gỡ ra.**

### 6a. Bẫy phát hiện khi dựng hệ thống L0 mới (16/09/2026)

| # | Bẫy | Hậu quả nếu không chặn | Chặn ở đâu |
|---|---|---|---|
| A | **Từ T8/2026 iPOS xuất mỗi cửa hàng một sheet**, sheet `Tất cả cửa hàng` nằm CUỐI | Lane cũ đọc sheet đầu = 1 cửa hàng: T8 nạp **5.100/34.534 dòng (15%)** — Menu, khung giờ, khu vực, nhân viên thiếu 85% | `build_hub.read_xlsx_fast` · `build_month.read_pos_sheets`: có sheet tổng thì chỉ đọc sheet tổng |
| B | **iPOS đổi tên cột từ T8**: `Mã hoá đơn→Hoá đơn` · `Số HĐ→Số hoá đơn` · `Thời gian→Ngày` (kèm giờ) · `Phiếu GG→Phiếu giảm giá` · giờ `08:27→7:38` | T8/T9 mất mã hoá đơn + ngày → khung giờ, thứ trong tuần bỏ rơi 2 tháng | `build_hub.COL_ALIAS` · bí danh `want` trong `build_month` |
| C | **Ô CTKM rỗng ghi bằng `​` hoặc chuỗi rỗng** | 25.929 dòng không có CTKM bị đếm là có | làm sạch `Tên CTKM` trước `classify_nature` |
| D | **Cache pickle khoá theo tháng, không theo file** | Thả bản T9 đủ tháng đè bản dở → hệ thống vẫn đọc pickle cũ, dashboard **không bao giờ** thấy số mới | `build_hub.cached(..., src=)` lưu chữ ký file + `READER_VERSION` |
| E | **Hai file cùng tháng** | `glob` nạp hết → cộng đôi; `next()` chọn ngẫu nhiên → có lúc lấy bản dở | `monthly_lib.l0_by_month` lấy bản mới nhất, báo bản bị bỏ |
| F | **Tên file tracking/doanh thu ngày nối cứng** (`…T1-T7.xlsx`) | POS xuất lại thành `…T1-T9_to 13.09.xlsx` → doanh thu ngày đứng ở T7 | `l0_latest("S03_daily")` |
| G | **Tracking Sales không phải file thô** — sinh từ doanh thu ngày; có 2 bản khác nhau cùng thư mục (`_moi (13.09)`) | Dashboard đọc bản 08/09, T9 net = 0 | `tools/tracking.py` tự dựng từ `L0_input` mỗi lần có file doanh thu ngày mới |
| H | **Số thứ tự thư mục bị đánh lại** (`3. Digital Ads → 6. Digital Ads`) | 5 nguồn chết nhiều tháng, lane chỉ ghi “chưa có dữ liệu” | cây `L0_input` cố định + `resolve_path` bỏ qua số thứ tự |
| I | **Hai lane luỹ kế ghi `data.json` ở gốc mà không ai đọc** | ~25 bảng dashboard đóng băng từ 10/09 | `tools/export_derived.py` đưa vào `data_input/` |
| J | `\bT8` không khớp `OneU_T8.2026` (gạch dưới là ký tự chữ) | eVoucher báo “không đọc được tháng” | `(?<![A-Za-z])T` trong `MONTH_RX_T` |

### 6b. Bẫy cũ (giữ nguyên)

| # | Bẫy | Nguồn | Chặn ở đâu |
|---|---|---|---|
| 1 | **Dòng tổng lẫn trong dữ liệu.** File tháng có `TỔNG`, file bán hàng có `Tổng`, bảng kê ghi `TẠI CHỖ` ở cột *Mã hoá đơn*. Nạp nhầm là nhân đôi | S01·S02·S04 | `TOTAL_MARKERS` + lọc `Số HĐ` rỗng |
| 2 | **Tên cửa hàng không nhất quán.** SKC là “Café & **Lounge**”; The Crest có **hai dấu cách** | mọi nguồn | cột `aliases` ở `01_master.xlsx → dim_store` |
| 3 | **Ô rỗng iPOS là `​`.** Không làm sạch thì tỷ lệ nhận diện khách báo 100% thay vì 8,6% | S02 | `clean_txt()` |
| 4 | **Export Meta có cả dòng `campaign` lẫn `adset`.** Cộng tất cả ra 549tr thay vì 157tr | S08 | lọc `Cấp độ phân phối = campaign` |
| 5 | **File `OA Zalo *.xls` thật ra là HTML** — đừng mở rồi lưu lại bằng Excel | S12 | `read_html_table()` |
| 6 | **Chiến dịch tuyển dụng nằm chung tài khoản ads** (6,99tr) | S08 | `HR_PAT` |
| 7 | **Báo cáo Google cụm từ có xen dòng `Tổng số:`** — nhân đôi chi phí | S09 | `IS_TOTAL` |
| 8 | **Sheet ngân sách có dòng trống giữa tiêu đề và bảng** | S10 | `find_header()` |
| 9 | **Ad Cost Ratio phải tính trên tháng trọn kỳ** | S08+S02 | `coverage[].partial` |

---

## 7. Thêm một nguồn mới

1. Thêm một khối vào `SOURCES` trong **`tools/l0_registry.py`** (id · dir · pattern · cadence · month_regex · since).
2. `python tools/l0_registry.py` → `python tools/l0_setup.py` — có ngay thư mục + README.
3. Viết hàm đọc trong `tools/build_month.py`, thêm một dòng vào `BUILDERS` kèm id nguồn —
   `update.py` tự biết khi nào chạy lại nó.
4. Khai sheet mới ở `data_contract.json`, chạy `python tools/gen_contract_doc.py`.

Không bước nào cần sửa `update.py` hay `check_input.py`.

---

## Cổng chuẩn hoá đầu vào — file lạ vào ĐÚNG file chuẩn *(23/09/2026)*

**Quy tắc:** thả một file Excel không đúng quy chuẩn vào thư mục nguồn thì **file đó là nơi LẤY
dữ liệu, còn nơi ĐỔ dữ liệu vào vẫn là file chuẩn** — không dựng lane đọc riêng, không thiết kế
một khối giao diện mới cho từng dạng file. Màn hình chỉ đọc schema chuẩn, nên số của mọi nguồn
vẫn so được với nhau.

```
thư mục nguồn ─┬─ file đúng mẫu tên chuẩn ─────────────► đọc thẳng
               └─ file LẠ ── tools/l0_ingest.py ──┐
                              (adapter theo dạng) │
                                                  ▼
                              ánh xạ sang ĐÚNG CỘT của file chuẩn
                              · file chuẩn THẮNG từng ô
                              · chỉ điền vào ô TRỐNG, thêm dòng chưa có
                              · ô file lạ không ghi rõ → ĐỂ TRỐNG + "cần bổ sung"
                              · ghi rõ nguồn (file · sheet) để đối chiếu ngược
```

| Việc | Lệnh |
|---|---|
| Xem thư mục nào có file lạ, chuyển được gì, thiếu gì | `python tools/l0_ingest.py` |
| Xem một nguồn | `python tools/l0_ingest.py S15` |
| Kiểm kê đầu vào (có mục Cổng chuẩn hoá) | `python check_input.py` |
| File chuẩn thiếu cột mà mẫu đã có (mẫu lớn lên) | `python tools/partner_template.py --sync-cols` |

**Thêm một dạng file mới:** viết `detect()` + `convert()` trong `tools/l0_ingest.py`, thêm MỘT dòng
vào `ADAPTERS`. Không sửa màn hình, không thêm bảng mới ở loader.

**Tuyệt đối không đoán:** không suy ngày từ "Tháng 10", không đoán mã cửa hàng, không đổi nền số
(báo cáo team ghi Sales *trước VAT* thì KHÔNG tự đổi thành Tổng tiền hoá đơn — để trống, ghi số
báo cáo vào ghi chú để người khai điền đúng nền).

**Đang có bộ chuyển:** `S15_partnership` (danh mục đối tác kiểu cũ) · `S19_aggregator` (báo cáo
Promotion-AGG của team, mục C2). File lạ ở nguồn chưa có bộ chuyển được liệt kê rõ là **KHÔNG
được đọc** — không im lặng bỏ qua.
