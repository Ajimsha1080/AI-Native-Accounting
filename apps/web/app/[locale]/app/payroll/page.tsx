'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { formatZeroFloatMoney } from '@/lib/money';
import { CheckCircle2, Users, FileText, Download, DollarSign, ShieldAlert } from 'lucide-react';

export default function PayrollWpsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const isAr = locale === 'ar';

  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadPayroll = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/payroll/wps');
      if (res.ok) {
        const data = await res.json();
        setRuns(data.payrollRuns || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayroll();
  }, []);

  const handlePayrollAction = async (payrollRunId: string, action: 'DISBURSE' | 'GENERATE_SIF') => {
    try {
      const res = await fetch('/api/payroll/wps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payrollRunId, action })
      });
      if (res.ok) {
        setStatusMsg(
          action === 'DISBURSE'
            ? (isAr ? 'تم صرف مسير الرواتب وترحيل قيد حماية الأجور (WPS)' : 'Payroll batch successfully disbursed and posted')
            : (isAr ? 'تم توليد ملف SIF المعتمد لمصرف الإمارات المركزي' : 'Central Bank WPS SIF file generated successfully')
        );
        await loadPayroll();
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
            {isAr ? 'الرواتب ونظام حماية الأجور (WPS & EOSG)' : 'Payroll & Wages Protection System (WPS)'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'توليد ملفات SIF المعتمدة لمصرف الإمارات المركزي واحتساب مكافأة نهاية الخدمة (المادة 51)'
              : 'Central Bank compliant SIF batch generation and Article 51 End of Service Gratuity revaluation'}
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
        <div className="p-12 text-center text-slate-500">{isAr ? 'جارٍ التحميل...' : 'Loading payroll batches...'}</div>
      ) : (
        <div className="space-y-6">
          {runs.map((run) => (
            <div key={run.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">
                      {isAr ? `مسير رواتب: ${run.periodYear} - شهر ${run.periodMonth}` : `Payroll Period: ${run.periodYear} - Month ${run.periodMonth}`}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                      {run.sifFileName || 'SIF Pending Generation'} • {run.totalEmployees} {isAr ? 'موظف' : 'Employees'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    run.status === 'DISBURSED'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}>
                    {run.status}
                  </span>

                  {run.status !== 'DISBURSED' && (
                    <button
                      onClick={() => handlePayrollAction(run.id, 'DISBURSE')}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow transition flex items-center gap-1.5"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      {isAr ? 'صرف الرواتب وترحيل القيد' : 'Disburse & Post GL'}
                    </button>
                  )}
                </div>
              </div>

              {/* Employee Breakdown */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-950/40 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4 font-semibold">{isAr ? 'الموظف' : 'Employee Name'}</th>
                      <th className="py-3 px-4 font-semibold">{isAr ? 'رقم الحساب الدولي (IBAN)' : 'IBAN'}</th>
                      <th className="py-3 px-4 font-semibold text-right">{isAr ? 'الراتب الأساسي' : 'Fixed Salary'}</th>
                      <th className="py-3 px-4 font-semibold text-right">{isAr ? 'صافي الراتب' : 'Net Salary'}</th>
                      <th className="py-3 px-4 font-semibold text-right">{isAr ? 'مخصص نهاية الخدمة (Art. 51)' : 'EOSG Accrued'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {run.employees.map((e: any) => (
                      <tr key={e.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 font-semibold text-white">{e.employeeName}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-300">{e.iban}</td>
                        <td className="py-3 px-4 text-right font-mono text-white">
                          {formatZeroFloatMoney(BigInt(e.fixedSalaryBase), locale)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          {formatZeroFloatMoney(BigInt(e.netSalaryBase), locale)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-400">
                          {formatZeroFloatMoney(BigInt(e.eosgAccruedBase), locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
