import React, { useRef, useEffect } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart, HeatmapChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  LegendComponent,
  VisualMapComponent,
  MarkLineComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { useFilters } from '../../context/FilterContext';

/* Nạp ĐÚNG những gì 14 màn hình dùng thay vì gói echarts đầy đủ.
   Bản đầy đủ kéo theo bản đồ địa lý, radar, gauge, treemap, sunburst… —
   toàn bộ đều không xuất hiện ở đây. Thêm loại biểu đồ mới thì phải khai
   thêm vào danh sách dưới, nếu không ECharts sẽ vẽ ra khung trắng. */
echarts.use([
  BarChart, LineChart, PieChart, ScatterChart, HeatmapChart,
  GridComponent, TooltipComponent, AxisPointerComponent,
  LegendComponent, VisualMapComponent, MarkLineComponent,
  CanvasRenderer,
]);

interface EChartWrapperProps {
  option: EChartsOption;
  height?: string | number;
  className?: string;
  loading?: boolean;
  onEvents?: Record<string, Function>;
}

export const EChartWrapper: React.FC<EChartWrapperProps> = ({
  option,
  height = 300,
  className = '',
  loading = false,
  onEvents,
}) => {
  const chartRef = useRef<ReactEChartsCore>(null);
  const { theme } = useFilters();
  const isDark = theme === 'dark';

  // Theme-aware color palette for charts
  const axisLineColor = isDark ? '#2A2A33' : '#D8D4CA';
  const splitLineColor = isDark ? '#1F1F26' : '#EAE7DF';
  const labelColor = isDark ? '#9E9B93' : '#6B6963';
  const titleColor = isDark ? '#F3F2EE' : '#18181B';
  const borderColor = isDark ? '#141417' : '#FFFFFF';

  const isDarkNeutral = (c: any) => {
    if (typeof c !== 'string') return false;
    const lower = c.toLowerCase().trim();
    return ['#f3f2ee', '#f3eadd', '#2a2a33', '#1f1f26', '#141417', '#9e9b93', '#6e6c65', '#d6d3ca', '#ffffff', '#0c0c0e', '#18181b'].includes(lower);
  };

  const formatAxisTheme = (axis: any): any => {
    if (!axis) return axis;
    if (Array.isArray(axis)) {
      return axis.map((a: any) => formatAxisTheme(a));
    }
    const currentLabelColor = axis.axisLabel?.color;
    const resolvedLabelColor = (!currentLabelColor || isDarkNeutral(currentLabelColor))
      ? (axis.type === 'category' ? titleColor : labelColor)
      : currentLabelColor;

    return {
      ...axis,
      axisLine: {
        ...axis.axisLine,
        lineStyle: {
          color: axisLineColor,
          ...(axis.axisLine?.lineStyle || {}),
          ...((!axis.axisLine?.lineStyle?.color || isDarkNeutral(axis.axisLine?.lineStyle?.color)) ? { color: axisLineColor } : {}),
        },
      },
      axisLabel: {
        ...axis.axisLabel,
        color: resolvedLabelColor,
      },
      splitLine: axis.splitLine ? {
        ...axis.splitLine,
        lineStyle: {
          color: splitLineColor,
          type: 'dashed',
          ...(axis.splitLine?.lineStyle || {}),
          ...((!axis.splitLine?.lineStyle?.color || isDarkNeutral(axis.splitLine?.lineStyle?.color)) ? { color: splitLineColor } : {}),
        },
      } : axis.splitLine,
      splitArea: axis.splitArea ? {
        ...axis.splitArea,
        areaStyle: {
          color: isDark ? ['rgba(26,26,31,0.3)', 'rgba(20,20,23,0.3)'] : ['rgba(240,238,234,0.4)', 'rgba(255,255,255,0.4)'],
          ...(axis.splitArea?.areaStyle || {}),
        },
      } : undefined,
    };
  };

  // Format Series for theme consistency (lines, pies, heatmaps)
  const formatSeriesTheme = (series: any): any => {
    if (!series) return series;
    if (Array.isArray(series)) {
      return series.map((s: any) => formatSeriesTheme(s));
    }
    const s = { ...series };

    // Adjust pie / donut border
    if (s.type === 'pie' && s.itemStyle) {
      s.itemStyle = {
        ...s.itemStyle,
        borderColor: borderColor,
      };
    }

    // Adjust line series that used white/offwhite
    if (s.type === 'line' && s.lineStyle?.color && isDarkNeutral(s.lineStyle.color)) {
      s.lineStyle = {
        ...s.lineStyle,
        color: titleColor,
      };
      if (s.itemStyle?.color && isDarkNeutral(s.itemStyle.color)) {
        s.itemStyle = { ...s.itemStyle, color: titleColor };
      }
    }

    // Adjust heatmap item border
    if (s.type === 'heatmap' && s.itemStyle) {
      s.itemStyle = {
        ...s.itemStyle,
        borderColor: borderColor,
      };
    }

    return s;
  };

  // Format VisualMap for Heatmap
  const formatVisualMapTheme = (vm: any): any => {
    if (!vm) return vm;
    return {
      ...vm,
      textStyle: {
        color: labelColor,
        fontSize: 10,
        ...(vm.textStyle || {}),
      },
      inRange: {
        color: isDark
          ? ['#1A1A1F', '#4A3B1E', '#7E5F26', '#C5A059', '#F3EADD']
          : ['#F7F5F0', '#EBDCB9', '#D4AF5F', '#A37D32', '#644A14'],
        ...(vm.inRange || {}),
      },
    };
  };

  // Apply default luxury theme configurations based on active mode
  const mergedOption: EChartsOption = {
    backgroundColor: 'transparent',
    textStyle: {
      fontFamily: "'Plus Jakarta Sans', 'Montserrat', sans-serif",
      color: labelColor,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDark ? 'rgba(20, 20, 23, 0.95)' : 'rgba(255, 255, 255, 0.97)',
      borderColor: isDark ? 'rgba(197, 160, 89, 0.3)' : 'rgba(176, 131, 75, 0.35)',
      borderWidth: 1,
      extraCssText: isDark
        ? 'box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.6);'
        : 'box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.12);',
      textStyle: {
        color: titleColor,
        fontSize: 12,
      },
      padding: [8, 12],
      ...option.tooltip,
    },
    legend: option.legend ? {
      textStyle: { color: labelColor, fontSize: 11 },
      ...option.legend,
    } : option.legend,
    grid: {
      top: 35,
      right: 20,
      bottom: 30,
      left: 55,
      containLabel: true,
      ...option.grid,
    },
    ...option,
    xAxis: formatAxisTheme(option.xAxis),
    yAxis: formatAxisTheme(option.yAxis),
    series: formatSeriesTheme(option.series),
    visualMap: option.visualMap ? formatVisualMapTheme(option.visualMap) : undefined,
  };

  useEffect(() => {
    const handleResize = () => {
      chartRef.current?.getEchartsInstance().resize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={`relative w-full ${className}`} style={{ height }}>
      <ReactEChartsCore
        ref={chartRef}
        echarts={echarts}
        option={mergedOption}
        style={{ height: '100%', width: '100%' }}
        showLoading={loading}
        loadingOption={{
          text: 'Đang tải...',
          color: '#C5A059',
          textColor: isDark ? '#F3F2EE' : '#18181B',
          maskColor: isDark ? 'rgba(20, 20, 23, 0.6)' : 'rgba(255, 255, 255, 0.6)',
        }}
        onEvents={onEvents}
        notMerge={true}
        lazyUpdate={true}
      />
    </div>
  );
};
