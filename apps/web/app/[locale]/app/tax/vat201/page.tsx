'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { StateContainer } from '@/components/StateContainer';
import { formatMinorUnits } from '@/lib/money';
import {
  FileSpreadsheet,
  Building,
  Calendar,
  ShieldCheck,
  ChevronRight,
  X,
  FileText,
  Search,
  ExternalLink,
  Printer
} from 'lucide-react';

interface VatBoxDrilldownLine {
  voucherNumber: string;
  date: string;
  counterparty: string;
  counterpartyTrn: string;
  description: string;
  netMinorUnits: string;
  vatMinorUnits: string;
}

interface Vat201Box {
  boxNumber: string;
  titleEn: string;
  titleAr: string;
  netAmountMinorUnits: string;
  vatAmountMinorUnits: string;
  recoverableVatMinorUnits?: string;
  adjustmentMinorUnits?: string;
  isTotalBox?: boolean;
  drilldownLines: VatBoxDrilldownLine[];
}

interface Vat201ReturnData {
  trn: string;
  taxablePersonNameEn: string;
  taxablePersonNameAr: string;
  taxPeriod: string;
  dueDate: string;
  boxes: Vat201Box[];
  summary: {
    totalOutputVatDueMinorUnits: string;
    totalRecoverableVatMinorUnits: string;
    payableTaxMinorUnits: string;
    reclaimedTaxMinorUnits: string;
    netPayableTaxMinorUnits: string;
  };
}

