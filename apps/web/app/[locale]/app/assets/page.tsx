'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { formatZeroFloatMoney } from '@/lib/money';
import { CheckCircle2, Boxes, Building, Calendar, DollarSign } from 'lucide-react';

export default function FixedAssetsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const isAr = locale === 'ar';

  const [assets, setAssets] = useState<any[]>([]);
  const [leases, setLeases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [faRes, ifrsRes] = await Promise.all([
        fetch('/api/assets/fixed'),
        fetch('/api/ifrs/revenue-leases')
      ]);
      if (faRes.ok) {
        const faData = await faRes.json();
        setAssets(faData.assets || []);
      }
      if (ifrsRes.ok) {
        const ifrsData = await ifrsRes.json();
        setLeases(ifrsData.ifrs16 || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePostDepreciation = async (assetId: string, amountBase: string) => {
    try {
      const res = await fetch('/api/assets/fixed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, amountBase, periodDate: '2026-02-28' })
      });
      if (res.ok) {
        setStatusMsg(isAr ? 'تم ترحيل إهلاك الأصول بنجاح إلى دفتر الأستاذ' : 'Depreciation posted successfully to GL');
        await loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {isAr ? 'الأصول الثابتة وعقود الإيجار (IFRS 16)' : 'Fixed Assets & IFRS 16 Leases'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'سجل الأصول، جداول الإهلاك الخطي، وتطبيق معيار IFRS 16 للأصول التمويلية'
              : 'Fixed asset register, statutory straight-line depreciation, and IFRS 16 ROU lease schedules'}
          </p>
        </div>
      </div>

      {statusMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{statusMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-500">{isAr ? 'جارٍ التحميل...' : 'Loading asset data...'}</div>
      ) : (
        <div className="space-y-8">
          {/* Fixed Assets Register */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-white text-base">
                <Boxes className="w-5 h-5 text-emerald-400" />
                <span>{isAr ? 'سجل الأصول الثابتة' : 'Fixed Assets Register'}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-950/40 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-4 font-semibold">{isAr ? 'رقم الأصل' : 'Asset #'}</th>
                    <th className="py-3.5 px-4 font-semibold">{isAr ? 'اسم الأصل' : 'Description'}</th>
                    <th className="py-3.5 px-4 font-semibold text-right">{isAr ? 'تكلفة الاقتناء' : 'Acquisition Cost'}</th>
                    <th className="py-3.5 px-4 font-semibold text-right">{isAr ? 'مجمع الإهلاك' : 'Accumulated Dep.'}</th>
                    <th className="py-3.5 px-4 font-semibold text-right">{isAr ? 'صافي القيمة الدفترية' : 'Net Book Value'}</th>
                    <th className="py-3.5 px-4 font-semibold text-center">{isAr ? 'الإجراء' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {assets.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-mono font-medium text-emerald-400">{a.assetNumber}</td>
                      <td className="py-3.5 px-4 font-semibold text-white">{a.nameEn}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-white">
                        {formatZeroFloatMoney(BigInt(a.acquisitionCostBase), locale)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-amber-400">
                        {formatZeroFloatMoney(BigInt(a.accumulatedDepreciationBase), locale)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                        {formatZeroFloatMoney(BigInt(a.netBookValueBase), locale)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handlePostDepreciation(a.id, '1000000')}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-xs shadow transition"
                        >
                          {isAr ? 'ترحيل قسط الإهلاك' : 'Post Depreciation'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* IFRS 16 Leases */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-white text-base">
                <Building className="w-5 h-5 text-indigo-400" />
                <span>{isAr ? 'عقود الإيجار التشغيلي والتمويلي (IFRS 16)' : 'IFRS 16 Lease Contracts & ROU Assets'}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-950/40 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-4 font-semibold">{isAr ? 'رقم العقد' : 'Contract #'}</th>
                    <th className="py-3.5 px-4 font-semibold">{isAr ? 'مدة العقد (أشهر)' : 'Term (Months)'}</th>
                    <th className="py-3.5 px-4 font-semibold text-right">{isAr ? 'الدفع الشهري' : 'Monthly Payment'}</th>
                    <th className="py-3.5 px-4 font-semibold text-right">{isAr ? 'أصل حق الاستخدام (ROU)' : 'Initial ROU Asset'}</th>
                    <th className="py-3.5 px-4 font-semibold text-right">{isAr ? 'التزام عقد الإيجار' : 'Lease Liability'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {leases.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-mono font-medium text-indigo-400">{l.contractNumber}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">{l.leaseTermMonths}m</td>
                      <td className="py-3.5 px-4 text-right font-mono text-white">
                        {formatZeroFloatMoney(BigInt(l.monthlyPaymentBase), locale)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                        {formatZeroFloatMoney(BigInt(l.rouAssetBase), locale)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-400">
                        {formatZeroFloatMoney(BigInt(l.leaseLiabilityBase), locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
