# M6 · SOCIAL MEDIA (FANPAGE + TIKTOK)

| | |
|---|---|
| **Câu hỏi** | Kênh sở hữu có đang lớn lên không, và nội dung nào đáng nhân bản? |
| **`activeView`** | `m6` |
| **View** | `src/views/SocialView.tsx` |
| **Loader** | `scripts/build-data.mjs` §5b `buildSocial()` |
| **Nguồn** | `monthly/YYYY-MM.xlsx` — `social_month` *(bắt buộc)* · `social_post` · `social_target`<br>`02_snapshot.xlsx` — `social_format` |
| **ETL** | `tools/build_month.py` — `read_facebook_pages()` |
| **Giai đoạn** | P7.5 |
| **Trạng thái** | ✅ **4 kênh Fanpage · T7 + T8/2026** · TikTok ⛔ chưa có export số |

---

## 1. Chuỗi trace

```
Meta Business Suite  →  export Page Insights   ┐
TikTok Analytics     →  export tổng quan kênh  ┘
        │
        ├─ tools/build_month.py → data_input/monthly/YYYY-MM.xlsx
        │                    sheet social_month  (BẮT BUỘC)
        │                    sheet social_post · social_format · social_target (tuỳ chọn)
        │
        └─ scripts/build-data.mjs §5b buildSocial()
                 → MKT_DATA.social.month           một dòng / tháng × nền tảng × brand × kênh
                 → MKT_DATA.social.platform_month  mức gộp DUY NHẤT được phép
                 → MKT_DATA.social.page            danh mục kênh
                 → MKT_DATA.social.post · .format · .target · .stat
                 → chốt QA #12 · #13
                        → SocialView
```

Khối này **không đi qua lane thô Python**. Dữ liệu Meta/TikTok đã được làm sạch tay
nên vào thẳng lane đã xử lý — xem [`../15_PROCESSED_INPUT_CONTRACT.md`](../15_PROCESSED_INPUT_CONTRACT.md).

---

## 2. ❗ CẤM cộng reach của Facebook với views của TikTok

Đây là cái bẫy gốc của cả module, và nó **không phải sai số — nó là sai bản chất**.

| | Facebook đếm | TikTok đếm |
|---|---|---|
| Tên gọi | *reach* — người tiếp cận | *views* — lượt xem video |
| Đơn vị | **tài khoản duy nhất** | **lượt** |
| Một người xem 5 lần | vẫn là **1** | thành **5** |

Cộng hai cột này ra một KPI “tổng tiếp cận” sẽ tạo ra một con số không tương ứng
với bất kỳ thực thể nào ngoài đời. Nó cũng luôn nghiêng về TikTok, nên mọi so sánh
ngân sách dựa trên nó đều lệch.

**Hệ thống chặn sẵn ở ba tầng:**

1. **Loader** — `audienceOf()` chọn đúng mẫu số cho từng nền tảng và luôn giữ
   `platform` trong khoá gộp. Không tồn tại đường đi nào sinh ra tổng chéo nền tảng.
2. **Kiểu dữ liệu** — mỗi con số tiếp cận đi kèm trường `unit`
   (`"tài khoản tiếp cận"` / `"lượt xem"`), nên view không thể tự bịa nhãn.
3. **`social.stat`** — cố ý **không có** trường `audience` tổng, chỉ có
   `audience_by_platform`. Muốn viết ra một con số tổng thì phải tự cộng bằng tay,
   và lúc đó là một quyết định có ý thức chứ không phải tai nạn.

### Hai chỉ số so chéo nền tảng ĐƯỢC

| Chỉ số | Vì sao hợp lệ |
|---|---|
| **Người theo dõi tăng thêm** (`net_follow`) | “người theo dõi” mang nghĩa giống nhau ở mọi nền tảng |
| **Tỷ lệ tương tác ER** (`engage ÷ audience`) | là tỷ lệ trên chính mẫu số của nền tảng đó, nên đã tự chuẩn hoá |

Màn hình chỉ dùng đúng hai chỉ số này cho biểu đồ gộp. Phần tiếp cận được vẽ
thành **một khung riêng cho mỗi nền tảng**, cố ý không dùng chung trục.

---

## 3. Màn hình hiển thị gì

| Khối | Nội dung | Nguồn |
|---|---|---|
| Thẻ KPI | Người theo dõi cuối kỳ · ER từng nền tảng · nhịp đăng | `social.month` |
| Tăng trưởng | Người theo dõi tăng thêm theo tháng, cột chồng theo nền tảng | `net_follow` |
| Tiếp cận & ER | **Một biểu đồ cho mỗi nền tảng** — cột tiếp cận + đường ER | `audience` · `er` |
| Bảng kênh | Từng (nền tảng × brand × page): follower, tăng, tiếp cận, ER | `social.page` |
| Top nội dung | Bài/video xếp theo tiếp cận, kèm ER và thời lượng xem | `social.post` |
| Định dạng nào ăn | ER theo định dạng, xếp giảm dần | `social.format` |
| Đối chiếu doanh thu | Người theo dõi tăng vs Net Sales trên cùng trục thời gian | `HUB_DATA.store_month` |
| Chốt QA | #12 · #13 hiện ngay trên màn | `MKT_DATA.qa` |

