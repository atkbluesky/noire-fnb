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
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          TRƯỚC KHI CHẠY — DỰ BÁO CÓ LÃI KHÔNG · SAU KHI CHẠY — CÓ ĐÚNG NHƯ DỰ BÁO KHÔNG
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">M7.1 · Pre-Analytics · Plan</h2>
        <p className="text-xs text-brand-muted mt-1">
          EBITDA tăng thêm dự báo của từng chương trình theo 3 kịch bản, điểm hoà vốn và quyết định DUYỆT · CHẠY THỬ · SỬA CƠ CHẾ.
          Chương trình đã chạy có thực tế đặt cạnh dự báo.
        </p>
      </div>

      <PreEvalSection brandMatches={brandMatches} />
    </div>
  );
};
