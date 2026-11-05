import React from 'react';
import { useFilters } from '../context/FilterContext';
import { PromotionTabs } from '../components/common/PromotionTabs';
import { PreEvalSection } from './PreEvalSection';

/* M7.1 · PRE-ANALYTICS · PLAN
   Dự báo EBITDA tăng thêm của từng chương trình TRƯỚC khi chạy (tools/preeval.py; quý có file đánh giá bản Final
   đã trình CEO thì lấy nguyên số file — tools/preeval_final.py) → quyết định DUYỆT · CHẠY THỬ · SỬA CƠ CHẾ.
   Chương trình đã chạy đặt thực tế (M7.2) cạnh dự báo. Kế hoạch Q3 lập tay (S16 · CAMPAIGN.plan) không hiện ở đây
   nữa — vẫn là target của M7.2. */

export const PreAnalyticsView: React.FC = () => {
  const { brandMatches } = useFilters();
  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      <PromotionTabs />

      <div>
        <h2 className="text-xl font-extrabold text-brand-text font-display">M7.1 · Pre-Analytics · Plan</h2>
      </div>

      <PreEvalSection brandMatches={brandMatches} />
    </div>
  );
};
