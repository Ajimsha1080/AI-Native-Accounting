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
        { href: `/${locale}/app/tax/vat201`, label: t('navTax'), icon: FileSpreadsheet, badge: 'FTA 201', badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
        { href: `/${locale}/app/banking/reconciliation`, label: t('navBanking'), icon: Landmark },
        { href: `/${locale}/app/einvoicing`, label: locale === 'ar' ? 'الفوترة الإلكترونية Peppol' : 'Peppol E-Invoicing', icon: FileCheck, badge: 'PINT-AE', badgeColor: 'bg-sky-50 text-sky-800 border-sky-200' },
        { href: `/${locale}/app/payroll`, label: locale === 'ar' ? 'نظام حماية الأجور WPS' : 'WPS Payroll SIF', icon: Users, badge: 'CBUAE', badgeColor: 'bg-amber-50 text-amber-800 border-amber-200' },
        { href: `/${locale}/app/assets`, label: locale === 'ar' ? 'الأصول الثابتة والإيجارات' : 'Fixed Assets & Leases', icon: Boxes, badge: 'IFRS 16', badgeColor: 'bg-stone-100 text-stone-700 border-stone-200' },
      ]
    },
    {
      group: locale === 'ar' ? 'الذكاء الاصطناعي والإقفال' : 'AI Agents & Period Close',
      items: [
        { href: `/${locale}/app/ai/proposals`, label: t('navAi'), icon: Bot, badge: 'Autonomous', badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
        { href: `/${locale}/app/ai/guardrails-memory`, label: locale === 'ar' ? 'حواجز الأمان والذاكرة' : 'Guardrails & Memory', icon: Sparkles, badge: 'LiteLLM', badgeColor: 'bg-amber-50 text-amber-800 border-amber-200' },
        { href: `/${locale}/app/close`, label: t('navClose'), icon: CalendarCheck2 },
        { href: `/${locale}/app/reports`, label: t('navReports'), icon: FileSpreadsheet },
        { href: `/${locale}/app/reports/builder`, label: locale === 'ar' ? 'مخصص التقارير' : 'Report Builder', icon: Sliders },
      ]
    },
    {
      group: locale === 'ar' ? 'البيانات والرقابة والتدقيق' : 'Audit & Administration',
      items: [
        { href: `/${locale}/app/onboarding`, label: locale === 'ar' ? 'ترحيل واستيراد البيانات' : 'Data Onboarding', icon: ArrowUpRight },
        { href: `/${locale}/app/auditor`, label: locale === 'ar' ? 'منصة المدقق الخارجي' : 'Auditor Workspace', icon: ShieldCheck, badge: 'FAF v1', badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
        { href: `/${locale}/app/ops`, label: locale === 'ar' ? 'لوحة التحكم التشغيلية' : 'Platform Operations', icon: Sliders },
        { href: `/${locale}/app/audit`, label: t('navAudit'), icon: ShieldAlert },
      ]
    }
  ];

  // Flattened items for Quick Command Palette search
  const allNavItems = navGroups.flatMap(g => g.items);

  // Keyboard shortcut listener for Command+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
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
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 flex flex-col antialiased selection:bg-emerald-100 selection:text-emerald-900">
      {/* Session Expiring Banner */}
      {sessionRemainingSeconds < 300 && (
        <div
          className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs flex items-center justify-between sticky top-0 z-50 backdrop-blur-md shadow-xs"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
            <span className="font-medium">{t('sessionExpiringSoon', { minutes: minutesRemaining })}</span>
          </div>
          <button
            onClick={refreshSession}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-[11px] transition shadow-xs cursor-pointer"
          >
            Extend Session
          </button>
        </div>
      )}

      {/* Top Universal Header */}
      <header className="border-b border-[#E8E4DC] bg-[#FAF8F5]/90 backdrop-blur-xl px-4 sm:px-6 py-2.5 flex items-center justify-between sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Logo & Brand Emblem */}
          <Link href={`/${locale}/app/dashboard`} className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 flex items-center justify-center font-black text-white text-sm shadow-xs group-hover:shadow-sm transition duration-300">
              AE
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black tracking-tight text-stone-900 group-hover:text-emerald-700 transition">
                  {t('brandName')}
                </span>
                <span className="text-[10px] text-emerald-800 font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/90 tracking-wider">
                  v2.4
                </span>
              </div>
            </div>
          </Link>

          <div className="h-4 w-px bg-[#E8E4DC] hidden md:block" />

          {/* Tenant & Entity Selectors */}
          <div className="hidden lg:flex items-center gap-2.5">
            {/* Tenant Selector */}
            <div className="relative flex items-center">
              <Building className="w-3.5 h-3.5 absolute start-2.5 text-stone-400 pointer-events-none" />
              <select
                id="tenant-select"
                aria-label={t('tenant')}
                value={tenant.id}
                onChange={(e) => {
                  const found = availableTenants.find((t) => t.id === e.target.value);
                  if (found) setTenant(found);
                }}
                className="appearance-none bg-white border border-[#E8E4DC] hover:border-stone-300 focus:border-stone-900 rounded-xl ps-8 pe-7 py-1.5 text-xs text-stone-800 font-semibold focus:outline-none transition cursor-pointer shadow-xs"
              >
                {availableTenants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 absolute end-2.5 text-stone-400 pointer-events-none" />
            </div>

            {/* Entity Selector */}
            <div className="relative flex items-center">
              <Building2 className="w-3.5 h-3.5 absolute start-2.5 text-emerald-700 pointer-events-none" />
              <select
                id="entity-select"
                aria-label={t('entity')}
                value={entity.id}
                onChange={(e) => {
                  const found = availableEntities.find((ent) => ent.id === e.target.value);
                  if (found) setEntity(found);
                }}
                className="appearance-none bg-white border border-emerald-300 hover:border-emerald-400 focus:border-emerald-700 rounded-xl ps-8 pe-7 py-1.5 text-xs text-stone-900 font-bold focus:outline-none transition cursor-pointer shadow-xs"
              >
                {availableEntities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {locale === 'ar' ? ent.nameAr : ent.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 absolute end-2.5 text-stone-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Global Search & System Telemetry */}
        <div className="flex items-center gap-3">
          {/* Quick Command Palette Button */}
          <button
            onClick={() => setIsCommandOpen(true)}
            className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-white border border-[#E8E4DC] hover:border-stone-400 text-stone-500 hover:text-stone-800 text-xs transition duration-200 shadow-xs group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-stone-400 group-hover:text-emerald-700 transition" />
              <span className="hidden sm:inline">{locale === 'ar' ? 'البحث أو الانتقال السريع...' : 'Search or jump to...'}</span>
            </div>
            <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#F6F3EB] border border-[#E8E4DC] text-[10px] font-mono font-bold text-stone-500">
              <span className="text-[11px]">⌘</span>K
            </kbd>
          </button>

          {/* FTA System Live Status */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200/90 text-[11px] font-medium text-emerald-900">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
            </span>
            <span>FTA E-Invoice Connected</span>
          </div>

          {/* Fiscal Period Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-[#E8E4DC] text-[11px] text-stone-700 font-mono font-medium shadow-xs">
            <Clock className="w-3 h-3 text-emerald-700" />
            <span>{fiscalPeriod}</span>
          </div>

          {/* Language Toggle */}
          <LanguageToggle locale={locale} />

          {/* User Profile Pill & Sign Out */}
          <div className="flex items-center gap-2 ps-2 border-s border-[#E8E4DC]">
            <div className="w-7 h-7 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-xs text-stone-800 shadow-xs">
              AJ
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-lg border border-transparent hover:border-rose-300 hover:bg-rose-50 text-stone-400 hover:text-rose-600 transition duration-150 cursor-pointer"
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
        {/* YC-Level Grouped Sidebar in Warm Cream Porcelain */}
        <aside
          className="w-64 border-e border-[#E8E4DC] bg-[#F7F5EE]/80 backdrop-blur-xl p-3.5 hidden md:flex flex-col justify-between overflow-y-auto"
          aria-label="Sidebar Navigation"
        >
          <div className="space-y-6">
            {navGroups.map((group, gIdx) => (
              <div key={gIdx} className="space-y-1">
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center justify-between">
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
                        className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                          isActive
                            ? 'bg-white text-stone-900 border border-[#E8E4DC] shadow-xs'
                            : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/40 hover:translate-x-0.5'
                        }`}
                      >
                        {isActive && (
                          <span className="absolute start-0 top-1.5 bottom-1.5 w-1 rounded-full bg-emerald-600" />
                        )}
                        <div className="flex items-center gap-2.5">
                          <Icon className={`w-4 h-4 shrink-0 transition duration-150 ${
                            isActive ? 'text-emerald-700' : 'text-stone-400 group-hover:text-stone-700'
                          }`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full border ${item.badgeColor || 'bg-stone-100 text-stone-700 border-stone-200'}`}>
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
          <div className="mt-4 p-3.5 rounded-2xl bg-white border border-[#E8E4DC] shadow-xs space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between text-stone-500 font-medium">
              <span>{t('entity')}:</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-bold">
                AUDITED
              </span>
            </div>
            <div className="font-bold text-stone-900 truncate text-xs">
              {locale === 'ar' ? entity.nameAr : entity.name}
            </div>
            <div className="flex items-center justify-between text-stone-500 text-[10px] font-mono">
              <span>TRN:</span>
              <span className="text-emerald-700 font-bold">{entity.trn}</span>
            </div>
          </div>
        </aside>

        {/* Dynamic Outlet Main Area */}
        <main id="main-content" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#FAF8F5]">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* YC Command Palette Spotlight (Cmd+K / Ctrl+K) */}
      {isCommandOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-stone-900/30 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-xl bg-white border border-[#E8E4DC] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Search Input Bar */}
            <div className="flex items-center px-4 py-3.5 border-b border-[#E8E4DC] gap-3 bg-[#FAF8F5]">
              <Search className="w-5 h-5 text-emerald-700 shrink-0" />
              <input
                ref={commandInputRef}
                type="text"
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder={locale === 'ar' ? 'ابحث عن أي شاشة، حساب، أو تقرير مالي...' : 'Type a command or jump to any feature...'}
                className="w-full bg-transparent text-sm text-stone-900 placeholder-stone-400 focus:outline-none font-medium"
              />
              <button
                onClick={() => setIsCommandOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition cursor-pointer"
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
                      className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-stone-700 hover:text-stone-900 hover:bg-[#F6F3EB] transition text-start group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-stone-100 border border-stone-200 group-hover:border-emerald-300 transition">
                          <Icon className="w-4 h-4 text-emerald-700" />
                        </div>
                        <span>{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.badge && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full border ${item.badgeColor || 'bg-stone-100 text-stone-700 border-stone-200'}`}>
                            {item.badge}
                          </span>
                        )}
                        <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-emerald-700 transition" />
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-8 text-center text-xs text-stone-400">
                  {locale === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching features found'}
                </div>
              )}
            </div>

            {/* Modal Footer Keyboard Legend */}
            <div className="px-4 py-2.5 bg-[#FAF8F5] border-t border-[#E8E4DC] flex items-center justify-between text-[11px] text-stone-500">
              <div className="flex items-center gap-4">
                <span>Navigate: <kbd className="font-mono text-stone-600 bg-white border border-stone-200 px-1 rounded">↑</kbd> <kbd className="font-mono text-stone-600 bg-white border border-stone-200 px-1 rounded">↓</kbd></span>
                <span>Select: <kbd className="font-mono text-stone-600 bg-white border border-stone-200 px-1 rounded">↵</kbd></span>
                <span>Close: <kbd className="font-mono text-stone-600 bg-white border border-stone-200 px-1 rounded">esc</kbd></span>
              </div>
              <span className="text-emerald-700 font-semibold">LedgerAE Command</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
