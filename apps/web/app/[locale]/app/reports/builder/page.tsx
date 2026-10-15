'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { formatZeroFloatMoney } from '@/lib/money';
import { Download, Filter, Table, CheckCircle2 } from 'lucide-react';

export default function ReportBuilderPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const isAr = locale === 'ar';

  const [reportData, setReportData] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);

  const fetchReport = async (cat: string) => {
    try {
      setLoading(true);
      const categories = cat === 'ALL' ? [] : [cat];
      const res = await fetch('/api/reports/builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories, format: 'JSON' })
      });
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(selectedCategory);
  }, [selectedCategory]);

  const handleDownloadCsv = async () => {
    const categories = selectedCategory === 'ALL' ? [] : [selectedCategory];
    const res = await fetch('/api/reports/builder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories, format: 'CSV' })
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `custom_report_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {isAr ? 'منشئ التقارير المالية المخصص' : 'Custom Report Builder & Exporter'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'تجميع مرن لحسابات دفتر الأستاذ، تصنيف حسب البنود، وتصدير مباشر بصيغة CSV و PDF'
              : 'Dynamic multi-dimensional general ledger aggregation and instant CSV/PDF export'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadCsv}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow transition flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {isAr ? 'تصدير CSV' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
        <Filter className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-slate-300">{isAr ? 'تصنيف الحسابات:' : 'Account Category:'}</span>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="ALL">{isAr ? 'جميع الفئات (All Categories)' : 'All Categories'}</option>
          <option value="ASSET">{isAr ? 'الأصول (Assets)' : 'Assets'}</option>
          <option value="LIABILITY">{isAr ? 'الالتزامات (Liabilities)' : 'Liabilities'}</option>
          <option value="EQUITY">{isAr ? 'حقوق الملكية (Equity)' : 'Equity'}</option>
          <option value="REVENUE">{isAr ? 'الإيرادات (Revenue)' : 'Revenue'}</option>
          <option value="EXPENSE">{isAr ? 'المصروفات (Expenses)' : 'Expenses'}</option>
        </select>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500">{isAr ? 'جارٍ احتساب التقرير...' : 'Calculating report...'}</div>
      ) : reportData && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'الرمز' : 'Code'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'اسم الحساب' : 'Account Name'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'الفئة' : 'Category'}</th>
                  <th className="py-3.5 px-4 font-semibold text-right">{isAr ? 'مدين' : 'Debit (AED)'}</th>
                  <th className="py-3.5 px-4 font-semibold text-right">{isAr ? 'دائن' : 'Credit (AED)'}</th>
                  <th className="py-3.5 px-4 font-semibold text-right">{isAr ? 'الرصيد الصافي' : 'Net (AED)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {reportData.rows.map((r: any) => (
                  <tr key={r.code} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4 font-mono font-medium text-emerald-400">{r.code}</td>
                    <td className="py-3.5 px-4 font-semibold text-white">{isAr ? r.nameAr || r.nameEn : r.nameEn}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-400">{r.category}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-white">
                      {formatZeroFloatMoney(BigInt(r.debitMinorUnits), locale)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-white">
                      {formatZeroFloatMoney(BigInt(r.creditMinorUnits), locale)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                      {formatZeroFloatMoney(BigInt(r.netBalanceMinorUnits), locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Row */}
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-300 font-mono">
            <div>
              Total Debits: {formatZeroFloatMoney(BigInt(reportData.summary.totalDebitMinorUnits), locale)} | Total Credits: {formatZeroFloatMoney(BigInt(reportData.summary.totalCreditMinorUnits), locale)}
            </div>
            <div className="text-emerald-400 font-bold">
              {reportData.summary.isBalanced ? 'Balanced: 0 fils variance' : 'Variance Detected'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
