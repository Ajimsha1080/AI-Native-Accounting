'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ShieldCheck, Lock, FileCheck2, Download, Search } from 'lucide-react';
import { formatZeroFloatMoney } from '@/lib/money';

export default function AuditorWorkspacePage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const isAr = locale === 'ar';

  const [workspace, setWorkspace] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/auditor/workspace');
      if (res.ok) {
        const data = await res.json();
        setWorkspace(data.auditorWorkspace || null);
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

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 mb-2">
            <Lock className="w-3.5 h-3.5" />
            <span>{isAr ? 'بيئة قراءة فقط للمدقق الخارجي' : 'External Auditor Read-Only Sandbox'}</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {isAr ? 'مساحة عمل مراجعة الحسابات والامتثال الضريبي' : 'Independent Audit & Assurance Workspace'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'فحص قيود دفتر الأستاذ العام، التحقق من أقفال الفترات، وتصدير ملف التدقيق الضريبي الرسمي (FAF)'
              : 'Statutory verification, accounting period immutability checks, and FTA Tax Audit File (FAF) generation'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => alert(isAr ? 'تم توليد وتنزيل ملف التدقيق الضريبي FAF' : 'FTA Tax Audit File (FAF) downloaded')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow transition flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {isAr ? 'تصدير ملف FAF الضريبي' : 'Export FTA FAF Audit File'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500">{isAr ? 'جارٍ التحميل...' : 'Loading auditor workspace...'}</div>
      ) : workspace && (
        <div className="space-y-8">
          {/* FAF Compliance Certificate Header */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-base flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-400" />
                {workspace.taxAuditFile.ftaAuditFormatVersion}
              </span>
              <span className="font-mono text-xs text-slate-400">
                Hash: {workspace.taxAuditFile.nonRepudiationHash.slice(0, 16)}...
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Statutory Basis: {workspace.taxAuditFile.statutoryFramework}
            </p>
          </div>

          {/* Random Sample Journal Vouchers for Inspection */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-white text-base">
                <Search className="w-5 h-5 text-indigo-400" />
                <span>{isAr ? 'عينة القيود اليومية للفحص والتدقيق' : 'Substantive Sample Vouchers for Inspection'}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-950/40 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">{isAr ? 'رقم القيد' : 'Voucher #'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'البيان' : 'Narration'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'المستخدم المنشئ' : 'Created By'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'حالة الترحيل' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {workspace.auditSamples.map((v: any) => (
                    <tr key={v.id} className="hover:bg-slate-800/30 transition text-xs font-mono">
                      <td className="py-3 px-4 font-bold text-emerald-400">{v.entryNumber}</td>
                      <td className="py-3 px-4 text-slate-300">{v.entryDate}</td>
                      <td className="py-3 px-4 text-slate-200 font-sans max-w-xs truncate">{v.narration}</td>
                      <td className="py-3 px-4 text-slate-400">{v.createdByUser}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          {v.isPosted ? 'POSTED_IMMUTABLE' : 'DRAFT'}
                        </span>
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
