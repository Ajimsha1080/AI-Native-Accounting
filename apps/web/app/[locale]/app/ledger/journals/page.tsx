'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { StateContainer } from '@/components/StateContainer';
import { formatMinorUnits, toSafeBigInt } from '@/lib/money';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef
} from '@tanstack/react-table';
import {
  Layers,
  Plus,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  FileEdit,
  Save,
  Send,
  Trash2,
  ShieldCheck
} from 'lucide-react';

interface JournalLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string;
  debitMinorUnits: string;
  creditMinorUnits: string;
}

interface JournalEntry {
  id: string;
  voucherNumber: string;
  date: string;
  period: string;
  status: 'DRAFT' | 'VALIDATED' | 'POSTED' | 'REVERSED';
  description: string;
  lines: JournalLine[];
  totalDebitMinorUnits: string;
  totalCreditMinorUnits: string;
  reversalOfId?: string;
}

const AVAILABLE_ACCOUNTS = [
  { id: 'acc-1020', code: '1020', name: 'Emirates NBD - Operating (AED)' },
  { id: 'acc-1030', code: '1030', name: 'ADCB - Treasury & Tax (AED)' },
  { id: 'acc-1200', code: '1200', name: 'Trade Accounts Receivable (AR)' },
  { id: 'acc-1300', code: '1300', name: 'Input VAT Recoverable (Box 9)' },
  { id: 'acc-2010', code: '2010', name: 'Trade Accounts Payable (AP)' },
  { id: 'acc-2110', code: '2110', name: 'Output VAT Payable (Box 1)' },
  { id: 'acc-4010', code: '4010', name: 'Commercial Sales Revenue (Standard 5%)' },
  { id: 'acc-5010', code: '5010', name: 'Cost of Goods Sold (COGS)' },
  { id: 'acc-5100', code: '5100', name: 'Staff Salaries & WPS Allowances' }
];

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function JournalsView({ params }: { params: Promise<{ locale: string }> }) {
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  useEffect(() => {
    params.then((p) => setLocale(p.locale as 'en' | 'ar'));
  }, [params]);

  const searchParams = useSearchParams();
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Voucher Form State
  const [isCreating, setIsCreating] = useState(searchParams.get('new') === 'true');
  const [voucherDesc, setVoucherDesc] = useState('Office Supplies & Consumables Purchase');
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
  const [formLines, setFormLines] = useState<JournalLine[]>([
    {
      accountId: 'acc-5010',
      accountCode: '5010',
      accountName: 'Cost of Goods Sold (COGS)',
      description: 'Purchased equipment',
      debitMinorUnits: '500000', // AED 5,000.00
      creditMinorUnits: '0'
    },
    {
      accountId: 'acc-1300',
      accountCode: '1300',
      accountName: 'Input VAT Recoverable (Box 9)',
      description: '5% Standard VAT',
      debitMinorUnits: '25000', // AED 250.00
      creditMinorUnits: '0'
    },
    {
      accountId: 'acc-1020',
      accountCode: '1020',
      accountName: 'Emirates NBD - Operating (AED)',
      description: 'Paid via Corporate Wire',
      debitMinorUnits: '0',
      creditMinorUnits: '525000' // AED 5,250.00
    }
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const fetchJournals = async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch('/api/ledger/journals');
      if (!res.ok) throw new Error('Failed to load journals');
      const data = await res.json();
      setJournals(data.journals);
    } catch (err: any) {
      setIsError(true);
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJournals();
  }, []);

  // Compute live debits, credits and variance
  const totalDebitFils = formLines.reduce((acc, l) => acc + toSafeBigInt(l.debitMinorUnits), 0n);
  const totalCreditFils = formLines.reduce((acc, l) => acc + toSafeBigInt(l.creditMinorUnits), 0n);
  const varianceFils = totalDebitFils - totalCreditFils;
  const isBalanced = totalDebitFils > 0n && totalDebitFils === totalCreditFils;

  const handleLineChange = (index: number, field: keyof JournalLine, val: string) => {
    const updated = [...formLines];
    if (field === 'accountId') {
      const found = AVAILABLE_ACCOUNTS.find((a) => a.id === val);
      if (found) {
        updated[index].accountId = found.id;
        updated[index].accountCode = found.code;
        updated[index].accountName = found.name;
      }
    } else {
      (updated[index] as any)[field] = val;
    }
    setFormLines(updated);
  };

  const addLine = () => {
    setFormLines([
      ...formLines,
      {
        accountId: 'acc-1020',
        accountCode: '1020',
        accountName: 'Emirates NBD - Operating (AED)',
        description: '',
        debitMinorUnits: '0',
        creditMinorUnits: '0'
      }
    ]);
  };

  const removeLine = (index: number) => {
    if (formLines.length <= 2) return;
    setFormLines(formLines.filter((_, i) => i !== index));
  };

  const submitJournal = async (action: 'DRAFT' | 'VALIDATE' | 'POST') => {
    setFormError(null);
    setFormSuccess(null);
    try {
      const res = await fetch('/api/ledger/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          journal: {
            date: voucherDate,
            description: voucherDesc,
            lines: formLines
          }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Validation error');
        return;
      }
      setFormSuccess(
        action === 'POST'
          ? `Journal ${data.journal.voucherNumber || data.journal.entryNumber || 'entry'} successfully posted to General Ledger!`
          : action === 'VALIDATE'
          ? `Double-entry invariant verified: 0 fils variance.`
          : `Saved as draft voucher.`
      );
      if (action === 'POST') {
        setIsCreating(false);
        fetchJournals();
      }
    } catch (err: any) {
      setFormError('Network communication error: ' + err.message);
    }
  };

  const reverseJournal = async (journalId: string) => {
    if (!confirm('Are you sure you want to reverse this journal entry?')) return;
    try {
      const res = await fetch('/api/ledger/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REVERSE', journalId })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error);
        return;
      }
      alert(`Journal successfully reversed with reversing entry: ${data.journal.voucherNumber}`);
      fetchJournals();
    } catch (err: any) {
      alert('Error reversing journal: ' + err.message);
    }
  };

  const columns = useMemo<ColumnDef<JournalEntry>[]>(
    () => [
      {
        accessorKey: 'voucherNumber',
        header: locale === 'ar' ? 'رقم السند' : 'Voucher No',
        cell: (info) => (
          <span className="font-mono font-bold text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-xs">
            {info.getValue() as string}
          </span>
        )
      },
      {
        accessorKey: 'date',
        header: locale === 'ar' ? 'التاريخ' : 'Date',
        cell: (info) => <span className="text-slate-300 text-xs">{info.getValue() as string}</span>
      },
      {
        accessorKey: 'description',
        header: locale === 'ar' ? 'البيان والتفاصيل' : 'Description',
        cell: (info) => <span className="font-medium text-slate-200 text-xs">{info.getValue() as string}</span>
      },
      {
        accessorKey: 'totalDebitMinorUnits',
        header: () => <div className="text-end">{locale === 'ar' ? 'إجمالي المدين' : 'Total Debit'}</div>,
        cell: (info) => (
          <div className="text-end font-mono font-bold text-emerald-400 text-xs">
            {formatMinorUnits(info.getValue(), { locale })}
          </div>
        )
      },
      {
        accessorKey: 'status',
        header: locale === 'ar' ? 'الحالة' : 'Status',
        cell: (info) => {
          const s = info.getValue() as string;
          const map: Record<string, string> = {
            POSTED: 'bg-emerald-950 border-emerald-800 text-emerald-300',
            REVERSED: 'bg-rose-950 border-rose-800 text-rose-300',
            DRAFT: 'bg-slate-950 border-slate-700 text-slate-400',
            VALIDATED: 'bg-cyan-950 border-cyan-800 text-cyan-300'
          };
          return (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[s] || ''}`}>
              {s}
            </span>
          );
        }
      },
      {
        id: 'actions',
        header: () => <div className="text-end">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</div>,
        cell: ({ row }) => (
          <div className="text-end">
            {row.original.status === 'POSTED' && (
              <button
                onClick={() => reverseJournal(row.original.id)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 text-[11px] font-bold transition flex items-center gap-1 ms-auto"
                title="Create reversing entry"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{locale === 'ar' ? 'عكس القيد' : 'Reverse'}</span>
              </button>
            )}
          </div>
        )
      }
    ],
    [locale]
  );

  const table = useReactTable({
    data: journals,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <span>{locale === 'ar' ? 'قيود اليومية العامة (Journal Vouchers)' : 'General Journal Vouchers'}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {locale === 'ar'
              ? 'إنشاء، تدقيق، ترحيل وعكس قيود اليومية بدقة الأعداد الصحيحة (Integer Fils)'
              : 'Keyboard-first voucher posting with 0 fils invariant enforcement'}
          </p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-emerald-950 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{isCreating ? (locale === 'ar' ? 'إغلاق النموذج' : 'Close Form') : (locale === 'ar' ? '+ سند قيد جديد' : '+ New Journal Entry')}</span>
        </button>
      </div>

      {/* Global Success Notification */}
      {formSuccess && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{formSuccess}</span>
        </div>
      )}

      {/* Voucher Entry Form (Draft, Validate, Post) */}
      {isCreating && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FileEdit className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-black text-white">
                {locale === 'ar' ? 'نموذج إدخال سند القيد المزدوج' : 'Double-Entry Journal Voucher Editor'}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${isBalanced ? 'bg-emerald-950 border-emerald-800 text-emerald-400' : 'bg-rose-950 border-rose-800 text-rose-400'}`}>
                {isBalanced ? 'Balanced (0 fils variance)' : `Out-of-Balance: ${varianceFils.toString()} fils`}
              </span>
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}



          {/* Form Header Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {locale === 'ar' ? 'البيان العام للقيد' : 'Voucher Description'}
              </label>
              <input
                value={voucherDesc}
                onChange={(e) => setVoucherDesc(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {locale === 'ar' ? 'تاريخ الاستحقاق الدفتري' : 'Posting Date'}
              </label>
              <input
                type="date"
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Double Entry Lines Grid */}
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="p-3 text-start ps-4">Account (COA)</th>
                  <th className="p-3 text-start">Line Description</th>
                  <th className="p-3 text-end w-36">Debit (Fils)</th>
                  <th className="p-3 text-end w-36">Credit (Fils)</th>
                  <th className="p-3 text-center w-12">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {formLines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="p-2 ps-4">
                      <select
                        value={line.accountId}
                        onChange={(e) => handleLineChange(idx, 'accountId', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                      >
                        {AVAILABLE_ACCOUNTS.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        value={line.description}
                        onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                        placeholder="Line memo..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="p-2 text-end">
                      <input
                        type="number"
                        value={line.debitMinorUnits}
                        onChange={(e) => handleLineChange(idx, 'debitMinorUnits', e.target.value)}
                        className="w-full text-end font-mono bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-emerald-400 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="p-2 text-end">
                      <input
                        type="number"
                        value={line.creditMinorUnits}
                        onChange={(e) => handleLineChange(idx, 'creditMinorUnits', e.target.value)}
                        className="w-full text-end font-mono bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-amber-400 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => removeLine(idx)}
                        disabled={formLines.length <= 2}
                        className="text-slate-500 hover:text-rose-400 disabled:opacity-30 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900/90 font-bold border-t border-slate-800 text-xs">
                <tr>
                  <td colSpan={2} className="p-3 ps-4 text-slate-300">
                    Total Integer Minor Units (1 AED = 100 Fils):
                  </td>
                  <td className="p-3 text-end font-mono text-emerald-400">
                    {formatMinorUnits(totalDebitFils, { locale })}
                  </td>
                  <td className="p-3 text-end font-mono text-amber-400">
                    {formatMinorUnits(totalCreditFils, { locale })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              onClick={addLine}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition"
            >
              + Add Line
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => submitJournal('DRAFT')}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Draft</span>
              </button>
              <button
                onClick={() => submitJournal('VALIDATE')}
                className="px-3 py-1.5 rounded-lg border border-cyan-800 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 text-xs font-bold transition flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>Validate Invariant</span>
              </button>
              <button
                onClick={() => submitJournal('POST')}
                disabled={!isBalanced}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-slate-950 text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-emerald-950"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Post to Ledger</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TanStack Table for Existing Journal Vouchers */}
      <StateContainer isLoading={isLoading} isError={isError} errorMessage={errorMessage} isEmpty={journals.length === 0} onRetry={fetchJournals}>
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

export default function JournalsPage({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Loading journal vouchers...</div>}>
      <JournalsView params={params} />
    </Suspense>
  );
}
