'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { formatZeroFloatMoney } from '@/lib/money';
import { CheckCircle2, ArrowDownLeft, ArrowUpRight, DollarSign } from 'lucide-react';

export default function CustomerPaymentsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const isAr = locale === 'ar';

  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/customers/payments');
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {isAr ? 'العملاء وتسويات المقبوضات والمدفوعات' : 'Customers & Payment Allocations'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'تسوية المقبوضات البنكية ومطابقة الفواتير بدقة الفلس دون انحراف تقريبي'
              : 'Customer receipts, invoice settlements, and integer-fils ledger allocations'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500">{isAr ? 'جارٍ التحميل...' : 'Loading payments...'}</div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'رقم الدفعة' : 'Payment Number'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'النوع' : 'Type'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'الطرف المقابل' : 'Partner'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                  <th className="py-3.5 px-4 font-semibold text-right">{isAr ? 'المبلغ' : 'Amount (AED)'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'التخصيص' : 'Allocated Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4 font-mono font-medium text-emerald-400">{p.paymentNumber}</td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        p.paymentType === 'INBOUND_CUSTOMER'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                      }`}>
                        {p.paymentType === 'INBOUND_CUSTOMER' ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                        {p.paymentType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {isAr ? p.partnerNameAr || p.partnerNameEn : p.partnerNameEn}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 font-mono text-xs">{p.paymentDate}</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                      {formatZeroFloatMoney(p.amountBase ?? '0', locale)}
                    </td>
                    <td className="py-3.5 px-4">
                      {p.allocation ? (
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                          {isAr ? 'مخصص بالكامل' : '100% Allocated'}
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-slate-500">{isAr ? 'غير مخصص' : 'Unallocated'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
