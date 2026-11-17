'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useApp } from '@/context/AppContext';
import { StateContainer } from '@/components/StateContainer';
import { formatMinorUnits, formatZeroFloatMoney } from '@/lib/money';
import {
  Wallet,
  TrendingUp,
  Receipt,
  FileCheck2,
  Bot,
  ArrowUpRight,
  ShieldCheck,
  ChevronRight,
  Building2,
  CalendarClock,
  Plus,
  ArrowRightLeft,
  FileText,
  DollarSign,
  Sparkles,
  CreditCard,
  Landmark,
  ArrowDownLeft,
  CheckCircle2,
  Upload,
  AlertCircle,
  X
} from 'lucide-react';

interface DashboardMetrics {
  entityId: string;
  period: string;
  cash: {
    totalMinorUnits: string;
    currency: string;
    changePercentage: number;
    bankAccounts: Array<{ name: string; iban: string; minorUnits: string }>;
  };
  arAgeing: {
    totalMinorUnits: string;
    current_0_30: string;
    past_31_60: string;
    past_61_90: string;
    over_90: string;
  };
  apAgeing: {
    totalMinorUnits: string;
    current_0_30: string;
    past_31_60: string;
    past_61_90: string;
    over_90: string;
  };
  vatLiability: {
    netPayableMinorUnits: string;
    outputVatMinorUnits: string;
    inputVatRecoverableMinorUnits: string;
    dueDate: string;
    formBoxStatus: string;
  };
  closeStatus: {
    completedSteps: number;
    totalSteps: number;
    period: string;
    daysRemaining: number;
    checklist: Array<{ step: number; name: string; status: string }>;
  };
  aiProposals: Array<{
    id: string;
    title: string;
    confidence: number;
    entity: string;
    suggestedAction: string;
    amountMinorUnits: string;
    costTokens: number;
  }>;
}

