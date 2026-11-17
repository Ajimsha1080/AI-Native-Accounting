'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { formatZeroFloatMoney } from '@/lib/money';
import { CheckCircle2, XCircle, AlertCircle, ShieldCheck, Upload, FileText, Sparkles, X } from 'lucide-react';

export default function VendorBillsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const isAr = locale === 'ar';

  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // OCR Extraction Modal State
  const [isOcrOpen, setIsOcrOpen] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

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

  const handleExtractOcr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ocrFile) return;

    setIsExtracting(true);
    setOcrError(null);
    setOcrResult(null);

    try {
      const formData = new FormData();
      formData.append('file', ocrFile);

      const res = await fetch('/api/ai/ocr/extract-invoice', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.message || 'OCR extraction failed');
      }

      const json = await res.json();
      setOcrResult(json.data);
    } catch (err: any) {
      setOcrError(err.message || 'Failed to extract invoice');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleCreateDraftFromOcr = () => {
    if (!ocrResult) return;

    const newBill = {
      id: ocrResult.documentId || `ocr-bill-${Date.now()}`,
      billNumber: ocrResult.invoiceNumber || `BILL-${Date.now().toString().slice(-4)}`,
      vendorName: ocrResult.vendorName || 'Extracted Vendor',
      vendorTrn: ocrResult.vendorTrn || '100234567800003',
      dueDate: ocrResult.dueDate || ocrResult.invoiceDate || '2026-11-15',
      matchStatus: ocrResult.isMathValid ? 'MATCHED_3WAY' : 'MANUAL_REVIEW_REQUIRED',
      totalBase: ocrResult.totalFils,
      status: 'PENDING_APPROVAL',
      approvalTier: 'TIER_1_AI_VERIFIED'
    };

    setBills([newBill, ...bills]);
    setIsOcrOpen(false);
    setOcrResult(null);
    setOcrFile(null);
    setActionMessage(isAr ? 'تم استيراد الفاتورة كمسودة بنجاح عبر الذكاء الاصطناعي (OCR)' : 'Invoice successfully extracted and imported as draft bill via AI OCR!');
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
        <button
          onClick={() => setIsOcrOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-purple-900/30 transition transform hover:-translate-y-0.5"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>{isAr ? 'مسح الفاتورة ضوئياً (AI OCR)' : 'Scan Bill (AI OCR)'}</span>
        </button>
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
                  const isPending = bill.status === 'PENDING_APPROVAL' || bill.approval?.status === 'PENDING' || bill.status === 'PENDING';
                  const vendorName = bill.vendorName || bill.vendorNameEn || bill.vendorNameAr || 'Vendor';
                  const matchStatus = bill.matchStatus || 'MATCHED_3WAY';
                  const tier = bill.approvalTier || bill.approval?.tier || '';
                  return (
                    <tr key={bill.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-mono font-medium text-emerald-400">{bill.billNumber || bill.id?.slice(0, 8)}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{vendorName}</div>
                        <div className="text-xs text-slate-400 font-mono">TRN: {bill.vendorTrn || '100234567800003'}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 font-mono text-xs">{bill.dueDate || bill.billDate || '2026-11-01'}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          matchStatus === 'MATCHED_3WAY'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}>
                          {matchStatus === 'MATCHED_3WAY' ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                          {matchStatus}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                        {formatZeroFloatMoney(bill.totalBase ?? bill.totalFils ?? '0', locale)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          bill.status === 'APPROVED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : bill.status === 'REJECTED'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                        }`}>
                          {bill.status} {tier ? `(${tier})` : ''}
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

      {/* AI OCR Bill Scanner Modal */}
      {isOcrOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E4DC] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-[#E8E4DC] flex items-center justify-between bg-[#FDFBF7]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-base">
                    {isAr ? 'المسح الذكي لفواتير الموردين (AI OCR)' : 'Vendor Invoice & Receipt OCR Scanner'}
                  </h3>
                  <p className="text-xs text-stone-500">
                    {isAr
                      ? 'استخراج آلي للرقم الضريبي، التواريخ، البنود وضريبة القيمة المضافة 5%'
                      : 'Automatic extraction of 15-digit UAE TRN, line items, and statutory 5% VAT'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsOcrOpen(false);
                  setOcrResult(null);
                  setOcrError(null);
                }}
                className="p-1.5 text-stone-400 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {!ocrResult ? (
                <form onSubmit={handleExtractOcr} className="space-y-4">
                  <div className="border-2 border-dashed border-[#E8E4DC] hover:border-emerald-500 rounded-xl p-8 text-center transition bg-[#FAF8F5]">
                    <input
                      type="file"
                      id="invoice-ocr-file"
                      accept=".pdf,.png,.jpg,.jpeg,.txt"
                      className="hidden"
                      onChange={(e) => setOcrFile(e.target.files?.[0] || null)}
                    />
                    <label htmlFor="invoice-ocr-file" className="cursor-pointer flex flex-col items-center gap-2">
                      <div className="p-3 bg-emerald-50 rounded-full text-emerald-700 border border-emerald-200">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-semibold text-stone-900">
                        {ocrFile ? ocrFile.name : (isAr ? 'اختر ملف الفاتورة أو الإيصال (PDF، صورة)' : 'Click to select invoice (PDF, Image, PNG, JPG)')}
                      </span>
                      <span className="text-xs text-stone-500">
                        {isAr ? 'يدعم الفواتير الضريبية ثنائية اللغة (عربي / إنجليزي)' : 'Supports bilingual UAE tax invoices (Arabic & English)'}
                      </span>
                    </label>
                  </div>

                  {ocrError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{ocrError}</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsOcrOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-stone-500 hover:text-stone-900 transition rounded-xl"
                    >
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={!ocrFile || isExtracting}
                      className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-2"
                    >
                      {isExtracting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>{isAr ? 'جارٍ المسح والاستخراج...' : 'Extracting with AI...'}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{isAr ? 'بدء استخراج البيانات' : 'Extract Invoice Data'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-[#FAF8F5] rounded-xl border border-[#E8E4DC] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-stone-900 text-sm">{ocrResult.vendorName || 'Vendor'}</div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                          ocrResult.isTrnValid
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {ocrResult.isTrnValid ? 'TRN Valid' : 'TRN Invalid'}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                          ocrResult.isMathValid
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {ocrResult.isMathValid ? 'Math Reconciled' : 'Math Variance'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                      <div>
                        <div className="text-stone-400 text-[10px] uppercase font-mono">{isAr ? 'الرقم الضريبي' : 'TRN'}</div>
                        <div className="font-mono text-stone-800 font-medium">{ocrResult.vendorTrn || '—'}</div>
                      </div>
                      <div>
                        <div className="text-stone-400 text-[10px] uppercase font-mono">{isAr ? 'رقم الفاتورة' : 'Invoice #'}</div>
                        <div className="font-mono text-emerald-600 font-semibold">{ocrResult.invoiceNumber}</div>
                      </div>
                      <div>
                        <div className="text-stone-400 text-[10px] uppercase font-mono">{isAr ? 'التاريخ' : 'Date'}</div>
                        <div className="font-mono text-stone-700">{ocrResult.invoiceDate}</div>
                      </div>
                      <div>
                        <div className="text-stone-400 text-[10px] uppercase font-mono">{isAr ? 'المجموع الكلي' : 'Total'}</div>
                        <div className="font-mono text-stone-900 font-bold">{formatZeroFloatMoney(ocrResult.totalFils, locale)}</div>
                      </div>
                    </div>

                    <div className="text-[11px] text-stone-500 border-t border-[#E8E4DC] pt-2 flex items-center justify-between">
                      <span>Model: <span className="font-mono text-stone-800">{ocrResult.modelUsed}</span></span>
                      <span>Confidence: <span className="font-mono font-bold text-emerald-600">{Math.round(ocrResult.confidenceScore * 100)}%</span></span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setOcrResult(null)}
                      className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition rounded-xl hover:bg-stone-100"
                    >
                      {isAr ? 'مسح ملف آخر' : 'Scan Another File'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateDraftFromOcr}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isAr ? 'اعتماد واستيراد كمسودة فاتورة' : 'Import as Draft Vendor Bill'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
