'use client';

import React from 'react';
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
  Sliders
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

  const navItems = [
    { href: `/${locale}/app/dashboard`, label: t('navDashboard'), icon: LayoutDashboard },
    { href: `/${locale}/app/ledger/accounts`, label: t('navLedger'), icon: BookOpen },
    { href: `/${locale}/app/invoicing/sales`, label: t('navInvoices'), icon: Receipt },
    { href: `/${locale}/app/payables/bills`, label: t('navPayables'), icon: CreditCard },
    { href: `/${locale}/app/receivables/payments`, label: t('navReceivables'), icon: Receipt },
    { href: `/${locale}/app/tax/vat201`, label: t('navTax'), icon: FileSpreadsheet },
    { href: `/${locale}/app/banking/reconciliation`, label: t('navBankRecon'), icon: Landmark },
    { href: `/${locale}/app/ai/proposals`, label: t('navAiProposals'), icon: Bot, badge: '3' },
    { href: `/${locale}/app/assets`, label: t('navAssets'), icon: Boxes },
    { href: `/${locale}/app/payroll`, label: t('navPayroll'), icon: Users },
    { href: `/${locale}/app/einvoicing`, label: t('navEinvoicing'), icon: FileCheck },
    { href: `/${locale}/app/reports`, label: t('navReports'), icon: FileSpreadsheet },
    { href: `/${locale}/app/reports/builder`, label: t('navReportBuilder'), icon: FileSpreadsheet },
    { href: `/${locale}/app/close`, label: t('navClose'), icon: CalendarCheck2 },
    { href: `/${locale}/app/audit`, label: t('navAuditRoles'), icon: ShieldCheck },
    { href: `/${locale}/app/onboarding`, label: t('navOnboarding'), icon: Layers },
    { href: `/${locale}/app/auditor`, label: t('navAuditor'), icon: ShieldAlert },
    { href: `/${locale}/app/ops`, label: t('navOps'), icon: Sliders }
  ];

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Session Expiring Banner */}
      {sessionRemainingSeconds < 300 && (
        <div
          className="bg-amber-500/20 border-b border-amber-500/40 text-amber-300 px-4 py-2 text-xs flex items-center justify-between sticky top-0 z-50 backdrop-blur"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{t('sessionExpiringSoon', { minutes: minutesRemaining })}</span>
          </div>
          <button
            onClick={refreshSession}
            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-[11px] transition"
          >
            Extend Session
          </button>
        </div>
      )}

      {/* Top Universal Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Logo & Brand */}
          <Link href={`/${locale}/app/dashboard`} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white shadow-md shadow-emerald-950">
              AE
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-white">
                  {t('brandName')}
                </span>
                <span className="text-[10px] text-emerald-300 font-semibold px-1.5 py-0.2 rounded-full bg-emerald-950 border border-emerald-800">
                  LIVE
                </span>
              </div>
            </div>
          </Link>

          <div className="h-5 w-px bg-slate-800 hidden md:block" />

          {/* Tenant & Entity Context Selectors */}
          <div className="hidden lg:flex items-center gap-3 text-xs">
            {/* Tenant Selector */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="tenant-select" className="text-slate-400">{t('tenant')}:</label>
              <select
                id="tenant-select"
                aria-label={t('tenant')}
                value={tenant.id}
                onChange={(e) => {
                  const found = availableTenants.find((t) => t.id === e.target.value);
                  if (found) setTenant(found);
                }}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {availableTenants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Entity Selector */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="entity-select" className="text-slate-400">{t('entity')}:</label>
              <select
                id="entity-select"
                aria-label={t('entity')}
                value={entity.id}
                onChange={(e) => {
                  const found = availableEntities.find((ent) => ent.id === e.target.value);
                  if (found) setEntity(found);
                }}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {availableEntities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {locale === 'ar' ? ent.nameAr : ent.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Global Search & User Actions */}
        <div className="flex items-center gap-3">
          {/* Global Search Bar */}
          <div className="relative hidden xl:block w-72">
            <Search className="w-3.5 h-3.5 absolute start-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              aria-label={t('searchPlaceholder')}
              placeholder={t('searchPlaceholder')}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg ps-8 pe-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Period Status Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{fiscalPeriod}</span>
          </div>

          {/* Language Switcher */}
          <LanguageToggle locale={locale} />

          {/* User Sign Out */}
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition"
            title={t('signOut')}
            aria-label={t('signOut')}
          >
            <LogOut className="w-4 h-4 rtl-mirror" />
          </button>
        </div>
      </header>

      {/* Main Container with Sidebar + Dynamic Route Outlet */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className="w-60 border-e border-slate-800 bg-slate-900/60 p-3 hidden md:flex flex-col justify-between"
          aria-label="Sidebar Navigation"
        >
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="bg-amber-400 text-slate-950 font-bold px-1.5 py-0.2 rounded-full text-[10px]">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Entity Footer Card in Sidebar */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-1 text-[11px]">
            <div className="text-slate-400 font-medium">{t('entity')} Active:</div>
            <div className="font-bold text-white truncate">
              {locale === 'ar' ? entity.nameAr : entity.name}
            </div>
            <div className="text-emerald-400 font-mono text-[10px]">TRN: {entity.trn}</div>
          </div>
        </aside>

        {/* Dynamic Outlet */}
        <main id="main-content" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
