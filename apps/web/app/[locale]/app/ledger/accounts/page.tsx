'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { StateContainer } from '@/components/StateContainer';
import { formatMinorUnits } from '@/lib/money';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef
} from '@tanstack/react-table';
import { Plus, Search, BookOpen, Layers, CheckCircle2 } from 'lucide-react';

interface Account {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  balanceMinorUnits: string;
  isActive: boolean;
  currency: string;
}

export default function AccountsPage({ params }: { params: Promise<{ locale: string }> }) {
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  useEffect(() => {
    params.then((p) => setLocale(p.locale as 'en' | 'ar'));
  }, [params]);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const fetchAccounts = async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch('/api/ledger/accounts');
      if (!res.ok) throw new Error('Failed to fetch chart of accounts');
      const data = await res.json();
      setAccounts(data.accounts);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const columns = useMemo<ColumnDef<Account>[]>(
    () => [
      {
        accessorKey: 'code',
        header: locale === 'ar' ? 'رمز الحساب' : 'Code',
        cell: (info) => (
          <span className="font-mono font-bold text-emerald-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-xs">
            {info.getValue() as string}
          </span>
        )
      },
      {
        id: 'name',
        header: locale === 'ar' ? 'اسم الحساب' : 'Account Name',
        cell: ({ row }) => (
          <div>
            <div className="font-semibold text-white text-xs">
              {locale === 'ar' ? row.original.nameAr : row.original.nameEn}
            </div>
            <div className="text-[10px] text-slate-500">
              {locale === 'ar' ? row.original.nameEn : row.original.nameAr}
            </div>
          </div>
        )
      },
      {
        accessorKey: 'category',
        header: locale === 'ar' ? 'التصنيف' : 'Category',
        cell: (info) => {
          const val = info.getValue() as string;
          const colors: Record<string, string> = {
            ASSET: 'text-cyan-400 bg-cyan-950/60 border-cyan-800',
            LIABILITY: 'text-amber-400 bg-amber-950/60 border-amber-800',
            EQUITY: 'text-purple-400 bg-purple-950/60 border-purple-800',
            REVENUE: 'text-emerald-400 bg-emerald-950/60 border-emerald-800',
            EXPENSE: 'text-rose-400 bg-rose-950/60 border-rose-800'
          };
          return (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[val] || 'text-slate-400'}`}>
              {val}
            </span>
          );
        }
      },
      {
        accessorKey: 'balanceMinorUnits',
        header: () => (
          <div className="text-end">{locale === 'ar' ? 'الرصيد الدفتري' : 'Ledger Balance'}</div>
        ),
        cell: (info) => (
          <div className="text-end font-mono font-bold text-white text-xs">
            {formatMinorUnits(info.getValue(), { locale })}
          </div>
        )
      },
      {
        accessorKey: 'isActive',
        header: locale === 'ar' ? 'الحالة' : 'Status',
        cell: (info) => (
          <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Active</span>
          </span>
        )
      }
    ],
    [locale]
  );

  const table = useReactTable({
    data: accounts,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            <span>{locale === 'ar' ? 'دليل وشجرة الحسابات (COA)' : 'Chart of Accounts (COA)'}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {locale === 'ar'
              ? 'مخطط الحسابات الموحد المتوافق مع معايير المحاسبة الدولية IFRS وقوانين الضرائب الإماراتية'
              : 'Unified IFRS-compliant account taxonomy with integer-fils real-time balances'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/app/ledger/journals`}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold transition flex items-center gap-1.5"
          >
            <Layers className="w-4 h-4" />
            <span>{locale === 'ar' ? 'سجل القيود' : 'Journal Vouchers'}</span>
          </Link>
          <Link
            href={`/${locale}/app/ledger/journals?new=true`}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-emerald-950"
          >
            <Plus className="w-4 h-4" />
            <span>{locale === 'ar' ? 'قيد يومية جديد' : '+ New Journal Entry'}</span>
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute start-3 top-2.5 text-slate-500" />
        <input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={locale === 'ar' ? 'بحث برمز أو اسم الحساب...' : 'Search account code or name...'}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl ps-9 pe-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* TanStack Table Container */}
      <StateContainer isLoading={isLoading} isError={isError} isEmpty={accounts.length === 0} onRetry={fetchAccounts}>
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
          <table className="w-full text-start text-xs border-collapse">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="p-3.5 font-bold text-start first:ps-5 last:pe-5">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-800/40 transition">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="p-3.5 first:ps-5 last:pe-5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StateContainer>
    </div>
  );
}