export default function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const router = useRouter();
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  useEffect(() => {
    params.then((p) => setLocale(p.locale as 'en' | 'ar'));
  }, [params]);

  const t = useTranslations('dashboard');
  const { entity } = useApp();

  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isUnauthorized, setIsUnauthorized] = useState<boolean>(false);

  // AI OCR Scanner Modal State on Dashboard
  const [isOcrOpen, setIsOcrOpen] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrSuccessMsg, setOcrSuccessMsg] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setIsLoading(true);
    setIsError(false);
    setIsUnauthorized(false);
    try {
      const res = await fetch(`/api/dashboard/metrics?entityId=${entity.id}`);
      if (res.status === 403) {
        setIsUnauthorized(true);
        return;
      }
      if (!res.ok) {
        throw new Error('API server returned status ' + res.status);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setIsError(true);
      setErrorMessage(err.message || 'Error communicating with ledger API');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [entity.id]);

  const handleExtractOcr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ocrFile) return;
    setOcrError(null);
    setOcrResult(null);
    setIsExtracting(true);

    try {
      const formData = new FormData();
      formData.append('file', ocrFile);

      const res = await fetch('/api/ai/ocr/extract-invoice', {
        method: 'POST',
        body: formData,
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

  const handleViewInBills = () => {
    setIsOcrOpen(false);
    setOcrResult(null);
    setOcrFile(null);
    router.push(`/${locale}/app/payables/bills`);
  };

  const closePercentage = data?.closeStatus?.totalSteps
    ? Math.round(((data.closeStatus.completedSteps || 0) / data.closeStatus.totalSteps) * 100)
    : 75;

  return (
    <StateContainer
      isLoading={isLoading}
      isError={isError}
      errorMessage={errorMessage}
      isUnauthorized={isUnauthorized}
      requiredRole="CHIEF_ACCOUNTANT"
      isEmpty={!data}
      onRetry={fetchMetrics}
    >
      {data && (
        <div className="space-y-6">
          {/* Notification banner if OCR just completed */}
          {ocrSuccessMsg && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{ocrSuccessMsg}</span>
              </div>
              <button onClick={() => setOcrSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* YC Executive Hero Header with Quick Action Bar */}
          <div className="p-6 sm:p-7 rounded-3xl bg-white border border-[#E8E4DC] shadow-[0_4px_24px_-4px_rgba(28,25,23,0.06)] relative overflow-hidden">
            {/* Ambient Lighting Accent */}
            <div className="absolute top-0 end-0 w-96 h-96 bg-amber-100/30 rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/90 tracking-wider">
                    UAE STATUTORY COMPLIANT
                  </span>
                  <span className="text-stone-300">•</span>
                  <span className="text-xs font-mono text-stone-500">
                    TRN: <strong className="text-stone-800">{entity.trn}</strong>
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-stone-900">
                  {locale === 'ar' ? entity.nameAr : entity.name}
                </h1>
                <p className="text-xs text-stone-600 max-w-2xl leading-relaxed">
                  {locale === 'ar'
                    ? 'مركز التحكم والقيادة المالية الموحدة للمجموعة: نظام دفتر الأستاذ الفيدرالي بدقة الفلس الصفرية، ضريبة الشركات بنسبة 9%، وامتثال الفوترة الإلكترونية Peppol PINT.'
                    : 'Group Treasury & General Ledger Command: Zero-Float integer fils accuracy, UAE 9% Corporate Tax readiness, and real-time Peppol PINT statutory compliance.'}
                </p>
              </div>

              {/* Quick Actions Toolbar */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {/* Instant OCR Scanner Trigger Modal */}
                <button
                  type="button"
                  onClick={() => setIsOcrOpen(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition duration-200 shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                  <span className="text-white">{locale === 'ar' ? 'مسح الفواتير (AI OCR)' : 'Scan Bill (AI OCR)'}</span>
                </button>

                <Link
                  href={`/${locale}/app/ledger/journals`}
                  className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs transition duration-200 shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-white" />
                  <span className="text-white">{locale === 'ar' ? 'قيد محاسبي جديد' : 'New Journal'}</span>
                </Link>
                <Link
                  href={`/${locale}/app/invoicing/sales`}
                  className="px-4 py-2 rounded-xl bg-[#F6F3EB] hover:bg-[#EFEAE0] border border-[#E8E4DC] text-stone-800 font-semibold text-xs transition duration-200 shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5 text-sky-700" />
                  <span>{locale === 'ar' ? 'إصدار فاتورة' : 'Sales Invoice'}</span>
                </Link>
                <Link
                  href={`/${locale}/app/tax/vat201`}
                  className="px-4 py-2 rounded-xl bg-[#F6F3EB] hover:bg-[#EFEAE0] border border-[#E8E4DC] text-stone-800 font-semibold text-xs transition duration-200 shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-700" />
                  <span>{locale === 'ar' ? 'إقرار ضريبة 201' : 'VAT 201'}</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Primary Metric KPI Cards (YC Tier Crisp White Surfaces) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {/* 1. Cash & Liquidity */}
            <div className="p-5 rounded-2xl bg-white border border-[#E8E4DC] hover:border-emerald-500/60 transition-all duration-300 shadow-sm space-y-3 group">
              <div className="flex items-center justify-between text-stone-500">
                <span className="text-xs font-semibold uppercase tracking-wider">{t('cashLiquidity')}</span>
                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 group-hover:scale-105 transition duration-300">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                  {formatMinorUnits(data?.cash?.totalMinorUnits, { locale })}
                </div>
                <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 mt-1">
                  <ArrowUpRight className="w-3.5 h-3.5 rtl-mirror" />
                  <span>+{data?.cash?.changePercentage ?? 14.2}% {locale === 'ar' ? 'مقارنة بالشهر السابق' : 'vs prior month'}</span>
                </div>
              </div>
            </div>

            {/* 2. AR Ageing */}
            <div className="p-5 rounded-2xl bg-white border border-[#E8E4DC] hover:border-sky-500/60 transition-all duration-300 shadow-sm space-y-3 group">
              <div className="flex items-center justify-between text-stone-500">
                <span className="text-xs font-semibold uppercase tracking-wider">{t('arAgeing')}</span>
                <div className="p-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 group-hover:scale-105 transition duration-300">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-sky-700 tracking-tight">
                  {formatMinorUnits(data?.arAgeing?.totalMinorUnits, { locale })}
                </div>
                <div className="text-[11px] text-stone-500 flex items-center gap-1.5 mt-1 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />
                  <span>0–30d: {formatMinorUnits(data?.arAgeing?.current_0_30, { locale })}</span>
                </div>
              </div>
            </div>

            {/* 3. VAT 201 Net Liability */}
            <div className="p-5 rounded-2xl bg-white border border-[#E8E4DC] hover:border-amber-500/60 transition-all duration-300 shadow-sm space-y-3 group">
              <div className="flex items-center justify-between text-stone-500">
                <span className="text-xs font-semibold uppercase tracking-wider">{t('vatLiability')}</span>
                <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 group-hover:scale-105 transition duration-300">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-amber-700 tracking-tight">
                  {formatMinorUnits(data?.vatLiability?.netPayableMinorUnits, { locale })}
                </div>
                <div className="text-[11px] text-stone-500 flex items-center gap-1.5 mt-1 font-mono">
                  <CalendarClock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Due: {data?.vatLiability?.dueDate || '2026-11-28'}</span>
                </div>
              </div>
            </div>

            {/* 4. Month-End Close Readiness */}
            <div className="p-5 rounded-2xl bg-white border border-[#E8E4DC] hover:border-emerald-500/60 transition-all duration-300 shadow-sm space-y-3 group">
              <div className="flex items-center justify-between text-stone-500">
                <span className="text-xs font-semibold uppercase tracking-wider">{t('closeStatus')}</span>
                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 group-hover:scale-105 transition duration-300">
                  <FileCheck2 className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                    {data?.closeStatus?.completedSteps ?? 6} <span className="text-stone-400 text-lg font-normal">/ {data?.closeStatus?.totalSteps ?? 8}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-700">{closePercentage}%</span>
                </div>
                {/* Visual Progress Bar */}
                <div className="w-full bg-[#FAF8F5] border border-[#E8E4DC] rounded-full h-2 mt-2.5 overflow-hidden">
                  <div 
                    className="bg-emerald-600 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${closePercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Detailed AR/AP Ageing & Institutional Bank Feeds */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AR vs AP Aging Breakdown */}
            <div className="p-6 rounded-2xl bg-white border border-[#E8E4DC] shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3.5">
                <div>
                  <h2 className="text-sm font-bold text-stone-900 tracking-tight">
                    {locale === 'ar' ? 'توزيع أعمار الذمم المدينة والدائنة' : 'AR & AP Ageing Distribution'}
                  </h2>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {locale === 'ar' ? 'حساب دقيق بالفلس الإماراتي الصارم (Zero-Float)' : 'Strict integer minor units (Fils) precision'}
                  </p>
                </div>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#FAF8F5] text-stone-700 border border-[#E8E4DC]">
                  IFRS 9
                </span>
              </div>

              <div className="space-y-4">
                {/* AR Section */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-stone-700 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-sky-600" />
                      <span>{locale === 'ar' ? 'الذمم المدينة (العملاء)' : 'AR (Receivables)'}</span>
                    </span>
                    <span className="text-sky-700 font-mono font-bold">
                      {formatMinorUnits(data?.arAgeing?.totalMinorUnits, { locale })}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px] text-center">
                    <div className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8E4DC]">
                      <span className="text-stone-500 block text-[10px] uppercase font-bold">{t('current')}</span>
                      <span className="font-semibold text-stone-800 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.arAgeing?.current_0_30, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8E4DC]">
                      <span className="text-stone-500 block text-[10px] uppercase font-bold">{t('days3160')}</span>
                      <span className="font-semibold text-stone-800 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.arAgeing?.past_31_60, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8E4DC]">
                      <span className="text-stone-500 block text-[10px] uppercase font-bold">{t('days6190')}</span>
                      <span className="font-semibold text-stone-800 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.arAgeing?.past_61_90, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200">
                      <span className="text-rose-600 block text-[10px] uppercase font-bold">{t('daysOver90')}</span>
                      <span className="font-semibold text-rose-700 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.arAgeing?.over_90, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AP Section */}
                <div className="space-y-2 pt-2 border-t border-[#E8E4DC]">
                  <div className="flex justify-between text-xs text-stone-700 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-600" />
                      <span>{locale === 'ar' ? 'الذمم الدائنة (الموردين)' : 'AP (Payables)'}</span>
                    </span>
                    <span className="text-amber-700 font-mono font-bold">
                      {formatMinorUnits(data?.apAgeing?.totalMinorUnits, { locale })}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px] text-center">
                    <div className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8E4DC]">
                      <span className="text-stone-500 block text-[10px] uppercase font-bold">{t('current')}</span>
                      <span className="font-semibold text-stone-800 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.apAgeing?.current_0_30, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8E4DC]">
                      <span className="text-stone-500 block text-[10px] uppercase font-bold">{t('days3160')}</span>
                      <span className="font-semibold text-stone-800 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.apAgeing?.past_31_60, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8E4DC]">
                      <span className="text-stone-500 block text-[10px] uppercase font-bold">{t('days6190')}</span>
                      <span className="font-semibold text-stone-800 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.apAgeing?.past_61_90, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200">
                      <span className="text-rose-600 block text-[10px] uppercase font-bold">{t('daysOver90')}</span>
                      <span className="font-semibold text-rose-700 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.apAgeing?.over_90, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Institutional Bank Accounts */}
            <div className="p-6 rounded-2xl bg-white border border-[#E8E4DC] shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3.5">
                <div>
                  <h2 className="text-sm font-bold text-stone-900 tracking-tight">
                    {locale === 'ar' ? 'الحسابات المصرفية والخزينة' : 'Institutional Bank Treasury'}
                  </h2>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {locale === 'ar' ? 'ربط مباشر مع منصة مصرف الإمارات المركزي (Open Finance)' : 'Direct live CBUAE Open Finance connectivity'}
                  </p>
                </div>
                <Link
                  href={`/${locale}/app/banking/reconciliation`}
                  className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-1 transition"
                >
                  <span>Reconcile</span>
                  <ChevronRight className="w-3.5 h-3.5 rtl-mirror" />
                </Link>
              </div>

              <div className="space-y-3">
                {(data?.cash?.bankAccounts || []).map((acc) => (
                  <div
                    key={acc.iban}
                    className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8E4DC] flex items-center justify-between hover:border-emerald-500 transition group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                        <Landmark className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-stone-900 group-hover:text-emerald-700 transition">
                          {acc.name}
                        </div>
                        <div className="text-[10px] font-mono text-stone-500 mt-0.5">
                          IBAN: {acc.iban}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-stone-900 text-sm font-mono">
                        {formatMinorUnits(acc.minorUnits, { locale })}
                      </div>
                      <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-1 justify-end">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                        <span>Live Sync</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Open Autonomous AI Proposals Inbox */}
          <div className="p-6 rounded-2xl bg-white border border-[#E8E4DC] shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-stone-900 tracking-tight">
                      {locale === 'ar' ? 'مقترحات الذكاء الاصطناعي المستقل' : 'Autonomous AI Financial Co-Pilot'}
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Claude 3.7 Sonnet
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {locale === 'ar'
                      ? 'اقتراحات قيود محاسبية، مطابقة بنكية تلقائية، وتصنيف مصروفات بانتظار الاعتماد المالي'
                      : 'Pending automated journal reconciliations and variance resolutions awaiting controller sign-off'}
                  </p>
                </div>
              </div>

              <Link
                href={`/${locale}/app/ai/proposals`}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 transition"
              >
                <span>View All (3)</span>
                <ChevronRight className="w-4 h-4 rtl-mirror" />
              </Link>
            </div>

            <div className="space-y-3">
              {(data?.aiProposals || []).map((prop) => (
                <div
                  key={prop.id}
                  className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8E4DC] flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-emerald-500 transition duration-200 group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-xs text-stone-900 group-hover:text-emerald-700 transition">
                        {prop.title}
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                        {Math.round(prop.confidence * 100)}% {t('confidence')}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-500 flex flex-wrap items-center gap-3">
                      <span>Target: <strong className="text-stone-800">{prop.entity}</strong></span>
                      <span>Action: <code className="text-emerald-800 font-mono bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">{prop.suggestedAction}</code></span>
                      <span className="font-mono text-stone-400">Telemetry: {prop.costTokens} tokens</span>
                    </div>
                  </div>

                  <Link
                    href={`/${locale}/app/ai/proposals`}
                    className="px-3.5 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs transition flex items-center gap-1.5 self-start sm:self-auto shrink-0 shadow-xs"
                  >
                    <span>{t('reviewProposal')}</span>
                    <ChevronRight className="w-3.5 h-3.5 rtl-mirror" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI OCR Bill Scanner Modal - Accessible directly on Dashboard */}
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
                    {locale === 'ar' ? 'المسح الذكي لفواتير الموردين (AI OCR)' : 'Vendor Invoice & Receipt OCR Scanner'}
                  </h3>
                  <p className="text-xs text-stone-500">
                    {locale === 'ar'
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
                      id="dashboard-invoice-ocr-file"
                      accept=".pdf,.png,.jpg,.jpeg,.txt"
                      className="hidden"
                      onChange={(e) => setOcrFile(e.target.files?.[0] || null)}
                    />
                    <label htmlFor="dashboard-invoice-ocr-file" className="cursor-pointer flex flex-col items-center gap-2">
                      <div className="p-3 bg-emerald-50 rounded-full text-emerald-700 border border-emerald-200">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-semibold text-stone-900">
                        {ocrFile ? ocrFile.name : (locale === 'ar' ? 'اختر ملف الفاتورة أو الإيصال (PDF، صورة)' : 'Click to select invoice (PDF, Image, PNG, JPG)')}
                      </span>
                      <span className="text-xs text-stone-500">
                        {locale === 'ar' ? 'يدعم الفواتير الضريبية ثنائية اللغة (عربي / إنجليزي)' : 'Supports bilingual UAE tax invoices (Arabic & English)'}
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
                      {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={!ocrFile || isExtracting}
                      className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
                    >
                      {isExtracting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>{locale === 'ar' ? 'جارٍ المسح والاستخراج...' : 'Extracting with AI...'}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{locale === 'ar' ? 'بدء استخراج البيانات' : 'Extract Invoice Data'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-[#FAF8F5] rounded-xl border border-[#E8E4DC] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-stone-900 text-sm">{ocrResult.vendorName || 'Extracted Vendor'}</div>
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
                        <div className="text-stone-400 text-[10px] uppercase font-mono">{locale === 'ar' ? 'الرقم الضريبي' : 'TRN'}</div>
                        <div className="font-mono text-stone-800 font-medium">{ocrResult.vendorTrn || '—'}</div>
                      </div>
                      <div>
                        <div className="text-stone-400 text-[10px] uppercase font-mono">{locale === 'ar' ? 'رقم الفاتورة' : 'Invoice #'}</div>
                        <div className="font-mono text-emerald-600 font-semibold">{ocrResult.invoiceNumber}</div>
                      </div>
                      <div>
                        <div className="text-stone-400 text-[10px] uppercase font-mono">{locale === 'ar' ? 'التاريخ' : 'Date'}</div>
                        <div className="font-mono text-stone-700">{ocrResult.invoiceDate}</div>
                      </div>
                      <div>
                        <div className="text-stone-400 text-[10px] uppercase font-mono">{locale === 'ar' ? 'المجموع الكلي' : 'Total'}</div>
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
                      {locale === 'ar' ? 'مسح ملف آخر' : 'Scan Another File'}
                    </button>
                    <button
                      type="button"
                      onClick={handleViewInBills}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{locale === 'ar' ? 'عرض واعتماد في فواتير الموردين' : 'Proceed to Bills & 3-Way Match'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </StateContainer>
  );
}