**Trạng thái rỗng.** Khi chưa có `social_month`, màn hình hiện hợp đồng dữ liệu
và hướng dẫn nộp — không dựng biểu đồ rỗng, không sinh số giả.

---

## 4. Chỉ số & công thức

Toàn bộ do loader tính (NT2 — view không được tính lại):

| Chỉ số | Công thức | Ghi chú |
|---|---|---|
| `audience` | `reach` với FB · `views` với TikTok | mẫu số đúng của nền tảng |
| `net_follow` | `follows − unfollows` | `null` nếu chưa khai cột nào |
| `engage` | cột `engage`, nếu trống thì `likes + comments + shares + saves` | chỉ cộng khi có ít nhất một ô được đo |
| `er` | `engage ÷ audience` | chỉ số so chéo nền tảng được |
| `reach_rate` | `reach ÷ followers` | chỉ có nghĩa với Facebook |
| `per_post` | `audience ÷ posts` | |
| `cpm` | `spend × 1000 ÷ audience` | chỉ tính khi có chi boost |

**Follower là số TỒN, không phải số phát sinh.** Màn hình lấy tháng cuối cùng có khai
rồi cộng ngang các kênh — tuyệt đối không cộng dồn qua các tháng.

**Ô trống ≠ 0.** Chỉ số Meta/TikTok không xuất ra thì để trống, màn hiện `—`.
Điền 0 sẽ bị hiểu là “đã đo và bằng không” và kéo sai mọi tỷ lệ trung bình.

---

## 5. Hai chốt QA của khối

| # | Chốt | Bắt lỗi gì |
|---|---|---|
| **12** | Khoá `month × platform × brand × page` không trùng · nhãn nền tảng hợp lệ · tháng đúng `YYYY-MM` | nộp trùng tháng, gõ sai tên nền tảng |
| **13** | `engage ≤ audience` · chênh lệch `followers` giữa hai tháng khớp `net_follow` (±10%, bỏ qua nền dưới 20) | **dán nhầm cột** — lỗi hay gặp nhất ở bảng làm tay |

Chốt 13 là chốt đáng giá nhất của module. Một bảng làm tay hầu như luôn sai theo
kiểu dán lệch một cột, và hai phép thử này bắt được gần hết các trường hợp đó
mà không cần đối chiếu nguồn ngoài.

Cả hai **không phải chốt gác cổng** — sai thì vẫn build, hiện đỏ ở D1 và ngay trên M6.

---

## 6. ❗ Meta đã gỡ vĩnh viễn phần lớn Page Insights API

*Kiểm chứng 2026-09-08 bằng Page Access Token thật, dò từng metric trên v18.0 → v26.0.*

Nếu sau này muốn thay bản xuất tay bằng tự động hoá qua Graph API, phải biết trước:
Meta **xoá hẳn** các metric dưới đây trên **mọi** phiên bản, không phải deprecate
theo version — nên **không thể hạ version để lấy lại**, và không có metric thay thế.

**ĐÃ CHẾT:** `page_impressions*` (mọi biến thể) · `page_posts_impressions` ·
`page_engaged_users` · `page_consumptions*` · `page_negative_feedback*` ·
`page_fans` · `page_fan_adds` · `page_fan_removes` · `page_content_activity*` ·
`page_places_checkin_total` · `page_cta_clicks_logged_in_total` ·
**toàn bộ nhân khẩu học** (`page_fans_gender_age`, `page_fans_city`, `page_fans_country`,
`page_fans_locale`, `page_fans_online_per_day`) · cấp bài viết `post_impressions*` ·
`post_engaged_users` · `post_negative_feedback`.

**CÒN SỐNG (v26.0):** `page_follows` · `page_daily_follows` ·
`page_daily_follows_unique` · `page_daily_unfollows_unique` · `page_post_engagements` ·
`page_total_actions` · `page_views_total` · `page_posts_impressions_organic` ·
`page_video_views*` · `page_actions_post_reactions_*` · cấp bài viết
`post_reactions_by_type_total` · `post_clicks` · `post_clicks_by_type` ·
`post_activity_by_action_type` · `post_video_*`.

**Hai cạm bẫy khi gọi API:**

1. Graph API làm hỏng **TOÀN BỘ** request nếu chỉ **một** tên metric trong
   `metric=a,b,c` không hợp lệ (`(#100)`). Để sót một tên chết là mất trắng cả lô —
   phải dò lẻ khi gặp lỗi này.
2. Tên metric hợp lệ nhưng token thiếu `read_insights` → Meta trả **HTTP 200 với
   `data: []`**, không báo lỗi. Nhìn y hệt “Fanpage không có hoạt động”.
   Phải dùng `/debug_token` đọc `scopes` mới phân biệt được.

