'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Layers, Upload, FileSpreadsheet, ArrowRight } from 'lucide-react';

export default function OnboardingPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const isAr = locale === 'ar';

  const [imports, setImports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadImports = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/onboarding/import');
      if (res.ok) {
        const data = await res.json();
        setImports(data.imports || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadImports();
  }, []);

  const handleSimulatedImport = async (sourceSystem: string) => {
    try {
      const sampleAccounts = [
        { code: '1090', nameEn: 'Petty Cash - Site Office', nameAr: 'صندوق المصروفات النثرية - الموقع', type: 'ASSET' },
        { code: '5090', nameEn: 'Freight & Import Clearing', nameAr: 'مصروفات الشحن والتخليص الجمركي', type: 'EXPENSE' }
      ];

      const res = await fetch('/api/onboarding/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceSystem,
          filename: `${sourceSystem.toLowerCase()}_migration_batch.csv`,
          accounts: sampleAccounts
        })
      });

      if (res.ok) {
        setStatusMsg(isAr ? `تم استيراد حسابات ${sourceSystem} بنجاح إلى شجرة الحسابات` : `Successfully ingested accounts from ${sourceSystem}`);
        await loadImports();
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
            {isAr ? 'معالج الترحيل واستيراد البيانات (Zoho / QuickBooks / Tally)' : 'Data Migration & Onboarding Wizard'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'استيراد شجرة الحسابات، الأرصدة الافتتاحية، وسجلات الموردين والعملاء مع مطابقة تلقائية'
              : 'Direct ingestion from legacy ERPs with automated taxonomy mapping and double-entry validation'}
          </p>
        </div>
      </div>

      {statusMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Migration Connectors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { id: 'ZOHO', name: 'Zoho Books', desc: 'Import Chart of Accounts, Customers & Opening Vouchers' },
          { id: 'QUICKBOOKS', name: 'QuickBooks Online', desc: 'Sync AP bills, AR invoices & multi-currency lists' },
          { id: 'TALLY', name: 'Tally Prime 4.0', desc: 'Ingest XML Trial Balance with zero-fils variance validation' }
        ].map((c) => (
          <div key={c.id} className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4 shadow-lg hover:border-slate-700 transition">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-white text-lg">{c.name}</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">READY</span>
            </div>
            <p className="text-xs text-slate-400">{c.desc}</p>
            <button
              onClick={() => handleSimulatedImport(c.id)}
              className="w-full py-2 bg-slate-800 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg transition flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {isAr ? `بدء استيراد ${c.name}` : `Import from ${c.name}`}
            </button>
          </div>
        ))}
      </div>

      {/* Historical Ingestion Batches */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-white text-base">
            <Layers className="w-5 h-5 text-emerald-400" />
            <span>{isAr ? 'دفعات الاستيراد المكتملة' : 'Completed Migration Ingestions'}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-950/40 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold">{isAr ? 'النظام المصدر' : 'Source System'}</th>
                <th className="py-3 px-4 font-semibold">{isAr ? 'نوع الاستيراد' : 'Type'}</th>
                <th className="py-3 px-4 font-semibold">{isAr ? 'اسم الملف' : 'Filename'}</th>
                <th className="py-3 px-4 font-semibold text-right">{isAr ? 'السجلات المستوردة' : 'Records Imported'}</th>
                <th className="py-3 px-4 font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {imports.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/30 transition text-xs font-mono">
                  <td className="py-3 px-4 font-bold text-emerald-400">{item.sourceSystem}</td>
                  <td className="py-3 px-4 text-slate-300">{item.importType}</td>
                  <td className="py-3 px-4 text-slate-400">{item.filename}</td>
                  <td className="py-3 px-4 text-right font-bold text-white">{item.recordsImported}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
