'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { formatZeroFloatMoney } from '@/lib/money';
import { CheckCircle2, RotateCw, FileCode2, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function EinvoicingQueuePage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const isAr = locale === 'ar';

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadQueue = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/einvoicing/queue');
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleRetry = async (messageId: string) => {
    try {
      const res = await fetch('/api/einvoicing/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, action: 'RETRY' })
      });
      if (res.ok) {
        setStatusMsg(isAr ? 'تمت إعادة الإرسال وحصلت الفاتورة على الاعتماد' : 'Message re-transmitted successfully and cleared');
        await loadQueue();
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
            {isAr ? 'طابور الفوترة الإلكترونية ومعالجة الأخطاء (Peppol PINT-AE)' : 'E-Invoicing Transmission & Failure Queue'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'مراقبة تراخيص الفواتير الصادرة عبر مزود خدمة الاعتماد (ASP) وطابور إعادة المحاولة DLQ'
              : 'Peppol PINT-AE UBL clearance status, cryptographic hash archives, and Dead Letter Queue management'}
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
        <div className="p-12 text-center text-slate-500">{isAr ? 'جارٍ التحميل...' : 'Loading queue...'}</div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'رقم الفاتورة' : 'Invoice Number'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'العميل' : 'Customer'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'نوع الرسالة' : 'Type'}</th>
                  <th className="py-3.5 px-4 font-semibold text-right">{isAr ? 'المبلغ' : 'Amount (AED)'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'حالة الاعتماد' : 'Clearance Status'}</th>
                  <th className="py-3.5 px-4 font-semibold">{isAr ? 'رقم الاعتماد' : 'Clearance Ref'}</th>
                  <th className="py-3.5 px-4 font-semibold text-center">{isAr ? 'الإجراء' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {messages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      {isAr ? 'لا توجد فواتير في الطابور' : 'No messages in transmission queue'}
                    </td>
                  </tr>
                ) : (
                  messages.map((m) => {
                    const isFailed = m.transmissionStatus === 'QUEUED_DLQ' || m.transmissionStatus === 'REJECTED';
                    return (
                      <tr key={m.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4 font-mono font-medium text-emerald-400">{m.invoiceNumber}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{m.customerNameEn}</div>
                          <div className="text-xs text-slate-400 font-mono">TRN: {m.customerTrn}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-indigo-400">{m.messageType}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                          {formatZeroFloatMoney(BigInt(m.totalBase), locale)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            m.transmissionStatus === 'ACCEPTED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}>
                            {m.transmissionStatus === 'ACCEPTED' ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                            {m.transmissionStatus}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                          {m.clearanceReference || 'PENDING'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {isFailed ? (
                            <button
                              onClick={() => handleRetry(m.id)}
                              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold text-xs shadow transition flex items-center gap-1 mx-auto"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              {isAr ? 'إعادة الإرسال' : 'Retry DLQ'}
                            </button>
                          ) : (
                            <span className="text-xs text-emerald-400 font-mono">10Y Archived</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
