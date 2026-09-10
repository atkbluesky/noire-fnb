import React from 'react';
import { MKT_DATA } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { formatNumber } from '../utils/formatters';

export const SystemMapView: React.FC = () => {
  const SY = MKT_DATA.system || {
    total_py: 31,
    total_loc: 15276,
    cache_mb: 53.6,
    tools: [],
    dashboards: [],
    caches: [],
    dup_json: {},
  };

  const tools = SY.tools || [];
  const dashboards = SY.dashboards || [];
  const caches = SY.caches || [];

  const toolNameMap: Record<string, string> = {
    '04 Marketing Campaigns': 'Digital Ads · LTO Promotions',
    '03 Customer Engagement': 'Voucher · CRM · Loyalty',
    '10 Partnership Analytics': 'Partnership',
    '05 Data Raw': 'Basket · RFM · KMeans',
    'T7-2026': 'Deck Báo cáo MKT tháng',
    '06 Reports': 'Deck Báo cáo MKT tháng',
    '08 Analytics Hub': 'Analytics Hub (Hệ thống này)',
    '09 Tracking Sales Tool': 'Tracking Sales',
  };

  // Tools Table
  const toolColumns: Column<typeof tools[0]>[] = [
    {
      key: 'root',
      header: 'Thư mục gốc',
      render: row => <span className="font-mono font-bold text-brand-gold">{row.root}</span>,
    },
    {
      key: 'content',
      header: 'Nội dung phân tích',
      render: row => <span className="font-semibold text-brand-text">{toolNameMap[row.root] || '—'}</span>,
    },
    {
      key: 'files',
      header: 'File .py',
      align: 'right',
      render: row => <span className="font-mono">{row.files}</span>,
    },
    {
      key: 'loc',
      header: 'Dòng Code',
      align: 'right',
      render: row => <span className="font-mono font-bold text-brand-goldLight">{formatNumber(row.loc)}</span>,
    },
  ];

  // Dashboards Table
  const dashColumns: Column<typeof dashboards[0]>[] = [
    {
      key: 'name',
      header: 'Tên file Dashboard HTML',
      render: row => <span className="font-bold text-brand-text">{row.name}</span>,
    },
    {
      key: 'path',
      header: 'Vị trí thư mục',
      render: row => <span className="text-brand-muted text-[11px] font-mono">{row.path}</span>,
    },
    {
      key: 'kb',
      header: 'Dung lượng',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.kb)} KB</span>,
    },
  ];

  return (
    <div className="space-y-5 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          BẢN ĐỒ KIẾN TRÚC &amp; ĐIỂM PHÂN MẢNH
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          D2 · Bản Đồ Hệ Thống &amp; Lộ Trình Hợp Nhất
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Kết quả quét tự động toàn bộ cây thư mục dự án — chỉ ra các điểm phân mảnh và hướng chuẩn hoá một nguồn dữ liệu duy nhất.
        </p>
      </div>

      {/* Core Issue Alert */}
      <div className="rounded-xl border border-status-bad/40 bg-status-badBg/20 p-4 text-xs text-status-bad space-y-1.5">
        <p className="font-bold text-sm text-status-bad">
          Vấn đề cốt lõi: 6 hệ thống phân tích độc lập chạy song song
        </p>
        <p className="text-brand-text leading-relaxed">
          Hiện có <b>{tools.length} hệ thống phân tích</b> với <b>{formatNumber(SY.total_py)} file Python ·{' '}
          {formatNumber(SY.total_loc)} dòng code</b>, sinh ra <b>{dashboards.length} dashboard HTML rời rạc</b>. Bốn
          tool cùng đọc file <span className="font-mono bg-brand-surface px-1 py-0.5 rounded">accounting_sale</span> nhưng mỗi tool tự map tên cửa hàng và tự chọn cột doanh thu khác nhau — đó là nguồn gốc khiến số liệu giữa các báo cáo bị lệch.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Hệ Thống Độc Lập"
          subLabel="Thư mục có script riêng"
          value={tools.length}
          isFlagged={true}
          flagMessage="Cần hợp nhất"
          variant="critical"
        />
        <MetricCard
          label="File Python Tồn Tại"
          subLabel="Tổng script toàn dự án"
          value={formatNumber(SY.total_py)}
          customDeltaText={`${formatNumber(SY.total_loc)} dòng code`}
        />
        <MetricCard
          label="Dashboard HTML Rời Rạc"
          subLabel="Sản phẩm cuối không liên kết"
          value={dashboards.length}
          isFlagged={true}
          flagMessage="Gây phân mảnh"
          variant="warning"
        />
        <MetricCard
          label="Cache Đọc Trùng Lặp"
          subLabel="Cùng nạp lại 1 nguồn"
          value={`${SY.cache_mb} MB`}
          customDeltaText={`${caches.length} thư mục cache`}
          variant="hero"
        />
      </div>

      {/* Parallel Systems Table */}
      <Card
        title="Các Hệ Thống Đang Chạy Song Song"
        description="Sắp xếp theo khối lượng dòng code Python trong cây thư mục"
        chip="QUÉT TỰ ĐỘNG"
        hero={true}
      >
        <DataTable
          columns={toolColumns}
          data={tools}
          searchable={false}
          pageSize={8}
          exportFilename="Noire_Parallel_Systems"
        />
      </Card>

      {/* Root Cause Analysis Table */}
      <Card
        title="Bốn Tool Cùng Đọc Một Nguồn — Nhưng Dùng 4 Định Nghĩa Khác Nhau"
        description="Nguyên nhân gốc rễ gây ra tình trạng mỗi báo cáo ra một con số doanh thu"
        chip="ROOT CAUSE"
      >
        <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-surface/50">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-brand-border bg-brand-surface text-[10px] font-bold uppercase tracking-wider text-brand-muted">
                <th className="p-2.5">Tên Tool</th>
                <th className="p-2.5">File nguồn đọc</th>
                <th className="p-2.5">Cột doanh thu sử dụng</th>
                <th className="p-2.5">Cách map cửa hàng</th>
                <th className="p-2.5">Rủi ro dữ liệu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/40 font-mono">
              <tr className="hover:bg-brand-cardHover">
                <td className="p-2.5 font-sans font-bold text-brand-text">Partnership</td>
                <td className="p-2.5 text-brand-gold">accounting_sale</td>
                <td className="p-2.5 text-brand-muted">Tổng tiền</td>
                <td className="p-2.5 font-sans text-brand-muted">Bảng map riêng</td>
                <td className="p-2.5 font-sans">
                  <StatusBadge label="Định nghĩa riêng" variant="warning" />
                </td>
              </tr>
              <tr className="hover:bg-brand-cardHover">
                <td className="p-2.5 font-sans font-bold text-brand-text">Tool Dashboard CRM</td>
                <td className="p-2.5 text-brand-gold">accounting_sale + voucher</td>
                <td className="p-2.5 text-brand-muted">Tổng tiền · Bao gồm hoa hồng · Không VAT</td>
                <td className="p-2.5 font-sans text-brand-muted">Bảng map riêng</td>
                <td className="p-2.5 font-sans">
                  <StatusBadge label="Dùng 3 cột khác nhau" variant="bad" />
                </td>
              </tr>
              <tr className="hover:bg-brand-cardHover">
                <td className="p-2.5 font-sans font-bold text-brand-text">Basket · RFM · KMeans</td>
                <td className="p-2.5 text-brand-gold">item + bill</td>
                <td className="p-2.5 text-brand-muted">Tổng tiền · Thành tiền · Doanh thu Net</td>
                <td className="p-2.5 font-sans text-brand-muted">Bảng map riêng</td>
                <td className="p-2.5 font-sans">
                  <StatusBadge label="3 cơ sở doanh thu" variant="bad" />
                </td>
              </tr>
              <tr className="hover:bg-brand-cardHover bg-status-okBg/10">
                <td className="p-2.5 font-sans font-bold text-brand-goldLight">Analytics Hub (Hiện tại)</td>
                <td className="p-2.5 text-brand-gold">item + bill + daily + tháng</td>
                <td className="p-2.5 text-status-ok font-bold">Tổng tiền (đã chuẩn hoá)</td>
                <td className="p-2.5 font-sans text-status-ok font-bold">DIM_STORE dùng chung</td>
                <td className="p-2.5 font-sans">
                  <StatusBadge label="Đã đối soát 4 tầng" variant="ok" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 3-step recommendation */}
        <div className="mt-4 rounded-lg border border-brand-border bg-brand-surface p-4 text-xs text-brand-muted space-y-2">
          <h4 className="font-bold text-brand-goldLight text-sm">
            Lộ Trình Hợp Nhất Đề Xuất (3 Bước — Không Phải Viết Lại Tool Cũ):
          </h4>
          <ol className="list-decimal list-inside space-y-1.5 leading-relaxed text-brand-text">
            <li>
              <b>Bước 1:</b> Mỗi tool thay phần tự đọc Excel bằng đọc trực tiếp <span className="font-mono text-brand-gold">data.json</span> của Analytics Hub để dùng chung 1 định nghĩa số liệu.
            </li>
            <li>
              <b>Bước 2:</b> Gộp các thư mục cache phân mảnh về một chỗ để tiết kiệm {SY.cache_mb} MB và giảm thời gian chạy pipeline.
            </li>
            <li>
              <b>Bước 3:</b> Các dashboard cũ giữ nguyên vai trò phân tích chuyên sâu nhưng lấy số từ hub duy nhất — chấm dứt hoàn toàn tình trạng lệch số giữa các báo cáo.
            </li>
          </ol>
        </div>
      </Card>

      {/* Disconnected HTML Dashboards Table */}
      <Card
        title="Danh Sách 11 Dashboard HTML Rời Rạc Từng Được Sinh Ra"
        description="Quét tự động trong cây thư mục"
        chip="DASHBOARDS"
      >
        <DataTable
          columns={dashColumns}
          data={dashboards}
          searchPlaceholder="Tìm dashboard..."
          pageSize={6}
          exportFilename="Noire_Disjointed_Dashboards"
        />
      </Card>
    </div>
  );
};
