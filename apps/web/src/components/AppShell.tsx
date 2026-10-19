'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useApp } from '@/context/AppContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import {
  LayoutDashboard,
  BookOpen,
  Receipt,
  FileSpreadsheet,
  Building2,
  Landmark,
  Bot,
  CalendarCheck2,
  LogOut,
  ChevronDown,
  Search,
  Clock,
  ShieldAlert,
  CreditCard,
  Users,
  Boxes,
  FileCheck,
  ShieldCheck,
  Layers,
  Sliders,
  Sparkles,
  Command,
  ArrowUpRight,
  CheckCircle2,
  X,
  Building,
  KeyRound
} from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  locale: string;
}

export function AppShell({ children, locale }: AppShellProps) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const router = useRouter();
  const {
    tenant,
    entity,
    availableTenants,
    availableEntities,
    fiscalPeriod,
    sessionRemainingSeconds,
    setTenant,
    setEntity,
    refreshSession
  } = useApp();

  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Grouped Navigation for YC-Level Structure
  const navGroups = [
    {
      group: locale === 'ar' ? 'الدفاتر المحاسبية والخزينة' : 'Core Treasury & Ledger',
      items: [
        { href: `/${locale}/app/dashboard`, label: t('navDashboard'), icon: LayoutDashboard },
        { href: `/${locale}/app/ledger/accounts`, label: t('navLedger'), icon: BookOpen },
        { href: `/${locale}/app/ledger/journals`, label: t('navJournals'), icon: Layers },
        { href: `/${locale}/app/invoicing/sales`, label: t('navInvoices'), icon: Receipt },
        { href: `/${locale}/app/payables/bills`, label: t('navPayables'), icon: CreditCard },
        { href: `/${locale}/app/receivables/payments`, label: t('navReceivables'), icon: Receipt },
      ]
    },
    {
      group: locale === 'ar' ? 'الامتثال الضريبي الإماراتي' : 'UAE Tax & Compliance',
      items: [
        { href: `/${locale}/app/tax/vat201`, label: t('navTax'), icon: FileSpreadsheet, badge: 'FTA 201', badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
        { href: `/${locale}/app/einvoicing`, label: t('navEinvoicing'), icon: FileCheck, badge: 'Peppol PINT', badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
        { href: `/${locale}/app/banking/reconciliation`, label: t('navBankRecon'), icon: Landmark },
        { href: `/${locale}/app/payroll`, label: t('navPayroll'), icon: Users, badge: 'WPS', badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
      ]
    },
    {
      group: locale === 'ar' ? 'الذكاء الاصطناعي والأصول' : 'Autonomous AI & Assets',
      items: [
        { 
          href: `/${locale}/app/ai/proposals`, 
          label: t('navAiProposals'), 
          icon: Bot, 
          badge: '3 LIVE', 
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse font-bold' 
        },
        { href: `/${locale}/app/assets`, label: t('navAssets'), icon: Boxes },
        { href: `/${locale}/app/close`, label: t('navClose'), icon: CalendarCheck2 },
      ]
    },
    {
      group: locale === 'ar' ? 'التدقيق والتقارير المالية' : 'Assurance & Governance',
      items: [
        { href: `/${locale}/app/reports`, label: t('navReports'), icon: FileSpreadsheet },
        { href: `/${locale}/app/reports/builder`, label: t('navReportBuilder'), icon: Sliders },
        { href: `/${locale}/app/audit`, label: t('navAuditRoles'), icon: ShieldCheck },
        { href: `/${locale}/app/auditor`, label: t('navAuditor'), icon: ShieldAlert },
        { href: `/${locale}/app/onboarding`, label: t('navOnboarding'), icon: Layers },
        { href: `/${locale}/app/ops`, label: t('navOps'), icon: Sliders },
      ]
    }
  ];

  // Flattened for Command Palette
  const allNavItems = navGroups.flatMap(g => g.items);

  // Global Keyboard shortcut listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandOpen(prev => !prev);
      } else if (e.key === 'Escape' && isCommandOpen) {
        setIsCommandOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandOpen]);

  // Focus input when Command Palette opens
  useEffect(() => {
    if (isCommandOpen) {
      setTimeout(() => commandInputRef.current?.focus(), 50);
    } else {
      setCommandQuery('');
    }
  }, [isCommandOpen]);

  const filteredCommands = allNavItems.filter(item => 
    item.label.toLowerCase().includes(commandQuery.toLowerCase()) ||
    item.href.toLowerCase().includes(commandQuery.toLowerCase())
  );

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    }
    router.push(`/${locale}/login`);
  };

  const minutesRemaining = Math.floor(sessionRemainingSeconds / 60);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Session Expiring Banner */}
      {sessionRemainingSeconds < 300 && (
        <div
          className="bg-amber-500/10 border-b border-amber-500/30 text-amber-300 px-4 py-2 text-xs flex items-center justify-between sticky top-0 z-50 backdrop-blur-md shadow-lg shadow-amber-950/20"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span className="font-medium">{t('sessionExpiringSoon', { minutes: minutesRemaining })}</span>
          </div>
          <button
            onClick={refreshSession}
            className="px-3 py-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg text-[11px] transition shadow-sm"
          >
            Extend Session
          </button>
        </div>
      )}

      {/* Top Universal Header */}
      <header className="border-b border-white/[0.08] bg-slate-950/80 backdrop-blur-xl px-4 sm:px-6 py-2.5 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Logo & Brand Emblem */}
          <Link href={`/${locale}/app/dashboard`} className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 flex items-center justify-center font-black text-white text-sm shadow-[0_0_20px_-3px_rgba(16,185,129,0.5)] group-hover:shadow-[0_0_25px_0_rgba(16,185,129,0.7)] transition duration-300">
              AE
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black tracking-tight text-white group-hover:text-emerald-400 transition">
                  {t('brandName')}
                </span>
                <span className="text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 tracking-wider">
                  v2.4
                </span>
              </div>
            </div>
          </Link>

          <div className="h-4 w-px bg-white/[0.08] hidden md:block" />

          {/* Tenant & Entity Selectors */}
          <div className="hidden lg:flex items-center gap-2.5">
            {/* Tenant Selector */}
            <div className="relative flex items-center">
              <Building className="w-3.5 h-3.5 absolute start-2.5 text-slate-400 pointer-events-none" />
              <select
                id="tenant-select"
                aria-label={t('tenant')}
                value={tenant.id}
                onChange={(e) => {
                  const found = availableTenants.find((t) => t.id === e.target.value);
                  if (found) setTenant(found);
                }}
                className="appearance-none bg-slate-900/90 border border-white/[0.08] hover:border-white/[0.15] focus:border-emerald-500/50 rounded-xl ps-8 pe-7 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none transition cursor-pointer shadow-inner"
              >
                {availableTenants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 absolute end-2.5 text-slate-400 pointer-events-none" />
            </div>

            {/* Entity Selector */}
            <div className="relative flex items-center">
              <Building2 className="w-3.5 h-3.5 absolute start-2.5 text-emerald-400 pointer-events-none" />
              <select
                id="entity-select"
                aria-label={t('entity')}
                value={entity.id}
                onChange={(e) => {
                  const found = availableEntities.find((ent) => ent.id === e.target.value);
                  if (found) setEntity(found);
                }}
                className="appearance-none bg-slate-900/90 border border-emerald-500/30 hover:border-emerald-500/50 focus:border-emerald-500 rounded-xl ps-8 pe-7 py-1.5 text-xs text-white font-bold focus:outline-none transition cursor-pointer shadow-inner"
              >
                {availableEntities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {locale === 'ar' ? ent.nameAr : ent.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 absolute end-2.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Global Search & System Telemetry */}
        <div className="flex items-center gap-3">
          {/* Quick Command Palette Button */}
          <button
            onClick={() => setIsCommandOpen(true)}
            className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-white/[0.08] hover:border-emerald-500/40 text-slate-400 hover:text-slate-200 text-xs transition duration-200 shadow-sm group"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition" />
              <span className="hidden sm:inline">{locale === 'ar' ? 'البحث أو الانتقال السريع...' : 'Search or jump to...'}</span>
            </div>
            <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono font-bold text-slate-400 group-hover:border-emerald-500/30">
              <span className="text-[11px]">⌘</span>K
            </kbd>
          </button>

          {/* FTA System Live Status */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900/60 border border-white/[0.06] text-[11px] font-medium text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>FTA E-Invoice Connected</span>
          </div>

          {/* Fiscal Period Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900/80 border border-white/[0.08] text-[11px] text-slate-300 font-mono font-medium">
            <Clock className="w-3 h-3 text-emerald-400" />
            <span>{fiscalPeriod}</span>
          </div>

          {/* Language Toggle */}
          <LanguageToggle locale={locale} />

          {/* User Profile Pill & Sign Out */}
          <div className="flex items-center gap-2 ps-2 border-s border-white/[0.08]">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-slate-800 to-slate-700 border border-white/[0.1] flex items-center justify-center font-bold text-xs text-emerald-300 shadow">
              AJ
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-lg border border-transparent hover:border-rose-500/30 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition duration-150"
              title={t('signOut')}
              aria-label={t('signOut')}
            >
              <LogOut className="w-4 h-4 rtl-mirror" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* YC-Level Grouped Sidebar */}
        <aside
          className="w-64 border-e border-white/[0.08] bg-slate-950/70 backdrop-blur-xl p-3.5 hidden md:flex flex-col justify-between overflow-y-auto"
          aria-label="Sidebar Navigation"
        >
          <div className="space-y-6">
            {navGroups.map((group, gIdx) => (
              <div key={gIdx} className="space-y-1">
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                  <span>{group.group}</span>
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                          isActive
                            ? 'bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-transparent text-white border border-emerald-500/25 shadow-[0_0_15px_-3px_rgba(16,185,129,0.25)]'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60 hover:translate-x-0.5'
                        }`}
                      >
                        {isActive && (
                          <span className="absolute start-0 top-1.5 bottom-1.5 w-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        )}
                        <div className="flex items-center gap-2.5">
                          <Icon className={`w-4 h-4 shrink-0 transition duration-200 ${
                            isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'
                          }`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full border ${item.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Active Legal Subsidiary Card */}
          <div className="mt-4 p-3.5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-white/[0.08] shadow-lg space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between text-slate-400 font-medium">
              <span>{t('entity')}:</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold">
                AUDITED
              </span>
            </div>
            <div className="font-bold text-white truncate text-xs">
              {locale === 'ar' ? entity.nameAr : entity.name}
            </div>
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono">
              <span>TRN:</span>
              <span className="text-emerald-400 font-bold">{entity.trn}</span>
            </div>
          </div>
        </aside>

        {/* Dynamic Outlet Main Area */}
        <main id="main-content" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* YC Command Palette Spotlight (Cmd+K / Ctrl+K) */}
      {isCommandOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-slate-950/80 backdrop-blur-md transition-opacity">
          <div className="w-full max-w-xl bg-slate-900 border border-white/[0.12] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Search Input Bar */}
            <div className="flex items-center px-4 py-3.5 border-b border-white/[0.08] gap-3 bg-slate-950/40">
              <Search className="w-5 h-5 text-emerald-400 shrink-0" />
              <input
                ref={commandInputRef}
                type="text"
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder={locale === 'ar' ? 'ابحث عن أي شاشة، حساب، أو تقرير مالي...' : 'Type a command or jump to any feature...'}
                className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none font-medium"
              />
              <button
                onClick={() => setIsCommandOpen(false)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {filteredCommands.length > 0 ? (
                filteredCommands.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      onClick={() => {
                        setIsCommandOpen(false);
                        router.push(item.href);
                      }}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 transition text-start group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 group-hover:border-emerald-500/40 transition">
                          <Icon className="w-4 h-4 text-emerald-400" />
                        </div>
                        <span>{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.badge && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full border ${item.badgeColor || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                            {item.badge}
                          </span>
                        )}
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400 transition" />
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  {locale === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching features found'}
                </div>
              )}
            </div>

            {/* Modal Footer Keyboard Legend */}
            <div className="px-4 py-2.5 bg-slate-950/80 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-4">
                <span>Navigate: <kbd className="font-mono text-slate-400">↑</kbd> <kbd className="font-mono text-slate-400">↓</kbd></span>
                <span>Select: <kbd className="font-mono text-slate-400">↵</kbd></span>
                <span>Close: <kbd className="font-mono text-slate-400">esc</kbd></span>
              </div>
              <span className="text-emerald-400 font-semibold">LedgerAE Command</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
