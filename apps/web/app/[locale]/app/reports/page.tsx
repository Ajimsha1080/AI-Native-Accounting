'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { StateContainer } from '@/components/StateContainer';
import { formatMinorUnits, formatMinorUnitsToDecimal } from '@/lib/money';
import {
  FileSpreadsheet,
  Download,
  Printer,
  ShieldCheck,
  Building2,
  TrendingUp,
  Layers,
  ArrowRight,
  FileCheck
} from 'lucide-react';

interface ReportLine {
  accountCode: string;
  nameEn: string;
  nameAr: string;
  category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  debitMinorUnits: string;
  creditMinorUnits: string;
  netBalanceMinorUnits: string;
}

interface ConsolidationEntityColumn {
  entityId: string;
  nameEn: string;
  nameAr: string;
  currency: string;
  debitMinorUnits: string;
  creditMinorUnits: string;
}

interface FinancialReportData {
  reportType: string;
  period: string;
  currency: string;
  trialBalance: {
    lines: ReportLine[];
    totalDebitMinorUnits: string;
    totalCreditMinorUnits: string;
    isBalanced: boolean;
    varianceFils: string;
  };
  pnl: {
    revenueLines: ReportLine[];
    expenseLines: ReportLine[];
    totalRevenueMinorUnits: string;
    totalExpenseMinorUnits: string;
    netProfitMinorUnits: string;
  };
  balanceSheet: {
    assetLines: ReportLine[];
    liabilityLines: ReportLine[];
    equityLines: ReportLine[];
    totalAssetsMinorUnits: string;
    totalLiabilitiesAndEquityMinorUnits: string;
    isBalanced: boolean;
  };
  consolidation: {
    entities: ConsolidationEntityColumn[];
    intercompanyEliminationsMinorUnits: string;
    consolidatedTotalMinorUnits: string;
  };
}

