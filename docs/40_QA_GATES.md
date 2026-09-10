# 40 · 15 CHỐT QA — Ý NGHĨA VÀ CÁCH XỬ LÝ KHI BÁO ĐỎ

> Chốt QA không phải để trang trí. **Chốt nào đỏ nghĩa là có một nhóm số không được tin.**
> Kết quả in ra mỗi lần `npm run build:data` và hiển thị ở tab **D1**.

---

## Bảng 15 chốt — lane chính (`scripts/build-data.mjs`)

| # | Chốt | Ngưỡng | Gác cổng | Hiện tại |
|---|---|---|---|---|
| 1 | Đủ sheet và cột bắt buộc | bắt buộc | ⛔ dừng build | ✅ 51 sheet |
| 2 | Mọi cửa hàng khớp `dim_store` | 100% | ⛔ dừng build | ✅ 11 cửa hàng |
| 3 | `tier` hợp lệ | 4 giá trị chuẩn | ⛔ dừng build | ✅ |
| 4 | Không trùng khoá `month × store` | 0 khoá trùng | ⛔ dừng build | ✅ 74 dòng |
| 5 | Giá trị doanh thu hợp lệ (`net > 0`) | bắt buộc | cảnh báo | ✅ |
| 6 | Không có tháng thiếu trong chuỗi | liền mạch | cảnh báo | ✅ |
| 7 | Rollup khớp báo cáo tháng | lệch < 0,5% | cảnh báo | ✅ 74/74 dòng |
| 8 | **Độ phủ giá vốn ≥ 90%** | 90% | cảnh báo | ✖ **46,3%** |
| 9 | Nhãn bản chất CTKM hợp lệ | 4 nhãn chuẩn | cảnh báo | ✅ |
| 10 | Nhận diện brand từ tên chiến dịch | < 5% chi tiêu chưa gán | cảnh báo | ✅ 4,5% |
| 11 | Voucher khớp hoá đơn | > 90% | cảnh báo | ✅ 99,0% |
| 12 | **Social:** khoá `month × platform × brand × page` hợp lệ | 0 khoá trùng | cảnh báo | ✅ 4 kênh |
| 13 | **Social:** `engage ≤ audience` · `followers` khớp `net_follow` | lệch ≤ 10% | cảnh báo | ✅ |
| 14 | **Hợp đồng file:** sheet quen · dòng đúng tháng của file | 0 sheet lạ, 0 dòng lạc | cảnh báo | ✅ |
| 15 | **Khối POS phụ khớp `store_month`** | lệch < 2% | cảnh báo | ✅ 8 tháng |

**Trạng thái hiện tại: 14/15 đạt.** Chốt duy nhất đỏ là #8 — độ phủ giá vốn.

**Chốt 1–4 gác cổng: fail thì build DỪNG** (thoát mã 1) và Vercel báo lỗi deploy. Đây là chủ
ý — thà không deploy còn hơn phát tán số sai. Chốt 5–15 fail thì vẫn build nhưng hiện đỏ ở D1.

Chốt 12–13 **chỉ xuất hiện khi đã nộp `social_month`**. Chưa nộp thì khối social im lặng thay
vì báo đỏ giả — một chốt không có dữ liệu để kiểm thì không phải chốt trượt.

> **Lane ETL cũ** (`build_hub.py` / `build_mkt.py`) có bảng chốt riêng, đánh số khác và ghi ra
> `qa_log_*.txt`. Phần "Chi tiết từng chốt" bên dưới mô tả cả hai — chỗ nào nói `build_hub.py`
> là chốt của lane cũ.

---

## Chi tiết — chốt lane chính

### #1 · Đủ sheet và cột bắt buộc — **gác cổng**
**Kiểm tra gì:** mọi sheet có `must: true` trong hợp đồng đều có mặt, và mọi cột `req` đều tồn tại.
**Khi đỏ:** log in ra đúng sheet nào thiếu cột nào. Thường là gõ sai tên cột khi nhập tay,
hoặc chép gói tháng từ bản cũ hơn hợp đồng hiện tại.

### #2 · Mọi cửa hàng khớp `dim_store` — **gác cổng**
**Kiểm tra gì:** mọi mã `store` xuất hiện ở `store_month` · `daily` · `zone` · `staff` ·
`recon` · `dwell` · `dim_target` đều có trong `dim_store`.
**Khi đỏ:** log in ra danh sách mã chưa khai. Thêm dòng vào `dim_store`, và thêm alias tên
POS vào `STORE_ALIAS` trong `tools/monthly_lib.py`.
**Không được** sửa bằng cách nới lỏng quy tắc khớp — đó là cách SKC từng rớt khỏi NCB.

### #3 · `tier` hợp lệ — **gác cổng**
`tier ∈ flagship | core | satellite | popup`. `flagship`/`core` được tính mặc định;
`satellite`/`popup` chỉ hiện khi bật "tất cả cửa hàng". Gõ sai một tier là cả một cửa hàng
biến mất khỏi mọi con số mặc định.

