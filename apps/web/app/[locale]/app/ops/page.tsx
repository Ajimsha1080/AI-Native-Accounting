'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Sliders, Cpu, Activity, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function OpsConsolePage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const isAr = locale === 'ar';

  const [consoleData, setConsoleData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/ops/console');
      if (res.ok) {
        const data = await res.json();
        setConsoleData(data.console || null);
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

  const handleToggleSandbox = async (currentSandbox: boolean) => {
    try {
      const res = await fetch('/api/ops/console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSandbox: !currentSandbox })
      });
      if (res.ok) {
        setStatusMsg(isAr ? 'تم تحديث وضع بيئة الاختبار (Sandbox)' : 'Sandbox mode status successfully updated');
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
            {isAr ? 'لوحة عمليات المنصة وإدارة الاشتراكات' : 'Internal Ops Console & Tenant Governance'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'مراقبة استهلاك الموارد وحصص الذكاء الاصطناعي وإدارة بيئات الاختبار المعزولة'
              : 'Multi-tenant provisioning, sandbox toggles, subscription quotas, and live usage metering'}
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
        <div className="p-12 text-center text-slate-500">{isAr ? 'جارٍ التحميل...' : 'Loading ops telemetry...'}</div>
      ) : consoleData && (
        <div className="space-y-8">
          {/* Subscription Tier & Quotas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-2">
              <span className="text-xs text-slate-400 font-semibold uppercase">{isAr ? 'خطة الاشتراك' : 'Plan Tier'}</span>
              <div className="text-2xl font-extrabold text-emerald-400">{consoleData.subscription.planTier}</div>
              <p className="text-xs text-slate-400">Max Entities: {consoleData.subscription.maxEntities} • Max Invoices: {consoleData.subscription.maxMonthlyInvoices}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-2">
              <span className="text-xs text-slate-400 font-semibold uppercase">{isAr ? 'حالة بيئة الاختبار' : 'Sandbox Mode'}</span>
              <div className="text-2xl font-extrabold text-white">
                {consoleData.subscription.isSandbox ? 'SANDBOX ACTIVE' : 'PRODUCTION LIVE'}
              </div>
              <button
                onClick={() => handleToggleSandbox(consoleData.subscription.isSandbox)}
                className="mt-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded"
              >
                {consoleData.subscription.isSandbox ? 'Switch to Live' : 'Toggle Sandbox'}
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-2">
              <span className="text-xs text-slate-400 font-semibold uppercase">{isAr ? 'دورة الفوترة' : 'Billing Cycle'}</span>
              <div className="text-sm font-mono text-slate-200 mt-1">
                {consoleData.subscription.billingCycleStart} → {consoleData.subscription.billingCycleEnd}
              </div>
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                {consoleData.subscription.status}
              </span>
            </div>
          </div>

          {/* Live Usage Metering */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-white text-base">
                <Activity className="w-5 h-5 text-emerald-400" />
                <span>{isAr ? 'سجل استهلاك الموارد المفوترة' : 'Metered Consumption History'}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-950/40 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">{isAr ? 'الفترة' : 'Period'}</th>
                    <th className="py-3 px-4 font-semibold text-right">{isAr ? 'الفواتير المصدرة' : 'Invoices'}</th>
                    <th className="py-3 px-4 font-semibold text-right">{isAr ? 'رموز الذكاء الاصطناعي' : 'AI Tokens'}</th>
                    <th className="py-3 px-4 font-semibold text-right">{isAr ? 'طلبات API' : 'API Calls'}</th>
                    <th className="py-3 px-4 font-semibold text-right">{isAr ? 'إرساليات WPS' : 'WPS Batches'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {consoleData.usageHistory.map((u: any) => (
                    <tr key={u.periodMonth} className="hover:bg-slate-800/30 transition text-xs font-mono">
                      <td className="py-3 px-4 font-bold text-white">{u.periodMonth}</td>
                      <td className="py-3 px-4 text-right font-medium text-slate-300">{u.invoicesCreated}</td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-400">{u.aiTokensConsumed.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-slate-300">{u.apiCallsCount}</td>
                      <td className="py-3 px-4 text-right text-indigo-400 font-bold">{u.wpsTransmissionsCount}</td>
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
