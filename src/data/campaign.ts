/**
 * M7 Promotion — danh mục chương trình (master chung M7 · M7.1 · M7.2), kế hoạch Pre-Analysis,
 * kết quả đo, chuỗi ngày. Cố ý KHÔNG nằm trong HUB_DATA/MKT_DATA: chỉ cụm M7 dùng, tải khi mở.
 */
import raw from './campaign.json';
import { CampaignData } from '../types/campaign';

export const CAMPAIGN = raw as unknown as CampaignData;