### #4 · Không trùng khoá `month × store` — **gác cổng**
**Khi đỏ:** một tháng bị nộp hai lần với hai tên file **không** theo quy ước `_v2`, hoặc một
gói tháng chứa dòng của tháng khác (xem thêm chốt #14). Khoá trùng thì dòng sau ghi đè dòng
trước, nên số vẫn dựng được — nhưng bạn không biết bản nào đã thắng.

### #5 · Giá trị doanh thu hợp lệ
`net > 0` và `guest`/`tc` không âm. Cửa hàng chưa khai trương có dòng toàn số 0 trong file
tracking — ETL đã lọc sẵn, nếu chốt này đỏ nghĩa là dòng 0 lọt qua bằng con đường khác.

### #6 · Không có tháng thiếu trong chuỗi
**Kiểm tra gì:** với mỗi store, từ tháng đầu tới tháng cuối không hụt tháng nào.
Store `popup` được loại khỏi kiểm tra.
**Khi đỏ:** thiếu file tháng, hoặc store thật sự đóng cửa tạm.

### #7 · Rollup khớp báo cáo tháng — **chốt quan trọng nhất**
**Kiểm tra gì:** `recon.net_bill` (gộp từ bảng kê hoá đơn) so với `recon.net` (số tháng),
lệch < 0,5%. Tháng chưa trọn kỳ tự động bị loại.
**Vì sao:** đây là chốt duy nhất bắt được lỗi ETL im lặng — sai cột, sót file, lọc nhầm sheet.
**Khi đỏ:** mở bảng `recon` ở tab D1, truy đúng `month × store`, so ba con số `net` ·
`net_item` · `net_bill`.
- Cả `net_item` và `net_bill` cùng lệch → thiếu file hoặc sai kỳ.
- Chỉ `net_item` lệch → chiết khấu cấp hoá đơn chưa phân bổ xuống dòng món *(đã từng gặp: The Mett lệch 828.000đ)*.
- `net_bill` bỏ trống → chưa chạy khối POS cho tháng đó; `d_bill` sẽ là `—`, không phải −100%.

### #8 · Độ phủ COGS ≥ 90% — **chốt đang đỏ**
**Hiện tại 46,3% doanh thu món.** 1.200/1.439 SKU chưa có giá vốn.
Nhóm thiếu tập trung: món Nhật NJFB · combo · dịch vụ/phụ thu · một số đồ uống thông dụng.
Bảng COGS có 451 dòng nhưng chỉ 323 mã món duy nhất (NCB và NDC dùng chung nhiều món).

**Đây không phải lỗi mapping — là thiếu dữ liệu gốc.** Ba hệ quả đã cài trong code:
1. M2 hiển thị độ phủ ngay cạnh mọi chỉ số biên lợi nhuận;
2. Ma trận Menu Engineering chỉ xếp hạng món có COGS, còn lại vào ô “Chưa xếp hạng”;
3. **Không tính Prime Cost toàn chuỗi** cho tới khi độ phủ ≥ 90%.

**Cách gỡ:** Bếp + Cost control bổ sung BOM, ưu tiên nhóm Nhật (~500tr/tháng doanh thu chưa có giá vốn).

**Chất lượng phần đã có cũng cần rà:** 44 món COGS > 45%, và **2 món có giá vốn ≥ 100% giá bán
chưa VAT — tức đang bán lỗ**. Xem `cogs_flags` ở tab M2.

### #9 · Nhãn bản chất CTKM hợp lệ
**Kiểm tra gì:** mọi giá trị `nature` nằm trong `COMMERCIAL | INTERNAL | PARTNER | LOYALTY`.
**Khi đỏ:** có tên CTKM mới không khớp regex nào trong `NATURE_RULES`
(`tools/build_month.py`) và rơi ra ngoài bốn nhãn. Thêm regex vào đúng nhóm.
**Cẩn trọng:** gán nhầm một CTKM nội bộ thành `COMMERCIAL` sẽ thổi phồng chi phí marketing —
T7/2026 riêng nhóm INTERNAL đã là 166,4tr = 75% tổng chi phí ưu đãi.

### #10 · Nhận diện brand từ tên chiến dịch
**Kiểm tra gì:** < 5% chi tiêu Meta chưa gán được brand.
**Khi đỏ:** thêm mẫu vào `BRAND_PAT` trong `tools/build_month.py`, hoặc yêu cầu team đặt tên
chiến dịch có tiền tố brand.

### #11 · Voucher khớp hoá đơn
**Kiểm tra gì:** `Mã giao dịch` của voucher đã dùng có tìm thấy trong `bill_index.pkl` không, **trong phạm vi có bảng kê**.
**Hiện 99,0%.** 873 lượt không khớp đều là voucher dùng năm 2025 — giới hạn phạm vi, không phải lỗi.
**Khi bỏ trống:** sheet `voucher_join` chưa được nộp cho tháng đó.

---

### #12 · Social — khoá và nhãn hợp lệ

**Kiểm tra gì:** `month × platform × brand × page` không trùng · `platform` nằm trong
`FACEBOOK | TIKTOK | INSTAGRAM | YOUTUBE | ZALO` · `month` đúng dạng `YYYY-MM`.
**Khi đỏ:** thường là nộp trùng tháng hoặc gõ thường/sai tên nền tảng. Khoá trùng thì
**dòng sau ghi đè dòng trước**, nên số vẫn dựng được nhưng có thể mất một kênh.

### #13 · Social — số liệu tự nó nhất quán

**Kiểm tra gì:** (a) `engage ≤ audience` — tương tác không thể nhiều hơn mẫu số tiếp cận;
(b) chênh lệch `followers` giữa hai tháng liền kề khớp `net_follow` đã khai, sai số ≤ 10%
*(bỏ qua khi nền dưới 20 follower — trên nền nhỏ, lệch vài đơn vị là chuyện thường)*.

**Vì sao đáng giá:** đây là chốt bắt lỗi **dán lệch cột** — lỗi phổ biến nhất của bảng
làm tay, và là lỗi mà mắt thường gần như không phát hiện được vì con số vẫn "trông hợp lý".
Hai phép thử này không cần đối chiếu nguồn ngoài nào.

**Khi đỏ:** mở `data_input/monthly/<tháng>.xlsx`, sheet `social_month`, so lại thứ tự cột.

---

### #14 · Hợp đồng file — sheet quen và dòng đúng tháng

**Kiểm tra gì:** (a) mọi tên sheet trong `data_input/` đều có khai ở `data_contract.json`;
(b) mọi dòng trong `monthly/YYYY-MM.xlsx` có ghi tháng thì tháng đó phải khớp tên file.

**Vì sao đáng giá:** hai lỗi này đều **im lặng**. Gõ sai tên sheet (`store_months` thay vì
`store_month`) thì loader bỏ qua và bảng đó rỗng mà không ai biết. Còn dòng lạc tháng — chép
gói tháng cũ sang tháng mới rồi quên xoá cột `month` — sẽ **nhân đôi số của tháng bị chép**.

**Khi đỏ:** log in ra tên sheet lạ và tối đa ba dòng lạc tháng kèm đường dẫn file. Cách sửa
gọn nhất cho dòng lạc tháng là **xoá trắng cột `month`** — loader tự điền từ tên file.

### #15 · Khối POS phụ khớp `store_month`

**Kiểm tra gì:** tổng `net` của `daypart` và của `channel` theo từng tháng so với tổng
`store_month` của chính tháng đó, lệch < 2%.

**Vì sao có chốt này:** T8/2026 đã dính đúng cái bẫy nó chặn. `store_month` lấy từ file
Tracking Sales (đủ 31 ngày) trong khi `daypart`/`channel` vẫn là bản dựng từ export thiếu
ngày — **hai khối lệch nhau 49,5%** mà không chốt nào kêu. Biểu đồ M3 im lặng vẽ sai một nửa
tháng, và không có cách nào phát hiện bằng mắt vì hình dạng biểu đồ vẫn "trông hợp lý".

**Khi đỏ:** chạy lại `python tools/build_month.py <tháng>` để dựng lại khối POS từ bảng kê
hoá đơn của đúng tháng đó.

---

## Ba chốt nên bổ sung (chưa có)

| Đề xuất | Kiểm tra gì | Vì sao |
|---|---|---|
| #16 · Đối soát `net_item` ↔ `net_bill` | hai cột trong `recon` lệch nhau bao nhiêu | Hiện chỉ đối soát bill ↔ `store_month`; item lệch sẽ không ai biết |
| #17 · Độ phủ target | store nào chưa có target trong kỳ | M0 hiển thị "—" nhưng không báo động |
| #18 · Ngưỡng giải ngân ngân sách | thực chi vs plan đã tới hạn ngoài 95–105% | Zalo Ads đang 0% mà không có chốt nào bắt |

---

## Nguyên tắc chung khi một chốt đỏ

1. **Không sửa dữ liệu raw** (NT1). Sửa ở tầng L1/L2 — bảng mapping hoặc luật làm sạch.
2. **Không nới lỏng ngưỡng để chốt xanh.** Ngưỡng là điều khoản đã chốt, không phải tham số điều chỉnh.
3. **Chốt 1–4 đỏ thì build tự dừng** — không có gì để gửi ra ngoài. Đừng gỡ `process.exit(1)`
   ở cuối `build-data.mjs` để "deploy tạm"; đó chính là cơ chế ngăn phát tán số sai.
4. **Không gửi số doanh thu ra ngoài khi chốt #7 hoặc #15 đỏ.** Hai chốt này gác cổng cho
   toàn bộ con số doanh thu: #7 bắt lệch giữa bảng kê và số tháng, #15 bắt lệch giữa khối POS
   phụ và `store_month`.
5. Chốt #8 đỏ thì vẫn dùng được hệ thống — **chỉ không được trình bày CM%/Prime Cost như thể
   là toàn bộ**.
