'use client';

import React, { useEffect, useState } from 'react';
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
  AlertCircle,
  Building2,
  CalendarClock
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
          {/* Header Banner */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white">{t('title')}</h1>
              <p className="text-xs text-slate-400 mt-1">
                {t('activeEntity')}:{' '}
                <span className="font-bold text-emerald-400">
                  {locale === 'ar' ? entity.nameAr : entity.name}
                </span>{' '}
                (TRN: <span className="font-mono text-slate-300">{entity.trn}</span>)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>UAE Federal Law Compliant (Zero-Float)</span>
              </span>
            </div>
          </div>

          {/* Primary Metric KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Cash & Liquidity */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold">{t('cashLiquidity')}</span>
                <Wallet className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-white">
                {formatMinorUnits(data?.cash?.totalMinorUnits, { locale })}
              </div>
              <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 rtl-mirror" />
                <span>+{data?.cash?.changePercentage ?? 0}% vs prior month</span>
              </div>
            </div>

            {/* 2. AR Ageing */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold">{t('arAgeing')}</span>
                <TrendingUp className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-black text-cyan-400">
                {formatMinorUnits(data?.arAgeing?.totalMinorUnits, { locale })}
              </div>
              <div className="text-[11px] text-slate-400">
                Current 0–30d: {formatMinorUnits(data?.arAgeing?.current_0_30, { locale })}
              </div>
            </div>

            {/* 3. VAT 201 Net Liability */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold">{t('vatLiability')}</span>
                <Receipt className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-black text-amber-400">
                {formatMinorUnits(data?.vatLiability?.netPayableMinorUnits, { locale })}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <CalendarClock className="w-3 h-3 text-slate-500" />
                <span>Due: {data?.vatLiability?.dueDate || '2026-11-28'}</span>
              </div>
            </div>

            {/* 4. Month-End Close Readiness */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold">{t('closeStatus')}</span>
                <FileCheck2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-white">
                {data?.closeStatus?.completedSteps ?? 0} / {data?.closeStatus?.totalSteps ?? 8}
              </div>
              <div className="text-[11px] text-emerald-400 font-semibold">
                {t('stepsCompleted', {
                  completed: data?.closeStatus?.completedSteps ?? 0,
                  total: data?.closeStatus?.totalSteps ?? 8
                })}
              </div>
            </div>
          </div>

          {/* Section 2: Detailed AR/AP Ageing & Bank Accounts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AR vs AP Aging Breakdown */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
              <h2 className="text-sm font-bold text-white">AR & AP Ageing Distribution (Integer Fils)</h2>
              <div className="space-y-3">
                {/* AR */}
                <div>
                  <div className="flex justify-between text-xs text-slate-300 font-semibold mb-1">
                    <span>AR (Receivables)</span>
                    <span className="text-cyan-400">
                      {formatMinorUnits(data?.arAgeing?.totalMinorUnits, { locale })}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px] text-center">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">{t('current')}</span>
                      <span className="font-semibold text-slate-200">
                        {formatMinorUnits(data?.arAgeing?.current_0_30, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">{t('days3160')}</span>
                      <span className="font-semibold text-slate-200">
                        {formatMinorUnits(data?.arAgeing?.past_31_60, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">{t('days6190')}</span>
                      <span className="font-semibold text-slate-200">
                        {formatMinorUnits(data?.arAgeing?.past_61_90, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">{t('daysOver90')}</span>
                      <span className="font-semibold text-rose-400">
                        {formatMinorUnits(data?.arAgeing?.over_90, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AP */}
                <div className="pt-2">
                  <div className="flex justify-between text-xs text-slate-300 font-semibold mb-1">
                    <span>AP (Payables)</span>
                    <span className="text-amber-400">
                      {formatMinorUnits(data?.apAgeing?.totalMinorUnits, { locale })}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px] text-center">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">{t('current')}</span>
                      <span className="font-semibold text-slate-200">
                        {formatMinorUnits(data?.apAgeing?.current_0_30, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">{t('days3160')}</span>
                      <span className="font-semibold text-slate-200">
                        {formatMinorUnits(data?.apAgeing?.past_31_60, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">{t('days6190')}</span>
                      <span className="font-semibold text-slate-200">
                        {formatMinorUnits(data?.apAgeing?.past_61_90, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">{t('daysOver90')}</span>
                      <span className="font-semibold text-rose-400">
                        {formatMinorUnits(data?.apAgeing?.over_90, { locale, showCurrencySymbol: false })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Linked Bank Accounts */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
              <h2 className="text-sm font-bold text-white">{t('bankAccounts')}</h2>
              <div className="space-y-3">
                {(data?.cash?.bankAccounts || []).map((acc) => (
                  <div
                    key={acc.iban}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-xs text-slate-100">{acc.name}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">IBAN: {acc.iban}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-400 text-xs">
                        {formatMinorUnits(acc.minorUnits, { locale })}
                      </div>
                      <span className="text-[10px] text-slate-500">Live API Ingested</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Open AI Proposals Inbox */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white">{t('aiProposals')}</h2>
              </div>
              <span className="text-xs bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded-full">
                {data.aiProposals.length} Pending Actions
              </span>
            </div>

            <div className="space-y-3">
              {data.aiProposals.map((prop) => (
                <div
                  key={prop.id}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-white">{prop.title}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800 text-emerald-300">
                        {Math.round(prop.confidence * 100)}% {t('confidence')}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-3">
                      <span>Target: {prop.entity}</span>
                      <span>Action: <code className="text-slate-300 font-mono">{prop.suggestedAction}</code></span>
                      <span>Token Cost: {prop.costTokens} tokens</span>
                    </div>
                  </div>

                  <button className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition flex items-center gap-1 self-start sm:self-auto shrink-0 shadow-md">
                    <span>{t('reviewProposal')}</span>
                    <ChevronRight className="w-3.5 h-3.5 rtl-mirror" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </StateContainer>
  );
}
