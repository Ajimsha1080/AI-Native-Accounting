'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { formatZeroFloatMoney } from '@/lib/money';
import { CheckCircle2, XCircle, AlertCircle, Clock, ShieldCheck } from 'lucide-react';

export default function VendorBillsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const isAr = locale === 'ar';

  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadBills = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/vendors/bills');
      if (res.ok) {
        const data = await res.json();
        setBills(data.bills || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBills();
  }, []);

  const handleApprovalAction = async (billId: string, action: 'APPROVE' | 'REJECT') => {
    try {
      const res = await fetch('/api/vendors/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId, action, notes: `Actioned via Enterprise Payables Workbench by Controller` })
      });
      if (res.ok) {
        setActionMessage(isAr ? `تمت معالجة الفاتورة بنجاح: ${action}` : `Bill successfully updated: ${action}`);
        await loadBills();
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
            {isAr ? 'فواتير الموردين والاعتمادات المالية' : 'Vendor Bills & Tiered Approvals'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'إدارة حسابات الموردين، مطابقة الفواتير ثلاثية الأطراف، ودورات الاعتماد المالي'
              : 'Accounts payable management, 3-way matching, and hierarchical approval workflows'}
          </p>
        </div>
      </div>

      {actionMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{actionMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-500">{isAr ? 'جارٍ التحميل...' : 'Loading vendor bills...'}</div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'رقم الفاتورة' : 'Bill Number'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'المورد' : 'Vendor'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'المطابقة' : '3-Way Match'}</th>
                  <th className="py-3.5 px-4 font-semibold text-right">{isAr ? 'المبلغ الإجمالي' : 'Total (AED)'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'حالة الاعتماد' : 'Approval Status'}</th>
                  <th className="py-3.5 px-4 font-semibold text-center">{isAr ? 'الإجراء' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {bills.map((bill) => {
                  const isPending = bill.status === 'PENDING_APPROVAL' || bill.approval?.status === 'PENDING';
                  return (
                    <tr key={bill.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-mono font-medium text-emerald-400">{bill.billNumber}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{isAr ? bill.vendorNameAr || bill.vendorNameEn : bill.vendorNameEn}</div>
                        <div className="text-xs text-slate-400 font-mono">TRN: {bill.vendorTrn || 'N/A'}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 font-mono text-xs">{bill.dueDate}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          bill.matchStatus === 'MATCHED_3WAY'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}>
                          {bill.matchStatus === 'MATCHED_3WAY' ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                          {bill.matchStatus}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                        {formatZeroFloatMoney(BigInt(bill.totalBase), locale)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          bill.status === 'APPROVED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : bill.status === 'REJECTED'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                        }`}>
                          {bill.status} {bill.approval?.tier ? `(${bill.approval.tier})` : ''}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {isPending ? (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleApprovalAction(bill.id, 'APPROVE')}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-xs shadow transition flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {isAr ? 'اعتماد' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleApprovalAction(bill.id, 'REJECT')}
                              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold text-xs shadow transition flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              {isAr ? 'رفض' : 'Reject'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">{isAr ? 'مكتمل' : 'Finalized'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
