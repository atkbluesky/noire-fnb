# M7 · PRE-ANALYTICS — PLAN

| | |
|---|---|
| **Câu hỏi** | Nếu chạy chương trình này thì sẽ ra sao? |
| **`activeView`** | `m7` |
| **View** | `src/views/PreAnalyticsView.tsx` |
| **ETL** | `build_mkt.py` §6 |
| **Giai đoạn** | P5.5 |
| **Trạng thái** | ⚠️ **Hiển thị được kế hoạch, nhưng `Growth%` vẫn là ô gõ tay** |

---

## 1. Vị trí kiến trúc — vì sao không phải tầng L5

**Pre-analytics là nhánh thứ hai của L3, không phải một tầng nối tiếp sau L4.**

Chuỗi L0→L4 là **mô tả** — trả lời “chuyện gì đã xảy ra”.
Pre-analytics là **dự báo** — trả lời “nếu chạy chương trình này thì sẽ ra sao”.
Hai nhánh dùng chung L1, L2, L3, chỉ khác hướng thời gian.

```
                    ┌──► L4-A  OUTPUT ACTUAL      (nhìn lại)
L2 FACT ──► L3 ─────┤
                    └──► L3.5 BASELINE ENGINE
                              ▼
                         M6-PLAN  Pre-Analytics    (nhìn tới)
                              ▼
                         Cổng duyệt ROI ≥ 0
                              ▼
                         ghi vào dim_campaign + dim_target  (quay lại L1)
                              ▼
                         [campaign chạy] → M7-ACTUAL: đo lift thật vs store đối chứng
                              ▼
                         lib_benchmark ──HỌC LẠI──► L3.5 BASELINE ENGINE
```

**Nếu đặt sau L4, nó sẽ đọc số đã tổng hợp và mất chi tiết.** Ước tính “TC khung sáng 7–11h tại NCB”
không thể rút ra từ bảng tổng tháng — phải đọc thẳng từ `fact_bill`/`fact_item`.

## 2. Chuỗi trace hiện tại

```
S16 Pre-Analysis Q3 (sheet "1. Tổng hợp (Master)", header=3)
   → pre_q3[] : name · brand · kind · roi · nc
   → pre_stat : n · neg · neg_nc · pos_nc          ← CHƯA DÙNG (view tự đếm lại)
      → PreAnalyticsView
```

## 3. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Chương Trình Đề Xuất · Dự Báo Hiệu Quả Âm · Đóng Góp Dương/Âm Ước Tính |
| **Phân bố hiệu quả đóng góp ròng dự báo** | |
| **Danh sách chi tiết & khuyến nghị cổng duyệt CTKM** | nhãn: Nên duyệt chạy · Biên mỏng · Xem lại cơ chế |

**Q3/2026: 26 chương trình đề xuất, 14 chương trình dự báo hiệu quả tài chính âm.**
Đây là dấu hiệu tốt — pre-analytics đang làm đúng chức năng bộ lọc.

## 4. Vì sao trước đây không thấy module này

Dữ liệu Pre-Analytics **đã được nạp từ đầu**, nhưng chỉ xuất hiện dưới dạng
**một dòng cảnh báo ở R1**, không có màn hình riêng.

Đây là lỗi thiết kế: một khối dữ liệu quan trọng bị “chôn” trong phần tổng hợp.
Wireframe v3 có thiết kế M7-Plan như một tab con, nhưng khi dựng dashboard thật thì chỉ dựng nhánh Actual.
**M6 giờ là màn hình riêng.**

## 5. ⛔ Điểm yếu duy nhất — nằm ở đầu vào

File Pre-Analysis có cấu trúc rất tốt: 6 sheet theo loại chương trình, mỗi dòng chạy từ
`Est. TC → Base Sales → Growth% → Target Sales → Net ex-VAT → COGS% → ROI → Net Contribution`.
**Logic đúng, không cần thiết kế lại.**

Nhưng chính bảng chú giải màu trong file đã tự thừa nhận: chữ xanh = *nhập tay từ plan*,
nền cam = *đề xuất do người phân tích tự đưa*, chữ đen = *công thức tự tính*.
**Ba biến quan trọng nhất — `Est. TC`, `Base Sales`, `Growth%` — đều là ô nhập tay.**

Độ tin cậy của các con số ROI âm phụ thuộc hoàn toàn vào `Growth%` gõ tay 10–20%.
Nếu Growth% thật là 5%, danh sách chương trình nên loại bỏ sẽ dài hơn nhiều.