Quyền `read_insights` đã bị **ẩn** khỏi Graph API Explorer và App Dashboard nhưng
**chưa bị xoá** — dialog OAuth vẫn chấp nhận. Nghĩa là token dán tay từ Explorer sẽ
không bao giờ có quyền này; đường lấy đúng là **luồng OAuth**, và tài khoản phải có
nhiệm vụ **Analyze** trên Fanpage.

> Hệ quả cho thiết kế: cột `reach`, `impr`, và mọi thứ liên quan nhân khẩu học
> **chỉ có được từ bản xuất tay của Meta Business Suite**. Đừng thiết kế pipeline
> tự động quanh chúng. Cột `followers`, `follows`, `unfollows`, `views`, `engage`
> thì tự động hoá được.

---

## 7. Bộ lọc

Dùng chung thanh lọc của khối II: **Brand · Từ · Đến**.

- Lọc **theo brand** được: mọi bảng, vì `brand` nằm trong khoá của `social_month`.
- Lọc **theo cửa hàng** không được: Fanpage và TikTok là kênh cấp thương hiệu,
  không cấp cửa hàng. Thanh lọc vì thế không hiện ô Phạm vi ở tab này.

---

## 8. Đang chặn bởi gì

| Thiếu | Chặn cái gì |
|---|---|
| `social_month` | toàn bộ màn hình |
| cột `follows` / `unfollows` | biểu đồ tăng trưởng người theo dõi + chốt QA #13 vế sau |
| sheet `social_post` | bảng Top nội dung + suy ra `social_format` |
| cột `spend` | tỷ lệ tiếp cận phải trả tiền, và ghép với M5 Digital Ads |
| cột `watch_avg` | đo chất lượng giữ chân của video |

---

## 9. Checklist nâng cấp

- [ ] Nộp `social_month` cho T1–T8/2026 để có chuỗi so được với doanh thu
- [ ] Bổ sung `follows` / `unfollows` — mở khoá chốt QA #13 và biểu đồ tăng trưởng
- [ ] Nộp `social_post` top ~50 bài mỗi tháng — mở khoá phân tích định dạng
- [ ] Gắn `spend` boost theo bài → tách reach tự nhiên vs reach mua
- [ ] Cập nhật `_stats` → `ads_stat.missing`: bỏ `"TikTok"` khỏi danh sách nền tảng còn thiếu
- [ ] Khi có OAuth Meta: tự động hoá **chỉ** phần metric còn sống ở §6

---

## 10. Liên quan

- Song hành: [`M5_Digital_Ads.md`](M5_Digital_Ads.md) — một bên **mua** lượt tiếp cận, một bên **tự tạo ra**
- Hợp đồng sheet: [`../15_PROCESSED_INPUT_CONTRACT.md`](../15_PROCESSED_INPUT_CONTRACT.md) §4
- Chốt QA toàn hệ: [`../40_QA_GATES.md`](../40_QA_GATES.md)

---

## Nguồn thật của khối này (từ 09/2026)

`05 Data Raw/4. Social Media/Facebook/Tháng N.YYYY/<BRAND>/` — sáu file CSV export từ Meta
Business Suite. ETL ánh xạ tên file sang trường:

| File CSV | Trường | Ý nghĩa |
|---|---|---|
| `Người xem.csv` | `reach` | số **tài khoản** tiếp cận |
| `Lượt xem.csv` | `views` | số **lượt** xem — khác reach, không cộng chung |
| `Lượt tương tác.csv` | `engage` | tương tác với nội dung |
| `Lượt theo dõi.csv` | `follows` | người theo dõi mới |
| `Lượt truy cập.csv` | `profile_views` | lượt truy cập trang |
| `Lượt click vào liên kết.csv` | `clicks` | click ra ngoài |

**BẪY:** các file này mã hoá **UTF-16**, dòng đầu là `sep=,`, dòng hai là tựa đề biểu đồ,
dòng ba mới là header thật. Đọc bằng trình `csv` mặc định ra toàn ký tự rác.

**Bốn kênh đang có:** NCB · NDC · NJFB · và **NOIRE Express · Creative Park** (thư mục `NEC`).
Kênh NEC không thuộc ba brand chính nên gắn `brand = OTHER` — nó vẫn hiện ở chế độ "tất cả"
nhưng không lẫn vào số của brand nào.

**Hai cột luôn trống với nguồn này:** `followers` (số tồn) và `posts` (số bài) — bản xuất tay
của Meta Business Suite không có. Màn hình hiện `—` chứ **không** hiện `0`: `0 bài` là nói
rằng tháng đó không đăng gì, sai hẳn nghĩa. Thẻ KPI đầu tiên tự đổi nhãn thành "Người Theo
Dõi Tăng Thêm" khi chưa có số tồn.

**TikTok:** thư mục `Tiktok/Tháng N.YYYY/` hiện chỉ có ảnh chụp màn hình, chưa có export số.
Khi có, điền vào `social_month` với `platform = TIKTOK` và cột `views` (không phải `reach`).
