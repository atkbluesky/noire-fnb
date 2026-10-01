# M6 — Khả năng kết nối Meta Page API (30/09/2026)

## Kết luận và phạm vi

**Có thể tự động lấy một phần lớn dữ liệu của bốn Fanpage, lưu vào Postgres và phục vụ M6 qua API chạy trên Vercel. Không thể coi API là bản sao đầy đủ của sáu file CSV Meta Business Suite hiện có.** Cần giữ lane import CSV cho chỉ số lịch sử/khác định nghĩa và dùng `null` khi chưa được cấp quyền hoặc API không có metric tương ứng. TikTok là nguồn riêng, không thuộc Meta Page API.

Đây là khảo sát thiết kế, **chưa kiểm chứng bằng Page token của bốn Page**. Trong `.env.local` ở thời điểm khảo sát chỉ có `FB_APP_ID`; `FB_APP_SECRET`, `FB_USER_TOKEN`, `FB_PAGE_ID`, `FB_PAGE_TOKEN` chưa có giá trị. Không nên triển khai cron production hoặc thay nguồn hiển thị trước khi kiểm thử quyền và đối chiếu số thật.

### Bằng chứng Meta

- [Page Insights reference](https://developers.facebook.com/docs/graph-api/reference/page/insights/): cần Page access token của người có task `ANALYZE`, quyền `read_insights` và `pages_read_engagement`. Phần lớn metric cập nhật khoảng một lần/ngày; Insights tối đa hai năm, mỗi truy vấn `since`/`until` không quá 90 ngày; Page cần ít nhất 100 likes. Meta ghi rõ tương tác Reels không nằm trong một số Page Insights.
- [Thông báo Graph API v25 của Meta](https://developers.facebook.com/blog/post/2026/02/18/introducing-graph-api-v25-and-marketing-api-v25/): nhóm Reach/Impressions cũ bị ngừng trên mọi phiên bản trong tháng 6/2026. Meta khuyên chuyển sang `page_total_media_view_unique`, `post_total_media_view_unique`, và `page_media_view`/`post_media_view` cho phân rã paid/organic. **Đó là metric mới, không phải cùng chuỗi Reach cũ.**
- Reference vẫn liệt kê `page_follows`, `page_daily_follows_unique`, `page_daily_unfollows_unique`, `page_post_engagements`, `page_views_total`, `page_media_view`, `page_total_media_view_unique`, `post_media_view`, `post_total_media_view_unique`, `post_clicks_by_type`, `post_reactions_by_type_total`, `post_video_avg_time_watched`. Việc liệt kê không bảo đảm mỗi Page/token sẽ trả dữ liệu; phải probe từng metric.
- [Vercel Cron](https://vercel.com/docs/cron-jobs/) chạy theo UTC và gọi function production qua GET. [Giới hạn hiện tại](https://vercel.com/docs/cron-jobs/usage-and-pricing): Hobby tối đa một lần/ngày cho **mỗi cron**; [Vercel không tự retry cron lỗi và có thể gọi trùng](https://vercel.com/docs/cron-jobs/manage-cron-jobs), nên phải có log, lock và upsert.

## Đối chiếu dữ liệu M6

| Dữ liệu UI/hợp đồng | Nguồn API có thể thử | Mức sẵn sàng | Quy tắc xử lý |
|---|---|---|---|
| Page, brand, tên, bài đăng, ngày, link, định dạng | `/{page-id}`, `/{page-id}/published_posts`, `video_reels` | Khả thi; M8.2 đang đọc một Page, cửa sổ 7 ngày/50 bài | Dùng Page ID cố định để map brand, phân trang hết kết quả; không dùng tên Page làm khóa |
| Follower cuối kỳ | `page_follows` | Cần `read_insights` và probe | Lấy điểm cuối kỳ, không cộng dồn từng ngày |
| Follows/unfollows mới | `page_daily_follows_unique`, `page_daily_unfollows_unique` | Cần probe và đối chiếu CSV | Cộng event ngày nếu định nghĩa phù hợp; `net_follow` có thể lệch thay đổi follower stock |
| Lượt hiển thị nội dung | `page_media_view` | Metric mới khả thi | Lưu `media_views` riêng; có thể cộng theo ngày sau khi xác nhận phân rã; không đổi tên thành `reach` |
| Người xem nội dung duy nhất | `page_total_media_view_unique` | Metric mới khả thi, **không thay thế ngang bằng** CSV Reach | Unique của ngày/tuần/28 ngày không cộng ra unique của cả tháng hoặc nhiều Page. Không ghi vào cột `reach` hiện tại |
| Reach lịch sử trong CSV | Không còn metric Reach cũ tương đương chính xác | CSV vẫn là nguồn chuẩn lịch sử | Giữ `reach` và `source=business_suite_csv`; để trống cho tháng chỉ có API nếu chưa có phép đo đúng nghĩa |
| Tương tác Page | `page_post_engagements` | Cần probe; Meta lưu ý Reels có ngoại lệ | Lưu định nghĩa/version; không tự đồng nhất với `engage` CSV nếu thiếu Reels |
| Reactions/comments/shares bài | Graph post summaries; `post_reactions_by_type_total` | M8.2 đã lấy ba tổng số cho một Page | Snapshot theo post và `observed_at`; không cộng snapshot lifetime qua ngày |
| Hiệu quả bài: viewers/views/clicks/video watch | `post_total_media_view_unique`, `post_media_view`, `post_clicks_by_type`, `post_video_avg_time_watched` | Cần probe trên ảnh/video/Reels riêng | Views/viewers mới tách khỏi `reach`; watch API là **milliseconds**, UI cần seconds |
| Lượt ghé trang | `page_views_total` | Cần probe | Khác lượt xem nội dung `page_media_view` |
| Click liên kết Page, contacts, bắt đầu chat | `page_total_actions` chỉ là tổng CTA/contact info; Ads API chỉ phản ánh phần paid | **Không bảo đảm tái tạo CSV** | Giữ CSV hoặc nguồn riêng; không suy từ tổng post clicks/CTA/Ads |
| Spend boost | M5.1 Marketing API | Có pipeline Ads riêng | Chỉ join khi có post/ad ID đáng tin; không gán chi phí campaign cho post bằng tên/brand |
| TikTok: views, search, demographics | Không thuộc Meta API | Nguồn TikTok/CSV riêng | Không tuyên bố Meta đồng bộ được kênh này |

**Lưu ý phép gộp:** Reach/unique viewers không cộng qua ngày, bài hoặc Page để tạo “người duy nhất” của một khoảng lớn. `page_total_media_view_unique` chỉ công bố period `day`, `week`, `days_28`; không có calendar month trong reference. UI tháng phải dùng CSV tháng hoặc trình bày metric mới với nhãn chính xác (ví dụ tổng *daily unique viewers*, không gọi reach tháng). ER hiện tại `engage / reach`; với tháng chỉ có Media Views, ER mới phải mang tên/định nghĩa khác và không nối liền chuỗi cũ.

## Audit code và UI hiện tại

1. `src/data/index.ts` import JSON do `scripts/build-data.mjs` sinh lúc build. Vercel Cron ghi Postgres **không làm JSON trong bundle cập nhật**; M6 cần endpoint đọc DB ở runtime và fallback Excel có gắn nhãn nguồn/trạng thái. M5.1 đã có mẫu `api/ads/performance.ts` + `DigitalAdsView.tsx`.
2. `src/views/SocialView.tsx` dòng 186–190 ghi cứng follower của 5 kênh; dòng 765–1010 ghi cứng 2,333 inquiries, nhiều follower/reach/ER/clicks và 5 showcase card; header/nhãn/thời gian cũng ghi cứng 4 Page, 1 TikTok, T7–T8/2026, “QA đạt”. Các giá trị này sẽ không phản ánh DB, filter brand/tháng hay Page mới.
3. `S.page` trong bảng kênh gộp toàn bộ lịch sử và không lọc `selectedMonths`; `S.format` cũng gộp toàn bộ lịch sử. Các KPI đầu trang theo kỳ chọn nhưng hai phần này không cùng kỳ. `CHANNEL_META` chọn Page theo brand, nên nếu một brand có nhiều Page sẽ lấy sai metadata.
4. `scripts/build-data.mjs` `audienceOf()` dùng `reach || impr || views`: giá trị Reach thực đo bằng **0** bị thay bằng views/impressions nhưng `audienceLabel()` vẫn ghi “tài khoản tiếp cận”. `row.cpm` có thể là 0 khi spend thiếu. Cần null-aware logic, khóa định nghĩa nguồn metric.
5. `tools/build_month.py` đọc `contacts`/`msgs`, hợp đồng Excel cũng khai hai trường, nhưng `buildSocial()` không chuyển chúng vào `SocialMonth` và `SocialView` hiện dùng số inquiry/chat ghi cứng. Mất dữ liệu ngay ở ETL.
6. `social_post` của M8.2 là máy trạng thái chuyển Facebook sang Zalo, một Page qua `FB_PAGE_ID`; nó chưa phải kho đo lường 4 Page. `reconcile.ts` chỉ lấy tối đa 50 bài trong 7 ngày, không phân trang, chỉ refresh reactions/comments/shares. Không dùng nó để tuyên bố đã đồng bộ M6 đầy đủ.
7. `SocialPost` đang thiếu `post_id`/`page_id`; link có trong dữ liệu nhưng bảng Top nội dung không mở link. Không có cột source, metric definition, `synced_at`, coverage/status để phân biệt “0”, “chưa kéo”, “không có quyền” và “CSV cũ”.
8. Chốt QA #13 `engage <= audience` và cộng reach qua Page/tháng cần xem lại định nghĩa: engagements có thể là số hành động, một người có thể làm nhiều hành động; tổng reach của nhiều Page không phải unique của brand.

## Mô hình Postgres đề xuất

Giữ nguyên bảng M8.2 và M5.1. Thêm migration **chỉ cộng bảng prefix `social_`**, không `DROP`/`RENAME`, theo quy ước repo:

| Bảng | Grain/khóa | Cột quan trọng |
|---|---|---|
| `social_m6_page` | `page_id` | `brand`, `display_name`, `active`, `token_env_key`, `timezone`, `created_at` |
| `social_m6_page_metric` | `(page_id, metric, period, end_time, breakdown_key)` | `value_numeric`/`value_json`, `source`, `graph_version`, `fetched_at`, `raw_payload` có kiểm soát |
| `social_m6_post` | `post_id` | `page_id`, `published_at`, `format`, `permalink`, `message`, `last_seen_at` |
| `social_m6_post_metric_snapshot` | `(post_id, metric, observed_at, breakdown_key)` | `value_numeric`/`value_json`, `source`, `graph_version`; giữ lịch sử lifetime snapshot |
| `social_m6_manual_month` | `(page_id, month, metric, source_file_hash)` | `value_numeric`, `imported_at`, `definition`; bảo toàn CSV lịch sử |
| `social_m6_sync_run` | `id` | `page_id`, cửa sổ kéo, `status`, `started_at`, `finished_at`, số bản ghi, mã lỗi, watermark |

API trả **mart tháng theo Page** được dựng từ các fact trên, kèm `source`, `definition`, `coverage`, `synced_at` cho từng metric. Bản cùng định nghĩa có thể upsert; metric khác định nghĩa không ghi đè nhau. `null` là thiếu/chưa có quyền; `0` chỉ khi Meta trả 0 thật. Có thể giữ `social_m6_monthly_mart` vật lý sau khi logic được kiểm thử; không cần bảng đó ở pilot.

## Luồng triển khai có thể kiểm chứng

1. **Access pilot:** Meta App, quyền `pages_show_list`, `pages_read_engagement`, `read_insights`; người cấp có task `ANALYZE` trên từng Page. Lấy Page token bằng OAuth phù hợp và kiểm `/debug_token` (app, scopes, expiry, Page tasks). Cần kiểm App Review/Advanced Access khi triển khai ngoài vai trò app tester/admin. Không đưa token vào trình duyệt, JSON build, Git hoặc log.
2. **Probe một Page trước:** cấu hình Graph v26 cho M6 (M8.2 hiện mặc định v23), gọi riêng từng metric để một lỗi `(#100)` không làm hỏng cả batch; kiểm `data: []` là thiếu quyền/không hỗ trợ/không có dữ liệu bằng debug token + đối chiếu 2 ngày và CSV. Thử riêng post ảnh, album, video, Reel. Ghi bảng kết quả permission, metric, period, value, sai khác, không lưu token.
3. **Backfill có giới hạn:** chia khoảng tối đa 90 ngày, trong giới hạn hai năm Meta; phân trang posts; upsert theo khóa tự nhiên. Kéo lại 7–30 ngày gần đây vì Insights trễ/chỉnh lại; refresh snapshot bài 1/3/7/30 ngày hoặc tới khi trưởng thành. Chạy mỗi Page thành job nhỏ, lock theo Page/cửa sổ.
4. **Vercel:** thêm `/api/social/m6-sync` với `CRON_SECRET`, một cron UTC hằng ngày, log DB; `DATABASE_URL` Postgres sẵn có, token Page ở environment server. Không ghi file cục bộ trong function để làm storage. Nếu cần nhiều Page hoặc backfill quá thời gian function, xử lý cursor theo lần chạy hoặc dùng worker ngoài; cron không retry nên có alert/QA freshness.
5. **UI:** `GET /api/social/m6-performance?from=&to=&brand=` trả dữ liệu runtime. Giữ Excel cho lịch sử và trạng thái 503 khi chưa cấu hình; hiển thị rõ nguồn/API last sync, Page thiếu quyền, thiếu ngày, metric đổi định nghĩa. Thay toàn bộ số ghi cứng; bảng Page/format tính theo filter; tách “Reach (CSV)” khỏi “Media Views/Viewers (API)” và nhãn ER tương ứng.
6. **Gate trước production:** ít nhất bốn Page map đúng ID/brand; đối chiếu hai tháng với CSV theo từng metric cùng định nghĩa; thử replay cron, pagination, token hết hạn, một Page lỗi, 0 vs null; chạy `npm run typecheck:api` và `npm run build`. Chỉ bật UI API sau khi Page thực trả dữ liệu hợp lệ và migration đã chạy. Không cần deploy lại mỗi lần data đổi vì UI đọc Postgres runtime.

## Trạng thái 30/09/2026

Chưa có Page credential để kiểm chứng Meta thực tế; chưa tạo migration/endpoint M6, chưa bật cron M6, chưa deploy Vercel. Repo đang có thay đổi chưa commit trong `SocialView.tsx`, `vercel.json`, `api/social/` và các tệp khác; cần giữ nguyên những thay đổi đó khi triển khai.