> **Nhiệm vụ của hệ thống: biến ô xanh và ô cam thành ô đen.**

## 6. L3.5 Baseline Engine — sáu đầu ra cần dựng

| # | Đầu ra | Cách tính | Thay ô gõ tay nào | Dữ liệu đã có? |
|---|---|---|---|---|
| 1 | **Base TC / Guest / Net** | run-rate đúng store × khung giờ × ngày trong tuần, trung vị 4–8 tuần gần nhất | `Est. TC` · `Base Sales` | ✅ `fact_bill` |
| 2 | **Chỉ số mùa vụ** | hệ số tháng/tuần rút từ lịch sử | hiệu chỉnh `Base Sales` | ✅ 8 tháng *(cần thêm 2025)* |
| 3 | **Attach rate & mix** | tỷ lệ hoá đơn có mua nhóm món mục tiêu | ước lượng số suất bán | ✅ `fact_item` |
| 4 | **COGS% thực** | bình quân gia quyền theo sản lượng thực | `COGS %` | ⚠️ chỉ phủ 46,3% |
| 5 | **Uplift benchmark** | lift thực tế của campaign cùng loại × cùng brand đã chạy | **`Growth %`** | ⛔ **cần `lib_benchmark`** |
| 6 | **Tỷ lệ ăn lẫn** | so doanh thu nhóm món cũ kỳ chạy vs kỳ nền | phần “incremental thật” | ✅ `fact_item` |

**Đầu ra số 5 là mấu chốt.** Thay vì gõ `Growth% = 15%` theo cảm tính, hệ thống trả lời:
*“Gift-FOC tại NDC đã chạy 4 lần, lift thực tế trung vị 8,2%, khoảng 4–13%, mẫu nhỏ nên thận trọng.”*

**Bốn đầu ra 1·2·3·6 đã đủ dữ liệu để dựng ngay** — không cần chờ `lib_benchmark`.

## 7. `lib_benchmark` — thư viện học

Bảng tích luỹ, mỗi campaign kết thúc ghi thêm một dòng.
**Đây là tài sản dài hạn có giá trị nhất mà hệ thống tạo ra** — càng chạy lâu càng đắt giá,
và không đối thủ nào sao chép được.

Cột: `campaign_id · type · brand · store_tier · duration · planned_growth% · **actual_lift%** ·
planned_roi · **actual_roi** · sai_số_dự_báo · ghi_chú_bối_cảnh`.

Câu hỏi quan trọng nhất mà nó phục vụ: **dự báo của chúng ta lệch bao nhiêu — có lạc quan quá mức không?**
Sau 6–8 campaign, nếu sai số luôn dương (Plan > Actual), hệ thống tự áp hệ số hiệu chỉnh thận trọng
vào mọi dự báo về sau.

## 8. Cổng duyệt ba kịch bản

| Kịch bản | Growth% dùng | Ý nghĩa |
|---|---|---|
| Thận trọng | percentile 25 của benchmark | **Sàn — ROI ở đây phải ≥ 0** |
| Cơ sở | trung vị benchmark | Kỳ vọng đưa vào target |
| Lạc quan | percentile 75 | Trần — dùng để tính upside |

**Quy tắc duyệt: ROI ở kịch bản thận trọng ≥ 0 thì được chạy.**
Ngoại lệ duy nhất là chương trình gắn nhãn `BRAND` (thuần nhận diện) — duyệt theo hạn mức ngân sách branding, không theo ROI.

**Chương trình không qua cổng → trả về sửa cơ chế, không phải sửa con số dự báo.**

## 9. Bộ lọc

Brand · Từ · Đến — **chỉ Q3/2026** (`allowedMonths` khai báo trong `App.tsx`).
Bộ lọc brand áp cho toàn bộ danh sách.

## 10. Checklist nâng cấp

- [ ] Dùng **`pre_stat`** *(đã có, chưa dùng)* thay vì view tự đếm lại từ `pre_q3`
- [ ] **Dựng Baseline Engine đầu ra 1·2·3·6** — dữ liệu đã đủ, không cần chờ gì
- [ ] **Dựng `lib_benchmark`** — bắt đầu bằng cách ghi lại lift thật của các campaign đã chạy (S17)
- [ ] **Dựng cổng duyệt 3 kịch bản** với percentile 25/50/75
- [ ] Ghi rõ trên mỗi dòng: con số nào máy tính, con số nào người nhập *(kế thừa bảng chú giải màu của file gốc)*