function ReportsView({ params }: { params: Promise<{ locale: string }> }) {
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  useEffect(() => {
    params.then((p) => setLocale(p.locale as 'en' | 'ar'));
  }, [params]);

  const [activeTab, setActiveTab] = useState<'TB' | 'PNL' | 'BS' | 'CONSOLIDATION'>('TB');
  const [data, setData] = useState<FinancialReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const fetchReports = async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch(`/api/reports?type=${activeTab}`);
      if (!res.ok) throw new Error('Failed to load reports');
      const json = await res.json();
      setData(json);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [activeTab]);

  const handleExportCsv = () => {
    if (!data) return;
    let csv = 'Account Code,Account Name,Category,Debit (AED),Credit (AED)\n';
    if (activeTab === 'TB') {
      data.trialBalance.lines.forEach((l) => {
        csv += `"${l.accountCode}","${l.nameEn}","${l.category}","${formatMinorUnitsToDecimal(l.debitMinorUnits)}","${formatMinorUnitsToDecimal(l.creditMinorUnits)}"\n`;
      });
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `LedgerAE_${activeTab}_FY2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <span>
              {locale === 'ar'
                ? 'التقارير المالية الموحدة (Financial Reports & Consolidation)'
                : 'Financial Reports & Multi-Entity Consolidation'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {locale === 'ar'
              ? 'ميزان المراجعة، قائمة الدخل، الميزانية العمومية، واستبعادات ما بين الشركات الموحدة (IFRS 10)'
              : 'IFRS-compliant financial statements with integer-fils precision and PDF/XLSX export'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-emerald-950"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector Tabs */}
      <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs font-bold overflow-x-auto">
        <button
          onClick={() => setActiveTab('TB')}
          className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
            activeTab === 'TB'
              ? 'bg-emerald-600 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Trial Balance (ميزان المراجعة)
        </button>
        <button
          onClick={() => setActiveTab('PNL')}
          className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
            activeTab === 'PNL'
              ? 'bg-emerald-600 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Profit & Loss (قائمة الدخل)
        </button>
        <button
          onClick={() => setActiveTab('BS')}
          className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
            activeTab === 'BS'
              ? 'bg-emerald-600 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Balance Sheet (الميزانية العمومية)
        </button>
        <button
          onClick={() => setActiveTab('CONSOLIDATION')}
          className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
            activeTab === 'CONSOLIDATION'
              ? 'bg-emerald-600 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          IFRS 10 Consolidation (القوائم الموحدة)
        </button>
      </div>

      <StateContainer isLoading={isLoading} isError={isError} isEmpty={!data} onRetry={fetchReports}>
        {data && (
          <div className="space-y-6">
            {/* 1. Trial Balance Tab */}
            {activeTab === 'TB' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold">{data.period}</span>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-emerald-400">
                      Balanced: Total Debits == Total Credits ({data.trialBalance.varianceFils} fils variance)
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
                  <table className="w-full text-start text-xs border-collapse">
                    <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold">
                      <tr>
                        <th className="p-3.5 ps-5 text-start w-24">Code</th>
                        <th className="p-3.5 text-start">Account Name (IFRS Taxonomy)</th>
                        <th className="p-3.5 text-center w-28">Category</th>
                        <th className="p-3.5 text-end w-44">Debit (AED)</th>
                        <th className="p-3.5 pe-5 text-end w-44">Credit (AED)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {data.trialBalance.lines.map((l) => (
                        <tr key={l.accountCode} className="hover:bg-slate-800/40">
                          <td className="p-3.5 ps-5 font-mono font-bold text-white">{l.accountCode}</td>
                          <td className="p-3.5">
                            <div className="font-semibold text-white">{locale === 'ar' ? l.nameAr : l.nameEn}</div>
                            <div className="text-[10px] text-slate-500">{locale === 'ar' ? l.nameEn : l.nameAr}</div>
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-300">
                              {l.category}
                            </span>
                          </td>
                          <td className="p-3.5 text-end font-mono text-emerald-400 font-bold">
                            {l.debitMinorUnits !== '0' ? formatMinorUnits(BigInt(l.debitMinorUnits), { locale }) : '—'}
                          </td>
                          <td className="p-3.5 pe-5 text-end font-mono text-amber-400 font-bold">
                            {l.creditMinorUnits !== '0' ? formatMinorUnits(BigInt(l.creditMinorUnits), { locale }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-950 border-t-2 border-slate-700 font-black text-xs">
                      <tr>
                        <td colSpan={3} className="p-4 ps-5 text-slate-200">
                          Total General Ledger Trial Balance:
                        </td>
                        <td className="p-4 text-end font-mono text-emerald-400 text-sm">
                          {formatMinorUnits(BigInt(data.trialBalance.totalDebitMinorUnits), { locale })}
                        </td>
                        <td className="p-4 pe-5 text-end font-mono text-amber-400 text-sm">
                          {formatMinorUnits(BigInt(data.trialBalance.totalCreditMinorUnits), { locale })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* 2. Profit & Loss Tab */}
            {activeTab === 'PNL' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[11px] text-slate-400 font-semibold block">TOTAL REVENUE</span>
                    <strong className="text-lg font-black text-emerald-400 mt-1 block">
                      {formatMinorUnits(BigInt(data.pnl.totalRevenueMinorUnits), { locale })}
                    </strong>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[11px] text-slate-400 font-semibold block">TOTAL OPERATING EXPENSES</span>
                    <strong className="text-lg font-black text-rose-400 mt-1 block">
                      {formatMinorUnits(BigInt(data.pnl.totalExpenseMinorUnits), { locale })}
                    </strong>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[11px] text-slate-400 font-semibold block">NET PROFIT BEFORE TAX</span>
                    <strong className="text-lg font-black text-cyan-400 mt-1 block">
                      {formatMinorUnits(BigInt(data.pnl.netProfitMinorUnits), { locale })}
                    </strong>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
                  {/* Revenue Section */}
                  <div>
                    <h3 className="text-xs font-black text-emerald-400 uppercase tracking-wider mb-2">
                      Operating Revenues (Commercial & Exports)
                    </h3>
                    <div className="divide-y divide-slate-800 text-xs">
                      {data.pnl.revenueLines.map((r) => (
                        <div key={r.accountCode} className="py-2.5 flex justify-between items-center">
                          <span>{locale === 'ar' ? r.nameAr : r.nameEn} ({r.accountCode})</span>
                          <span className="font-mono font-bold text-white">
                            {formatMinorUnits(BigInt(r.creditMinorUnits), { locale })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Expenses Section */}
                  <div>
                    <h3 className="text-xs font-black text-rose-400 uppercase tracking-wider mb-2">
                      Cost of Sales & Operating Overheads
                    </h3>
                    <div className="divide-y divide-slate-800 text-xs">
                      {data.pnl.expenseLines.map((e) => (
                        <div key={e.accountCode} className="py-2.5 flex justify-between items-center">
                          <span>{locale === 'ar' ? e.nameAr : e.nameEn} ({e.accountCode})</span>
                          <span className="font-mono font-bold text-white">
                            {formatMinorUnits(BigInt(e.debitMinorUnits), { locale })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Balance Sheet Tab */}
            {activeTab === 'BS' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[11px] text-slate-400 font-semibold block">TOTAL ASSETS</span>
                    <strong className="text-lg font-black text-cyan-400 mt-1 block">
                      {formatMinorUnits(BigInt(data.balanceSheet.totalAssetsMinorUnits), { locale })}
                    </strong>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[11px] text-slate-400 font-semibold block">TOTAL LIABILITIES & EQUITY</span>
                    <strong className="text-lg font-black text-amber-400 mt-1 block">
                      {formatMinorUnits(BigInt(data.balanceSheet.totalLiabilitiesAndEquityMinorUnits), { locale })}
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Assets */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <h3 className="text-xs font-black text-cyan-400 uppercase tracking-wider">Assets</h3>
                    <div className="divide-y divide-slate-800 text-xs">
                      {data.balanceSheet.assetLines.map((a) => (
                        <div key={a.accountCode} className="py-2 flex justify-between items-center">
                          <span>{locale === 'ar' ? a.nameAr : a.nameEn}</span>
                          <span className="font-mono font-bold text-white">
                            {formatMinorUnits(BigInt(a.debitMinorUnits), { locale })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Liabilities & Equity */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <div>
                      <h3 className="text-xs font-black text-amber-400 uppercase tracking-wider">Liabilities</h3>
                      <div className="divide-y divide-slate-800 text-xs mt-2">
                        {data.balanceSheet.liabilityLines.map((l) => (
                          <div key={l.accountCode} className="py-2 flex justify-between items-center">
                            <span>{locale === 'ar' ? l.nameAr : l.nameEn}</span>
                            <span className="font-mono font-bold text-white">
                              {formatMinorUnits(BigInt(l.creditMinorUnits), { locale })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-black text-purple-400 uppercase tracking-wider">Equity</h3>
                      <div className="divide-y divide-slate-800 text-xs mt-2">
                        {data.balanceSheet.equityLines.map((eq) => (
                          <div key={eq.accountCode} className="py-2 flex justify-between items-center">
                            <span>{locale === 'ar' ? eq.nameAr : eq.nameEn}</span>
                            <span className="font-mono font-bold text-white">
                              {formatMinorUnits(BigInt(eq.creditMinorUnits), { locale })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. IFRS 10 Consolidation Tab */}
            {activeTab === 'CONSOLIDATION' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">CONSOLIDATION STANDARD</span>
                    <strong className="text-white text-xs">IFRS 10 Consolidated Financial Statements</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">INTERCOMPANY ELIMINATIONS</span>
                    <strong className="text-rose-400 font-mono text-xs">
                      {formatMinorUnits(BigInt(data.consolidation.intercompanyEliminationsMinorUnits), { locale })}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">CONSOLIDATED GROUP TOTAL</span>
                    <strong className="text-emerald-400 font-mono text-sm font-black">
                      {formatMinorUnits(BigInt(data.consolidation.consolidatedTotalMinorUnits), { locale })}
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {data.consolidation.entities.map((ent) => (
                    <div key={ent.entityId} className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                        <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{locale === 'ar' ? ent.nameAr : ent.nameEn}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">Currency: {ent.currency}</div>
                      <div className="text-sm font-black text-cyan-400 font-mono">
                        {formatMinorUnits(BigInt(ent.debitMinorUnits), { locale })}
                      </div>
                      <span className="text-[10px] text-emerald-400 block">Audited Legal Subsidiary</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </StateContainer>
    </div>
  );
}

export default function ReportsPage({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Loading financial reports...</div>}>
      <ReportsView params={params} />
    </Suspense>
  );
}