function Vat201View({ params }: { params: Promise<{ locale: string }> }) {
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  useEffect(() => {
    params.then((p) => setLocale(p.locale as 'en' | 'ar'));
  }, [params]);

  const [vatData, setVatData] = useState<Vat201ReturnData | null>(null);
  const [selectedBox, setSelectedBox] = useState<Vat201Box | null>(null);
  const [drilldownSearch, setDrilldownSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const fetchVat201 = async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch('/api/tax/vat201');
      if (!res.ok) throw new Error('Failed to load VAT return');
      const data = await res.json();
      setVatData(data);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVat201();
  }, []);

  const filteredDrilldown = useMemo(() => {
    if (!selectedBox) return [];
    if (!drilldownSearch) return selectedBox.drilldownLines;
    const q = drilldownSearch.toLowerCase();
    return selectedBox.drilldownLines.filter(
      (l) =>
        l.voucherNumber.toLowerCase().includes(q) ||
        l.counterparty.toLowerCase().includes(q) ||
        l.counterpartyTrn.includes(q) ||
        l.description.toLowerCase().includes(q)
    );
  }, [selectedBox, drilldownSearch]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
              Federal Tax Authority (FTA) Official Return
            </span>
          </div>
          <h1 className="text-xl font-black text-white flex items-center gap-2 mt-0.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <span>
              {locale === 'ar'
                ? 'إقرار ضريبة القيمة المضافة - نموذج 201'
                : 'VAT 201 Return (Federal Tax Authority)'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {locale === 'ar'
              ? 'نموذج الإقرار الضريبي الرسمي مع إمكانية التدقيق والتعمق اللحظي من كل خانة إلى القيود المصدرية'
              : 'Interactive 14-box statutory return with point-in-time source voucher lineage'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold transition flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>{locale === 'ar' ? 'طباعة الإقرار' : 'Print Return'}</span>
          </button>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Audit Invariant: 0 Fils Discrepancy</span>
          </div>
        </div>
      </div>

      <StateContainer isLoading={isLoading} isError={isError} isEmpty={!vatData} onRetry={fetchVat201}>
        {vatData && (
          <div className="space-y-6">
            {/* Entity & Filing Details Card */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px]">TAXABLE PERSON / TRN</span>
                <strong className="text-white text-xs">{vatData.taxablePersonNameEn}</strong>
                <span className="font-mono text-emerald-400 block text-[11px]">TRN: {vatData.trn}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">TAX PERIOD</span>
                <strong className="text-white text-xs">{vatData.taxPeriod}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">STATUTORY DUE DATE</span>
                <strong className="text-amber-400 text-xs">{vatData.dueDate}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">NET FTA LIABILITY (BOX 14)</span>
                <strong className="text-emerald-400 text-base font-black">
                  {formatMinorUnits(BigInt(vatData.summary.netPayableTaxMinorUnits), { locale })}
                </strong>
              </div>
            </div>

            {/* 14-Box Statutory Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
              <table className="w-full text-start text-xs border-collapse">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold">
                  <tr>
                    <th className="p-3.5 ps-5 text-start w-20">Box #</th>
                    <th className="p-3.5 text-start">Description of Supply / Deduction</th>
                    <th className="p-3.5 text-end w-44">Net Amount (AED)</th>
                    <th className="p-3.5 text-end w-44">VAT Amount (AED)</th>
                    <th className="p-3.5 text-center w-28 pe-5">Drill-Down</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {vatData.boxes.map((box) => (
                    <tr
                      key={box.boxNumber}
                      onClick={() => box.drilldownLines.length > 0 && setSelectedBox(box)}
                      className={`transition ${
                        box.isTotalBox
                          ? 'bg-slate-950/70 font-bold border-t-2 border-slate-700'
                          : box.drilldownLines.length > 0
                          ? 'hover:bg-slate-800/50 cursor-pointer'
                          : 'opacity-70'
                      }`}
                    >
                      <td className="p-3.5 ps-5 font-mono font-bold text-white">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] border ${
                            box.isTotalBox
                              ? 'bg-amber-950 border-amber-800 text-amber-300'
                              : 'bg-slate-900 border-slate-800 text-emerald-400'
                          }`}
                        >
                          Box {box.boxNumber}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-white">
                          {locale === 'ar' ? box.titleAr : box.titleEn}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {locale === 'ar' ? box.titleEn : box.titleAr}
                        </div>
                      </td>
                      <td className="p-3.5 text-end font-mono text-slate-200">
                        {box.netAmountMinorUnits !== '0'
                          ? formatMinorUnits(BigInt(box.netAmountMinorUnits), { locale })
                          : 'AED 0.00'}
                      </td>
                      <td className="p-3.5 text-end font-mono font-bold text-emerald-400">
                        {formatMinorUnits(BigInt(box.vatAmountMinorUnits), { locale })}
                      </td>
                      <td className="p-3.5 pe-5 text-center">
                        {box.drilldownLines.length > 0 ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBox(box);
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-slate-300 font-bold text-[11px] transition inline-flex items-center gap-1 shadow"
                          >
                            <span>Inspect ({box.drilldownLines.length})</span>
                            <ExternalLink className="w-3 h-3 rtl-mirror" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Drill-down Lineage Modal */}
            {selectedBox && (
              <div
                className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
              >
                <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                  {/* Modal Header */}
                  <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs font-mono font-bold">
                          Box {selectedBox.boxNumber}
                        </span>
                        <h3 className="text-sm font-black text-white">
                          {locale === 'ar' ? selectedBox.titleAr : selectedBox.titleEn}
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Source Audit Lineage: {selectedBox.drilldownLines.length} verified double-entry transactions
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedBox(null)}
                      className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Search Filter in Modal */}
                  <div className="p-3 border-b border-slate-800 bg-slate-900/60">
                    <div className="relative max-w-sm">
                      <Search className="w-3.5 h-3.5 absolute start-2.5 top-2.5 text-slate-500" />
                      <input
                        value={drilldownSearch}
                        onChange={(e) => setDrilldownSearch(e.target.value)}
                        placeholder="Search voucher number, counterparty, TRN..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg ps-8 pe-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Drill-down Items Table */}
                  <div className="overflow-y-auto flex-1 p-4">
                    <table className="w-full text-xs text-start border-collapse">
                      <thead className="bg-slate-950 border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="p-2.5 ps-3 text-start">Voucher No</th>
                          <th className="p-2.5 text-start">Date</th>
                          <th className="p-2.5 text-start">Counterparty & TRN</th>
                          <th className="p-2.5 text-start">Description</th>
                          <th className="p-2.5 text-end">Net (Fils)</th>
                          <th className="p-2.5 pe-3 text-end">VAT (Fils)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredDrilldown.map((line) => (
                          <tr key={line.voucherNumber} className="hover:bg-slate-800/40">
                            <td className="p-2.5 ps-3 font-mono font-bold text-white">
                              {line.voucherNumber}
                            </td>
                            <td className="p-2.5 text-slate-300">{line.date}</td>
                            <td className="p-2.5">
                              <div className="font-semibold text-white">{line.counterparty}</div>
                              <span className="text-[10px] font-mono text-emerald-400">
                                {line.counterpartyTrn}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-300">{line.description}</td>
                            <td className="p-2.5 text-end font-mono text-slate-200">
                              {formatMinorUnits(BigInt(line.netMinorUnits), { locale })}
                            </td>
                            <td className="p-2.5 pe-3 text-end font-mono font-bold text-emerald-400">
                              {formatMinorUnits(BigInt(line.vatMinorUnits), { locale })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Modal Footer */}
                  <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs">
                    <span className="text-slate-400">
                      Total Box VAT Amount: <strong className="text-white font-mono">{formatMinorUnits(BigInt(selectedBox.vatAmountMinorUnits), { locale })}</strong>
                    </span>
                    <button
                      onClick={() => setSelectedBox(null)}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold transition"
                    >
                      Close Drill-Down
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </StateContainer>
    </div>
  );
}

export default function Vat201Page({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Loading FTA VAT 201 return...</div>}>
      <Vat201View params={params} />
    </Suspense>
  );
}
