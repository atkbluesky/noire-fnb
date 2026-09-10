import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFilters } from '../../context/FilterContext';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchable?: boolean;
  searchPlaceholder?: string;
  searchKeys?: (keyof T)[];
  pageSize?: number;
  exportFilename?: string;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  searchable = true,
  searchPlaceholder = 'Tìm kiếm dữ liệu...',
  searchKeys,
  pageSize = 10,
  exportFilename,
  emptyMessage = 'Không có dữ liệu phù hợp',
  className = '',
}: DataTableProps<T>) {
  const { exportToCSV } = useFilters();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'desc') {
        setSortDir('asc');
      } else {
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setCurrentPage(1);
  };

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter(row => {
      if (searchKeys && searchKeys.length > 0) {
        return searchKeys.some(k => {
          const val = row[k];
          return val != null && String(val).toLowerCase().includes(term);
        });
      }
      return Object.values(row).some(val => {
        return val != null && String(val).toLowerCase().includes(term);
      });
    });
  }, [data, searchTerm, searchKeys]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDir === 'asc' ? -1 : 1;
      if (bVal == null) return sortDir === 'asc' ? 1 : -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const strA = String(aVal).toLowerCase();
      const strB = String(bVal).toLowerCase();
      return sortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredData, sortKey, sortDir]);

  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleExport = () => {
    if (exportFilename && sortedData.length > 0) {
      exportToCSV(exportFilename, sortedData);
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {(searchable || exportFilename) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {searchable ? (
            <div className="relative min-w-[220px] max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-brand-border bg-brand-surface py-1.5 pl-8 pr-3 text-xs text-brand-text placeholder-brand-muted outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30"
              />
            </div>
          ) : <div />}

          {exportFilename && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-surface px-3 py-1.5 text-xs font-semibold text-brand-muted hover:border-brand-gold hover:text-brand-gold transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Xuất CSV ({sortedData.length})</span>
            </button>
          )}
        </div>
      )}

      {/* overflow-x-auto + whitespace-nowrap trên th/td (dưới đây): bảng luôn giữ mỗi
          hàng MỘT dòng, cuộn ngang khi không đủ chỗ — thay vì để trình duyệt tự xuống
          dòng tên món/tên chương trình dài, khiến một hàng cao tới 7-8 dòng trên di động
          và vẫn không tránh được cuộn ngang cho các cột số ở cuối bảng. */}
      <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-surface/50">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-brand-border bg-brand-surface text-[10px] font-bold uppercase tracking-wider text-brand-muted">
              {columns.map(col => {
                const alignClass = 
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                return (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    onClick={() => col.sortable !== false && handleSort(col.key)}
                    className={`p-2.5 font-bold whitespace-nowrap ${alignClass} ${
                      col.sortable !== false ? 'cursor-pointer select-none hover:text-brand-gold' : ''
                    }`}
                  >
                    <div className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                      <span>{col.header}</span>
                      {col.sortable !== false && (
                        <span className="text-brand-faint">
                          {sortKey === col.key ? (
                            sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-brand-gold" /> : <ChevronDown className="h-3 w-3 text-brand-gold" />
                          ) : (
                            <ChevronDown className="h-3 w-3 opacity-30" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border/40">
            {paginatedData.length > 0 ? (
              paginatedData.map((row, idx) => (
                <tr
                  key={idx}
                  className="transition-colors hover:bg-brand-cardHover/70"
                >
                  {columns.map(col => {
                    const alignClass = 
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                    return (
                      <td key={col.key} className={`p-2.5 text-brand-sand whitespace-nowrap ${alignClass}`}>
                        {col.render ? col.render(row, idx) : row[col.key] ?? '—'}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-8 text-center text-xs text-brand-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-brand-muted pt-1">
          <span>
            Hiển thị {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, sortedData.length)} trên tổng số {sortedData.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded p-1 text-brand-muted hover:bg-brand-surface disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-brand-text px-2">
              Trang {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded p-1 text-brand-muted hover:bg-brand-surface disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
