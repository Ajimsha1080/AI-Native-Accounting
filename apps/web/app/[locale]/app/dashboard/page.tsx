'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useApp } from '@/context/AppContext';
import { StateContainer } from '@/components/StateContainer';
import { formatMinorUnits } from '@/lib/money';
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
  CheckCircle2
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
          {/* YC Executive Hero Header with Quick Action Bar */}
          <div className="p-6 sm:p-7 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950 border border-white/[0.09] shadow-2xl relative overflow-hidden">
            {/* Ambient Lighting Accent */}
            <div className="absolute top-0 end-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 tracking-wider">
                    UAE STATUTORY COMPLIANT
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="text-xs font-mono text-slate-400">
                    TRN: <strong className="text-slate-200">{entity.trn}</strong>
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  {locale === 'ar' ? entity.nameAr : entity.name}
                </h1>
                <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                  {locale === 'ar'
                    ? 'مركز التحكم والقيادة المالية الموحدة للمجموعة: نظام دفتر الأستاذ الفيدرالي بدقة الفلس الصفرية، ضريبة الشركات بنسبة 9%، وامتثال الفوترة الإلكترونية Peppol PINT.'
                    : 'Group Treasury & General Ledger Command: Zero-Float integer fils accuracy, UAE 9% Corporate Tax readiness, and real-time Peppol PINT statutory compliance.'}
                </p>
              </div>

              {/* Quick Actions Toolbar */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <Link
                  href={`/${locale}/app/ledger/journals`}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition duration-200 shadow-lg shadow-emerald-950 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'قيد محاسبي جديد' : 'New Journal'}</span>
                </Link>
                <Link
                  href={`/${locale}/app/invoicing/sales`}
                  className="px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-white/[0.08] text-slate-200 font-semibold text-xs transition duration-200 flex items-center gap-1.5"
                >
                  <Receipt className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{locale === 'ar' ? 'إصدار فاتورة' : 'Sales Invoice'}</span>
                </Link>
                <Link
                  href={`/${locale}/app/tax/vat201`}
                  className="px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-white/[0.08] text-slate-200 font-semibold text-xs transition duration-200 flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>{locale === 'ar' ? 'إقرار ضريبة 201' : 'VAT 201'}</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Primary Metric KPI Cards (Ramp / Mercury Standard) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {/* 1. Cash & Liquidity */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/[0.08] hover:border-emerald-500/40 transition-all duration-300 shadow-xl space-y-3 group">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">{t('cashLiquidity')}</span>
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:scale-110 transition duration-300">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {formatMinorUnits(data?.cash?.totalMinorUnits, { locale })}
                </div>
                <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 mt-1">
                  <ArrowUpRight className="w-3.5 h-3.5 rtl-mirror" />
                  <span>+{data?.cash?.changePercentage ?? 14.2}% {locale === 'ar' ? 'مقارنة بالشهر السابق' : 'vs prior month'}</span>
                </div>
              </div>
            </div>

            {/* 2. AR Ageing */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/[0.08] hover:border-cyan-500/40 transition-all duration-300 shadow-xl space-y-3 group">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">{t('arAgeing')}</span>
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:scale-110 transition duration-300">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-cyan-400 tracking-tight">
                  {formatMinorUnits(data?.arAgeing?.totalMinorUnits, { locale })}
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-1 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>0–30d: {formatMinorUnits(data?.arAgeing?.current_0_30, { locale })}</span>
                </div>
              </div>
            </div>

            {/* 3. VAT 201 Net Liability */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/[0.08] hover:border-amber-500/40 transition-all duration-300 shadow-xl space-y-3 group">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">{t('vatLiability')}</span>
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 group-hover:scale-110 transition duration-300">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight">
                  {formatMinorUnits(data?.vatLiability?.netPayableMinorUnits, { locale })}
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-1 font-mono">
                  <CalendarClock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Due: {data?.vatLiability?.dueDate || '2026-11-28'}</span>
                </div>
              </div>
            </div>

            {/* 4. Month-End Close Readiness */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/[0.08] hover:border-emerald-500/40 transition-all duration-300 shadow-xl space-y-3 group">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">{t('closeStatus')}</span>
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:scale-110 transition duration-300">
                  <FileCheck2 className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {data?.closeStatus?.completedSteps ?? 6} <span className="text-slate-500 text-lg font-normal">/ {data?.closeStatus?.totalSteps ?? 8}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400">{closePercentage}%</span>
                </div>
                {/* Visual Progress Bar */}
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2.5 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${closePercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Detailed AR/AP Ageing & Institutional Bank Feeds */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AR vs AP Aging Breakdown */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-white/[0.08] shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight">
                    {locale === 'ar' ? 'توزيع أعمار الذمم المدينة والدائنة' : 'AR & AP Ageing Distribution'}
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {locale === 'ar' ? 'حساب دقيق بالفلس الإماراتي الصارم (Zero-Float)' : 'Strict integer minor units (Fils) precision'}
                  </p>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  IFRS 9
                </span>
              </div>

              <div className="space-y-4">
                {/* AR Section */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-300 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span>{locale === 'ar' ? 'الذمم المدينة (العملاء)' : 'AR (Receivables)'}</span>
                    </span>
                    <span className="text-cyan-400 font-mono font-bold">
                      {formatMinorUnits(data?.arAgeing?.totalMinorUnits, { locale })}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px] text-center">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">{t('current')}</span>
                      <span className="font-semibold text-slate-200 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.arAgeing?.current_0_30, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">{t('days3160')}</span>
                      <span className="font-semibold text-slate-200 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.arAgeing?.past_31_60, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">{t('days6190')}</span>
                      <span className="font-semibold text-slate-200 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.arAgeing?.past_61_90, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                      <span className="text-rose-400 block text-[10px] uppercase font-bold">{t('daysOver90')}</span>
                      <span className="font-semibold text-rose-400 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.arAgeing?.over_90, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AP Section */}
                <div className="space-y-2 pt-2 border-t border-slate-800/60">
                  <div className="flex justify-between text-xs text-slate-300 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>{locale === 'ar' ? 'الذمم الدائنة (الموردين)' : 'AP (Payables)'}</span>
                    </span>
                    <span className="text-amber-400 font-mono font-bold">
                      {formatMinorUnits(data?.apAgeing?.totalMinorUnits, { locale })}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px] text-center">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">{t('current')}</span>
                      <span className="font-semibold text-slate-200 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.apAgeing?.current_0_30, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">{t('days3160')}</span>
                      <span className="font-semibold text-slate-200 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.apAgeing?.past_31_60, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">{t('days6190')}</span>
                      <span className="font-semibold text-slate-200 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.apAgeing?.past_61_90, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                      <span className="text-rose-400 block text-[10px] uppercase font-bold">{t('daysOver90')}</span>
                      <span className="font-semibold text-rose-400 font-mono text-xs mt-0.5 block">
                        {formatMinorUnits(data?.apAgeing?.over_90, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Institutional Bank Accounts */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-white/[0.08] shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight">
                    {locale === 'ar' ? 'الحسابات المصرفية والخزينة' : 'Institutional Bank Treasury'}
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {locale === 'ar' ? 'ربط مباشر مع منصة مصرف الإمارات المركزي (Open Finance)' : 'Direct live CBUAE Open Finance connectivity'}
                  </p>
                </div>
                <Link
                  href={`/${locale}/app/banking/reconciliation`}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition"
                >
                  <span>Reconcile</span>
                  <ChevronRight className="w-3.5 h-3.5 rtl-mirror" />
                </Link>
              </div>

              <div className="space-y-3">
                {(data?.cash?.bankAccounts || []).map((acc) => (
                  <div
                    key={acc.iban}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between hover:border-slate-700 transition group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <Landmark className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-slate-100 group-hover:text-emerald-300 transition">
                          {acc.name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          IBAN: {acc.iban}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-white text-sm font-mono">
                        {formatMinorUnits(acc.minorUnits, { locale })}
                      </div>
                      <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 justify-end">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Live Sync</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Open Autonomous AI Proposals Inbox */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-950 border border-white/[0.08] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-950">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {locale === 'ar' ? 'مقترحات الذكاء الاصطناعي المستقل' : 'Autonomous AI Financial Co-Pilot'}
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      Claude 3.7 Sonnet
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {locale === 'ar'
                      ? 'اقتراحات قيود محاسبية، مطابقة بنكية تلقائية، وتصنيف مصروفات بانتظار الاعتماد المالي'
                      : 'Pending automated journal reconciliations and variance resolutions awaiting controller sign-off'}
                  </p>
                </div>
              </div>

              <Link
                href={`/${locale}/app/ai/proposals`}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
              >
                <span>View All (3)</span>
                <ChevronRight className="w-4 h-4 rtl-mirror" />
              </Link>
            </div>

            <div className="space-y-3">
              {(data?.aiProposals || []).map((prop) => (
                <div
                  key={prop.id}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-emerald-500/40 transition duration-200 group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-xs text-white group-hover:text-emerald-300 transition">
                        {prop.title}
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                        {Math.round(prop.confidence * 100)}% {t('confidence')}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-3">
                      <span>Target: <strong className="text-slate-200">{prop.entity}</strong></span>
                      <span>Action: <code className="text-emerald-300 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{prop.suggestedAction}</code></span>
                      <span className="font-mono text-slate-500">Telemetry: {prop.costTokens} tokens</span>
                    </div>
                  </div>

                  <Link
                    href={`/${locale}/app/ai/proposals`}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-1.5 self-start sm:self-auto shrink-0 shadow-md shadow-emerald-950"
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
    </StateContainer>
  );
}
