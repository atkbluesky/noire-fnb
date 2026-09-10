import rawHubData from './data.json';
import rawMktData from './data_mkt.json';
import { HubData } from '../types/hub';
import { MktData } from '../types/mkt';

export const HUB_DATA = rawHubData as unknown as HubData;
export const MKT_DATA = rawMktData as unknown as MktData;

export const BRANDS = ['NCB', 'NDC', 'NJFB'] as const;
export type BrandType = typeof BRANDS[number] | 'ALL';

export const BRAND_COLORS: Record<string, string> = {
  NCB: '#AE8966',
  NDC: '#82846C',
  NJFB: '#C28B4B',
  OTHER: '#9E9B93',
  'Tuyển dụng': '#EF4444',
  'Không xác định': '#D6D3CA',
};

/** Nền tảng social — thứ tự này quyết định thứ tự hiển thị ở M6. */
export const PLATFORMS = ['FACEBOOK', 'TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'ZALO'] as const;

export const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'Fanpage Facebook',
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram',
  YOUTUBE: 'YouTube',
  ZALO: 'Zalo OA',
};

export const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: '#C5A059',
  TIKTOK: '#82846C',
  INSTAGRAM: '#AE8966',
  YOUTUBE: '#C28B4B',
  ZALO: '#6E6C65',
};

export const BRAND_NAMES: Record<string, string> = {
  NCB: 'Noire Café & Bistro',
  NDC: 'Noire Dining & Café',
  NJFB: 'Noire Japanese Fusion & Bar',
};

export const CORE_STORES = Object.keys(HUB_DATA.stores).filter(k => 
  ['core', 'flagship'].includes(HUB_DATA.stores[k]?.tier)
);

export const ALL_STORES = Object.keys(HUB_DATA.stores);

export const FULL_MONTHS = HUB_DATA.meta.months.filter(m => 
  !(HUB_DATA.coverage[m]?.partial)
);

export const LAST_FULL_MONTH = FULL_MONTHS.length 
  ? FULL_MONTHS[FULL_MONTHS.length - 1] 
  : HUB_DATA.meta.months[HUB_DATA.meta.months.length - 1];

export const LATEST_MONTH = HUB_DATA.meta.months[HUB_DATA.meta.months.length - 1];
