'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { StateContainer } from '@/components/StateContainer';
import { formatMinorUnits } from '@/lib/money';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef
} from '@tanstack/react-table';
import {
  Receipt,
  FileText,
  CheckCircle2,
  XCircle,
  Eye,
  Printer,
  ShieldCheck,
  Send,
  Building,
  QrCode
} from 'lucide-react';

interface InvoiceItem {
  id: string;
  type: 'SALES_INVOICE' | 'VENDOR_BILL';
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  partyNameEn: string;
  partyNameAr: string;
  partyTrn: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'CLEARED_PEPPOL' | 'PAID' | 'REJECTED';
  subtotalMinorUnits: string;
  vatMinorUnits: string;
  totalMinorUnits: string;
  currency: string;
  peppolStatus?: string;
  threeWayMatchStatus?: string;
  approvalLevel: string;
  lines: Array<{
    lineId: string;
    descriptionEn: string;
    descriptionAr: string;
    quantity: number;
    unitPriceMinorUnits: string;
    vatRatePercent: number;
    subtotalMinorUnits: string;
    vatMinorUnits: string;
  }>;
}

function InvoicesView({ params }: { params: Promise<{ locale: string }> }) {
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  useEffect(() => {
    params.then((p) => setLocale(p.locale as 'en' | 'ar'));
  }, [params]);

  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [selectedType, setSelectedType] = useState<'ALL' | 'SALES_INVOICE' | 'VENDOR_BILL'>('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);

  const fetchInvoices = async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const url = selectedType === 'ALL' ? '/api/invoicing' : `/api/invoicing?type=${selectedType}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load documents');
      const data = await res.json();
      setInvoices(data.invoices);
      if (data.invoices.length > 0 && !selectedInvoice) {
        setSelectedInvoice(data.invoices[0]);
      }
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [selectedType]);

  const handleApproval = async (invoiceId: string, decision: 'APPROVE' | 'REJECT') => {
    setIsProcessingApproval(true);
    try {
      const res = await fetch('/api/invoicing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVAL', invoiceId, decision })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to update approval');
        return;
      }
      setSelectedInvoice((prev) => (prev ? { ...prev, ...data.invoice } : data.invoice));
      fetchInvoices();
    } catch (err: any) {
      alert('Error updating approval: ' + err.message);
    } finally {
      setIsProcessingApproval(false);
    }
  };

  const columns = useMemo<ColumnDef<InvoiceItem>[]>(
    () => [
      {
        accessorKey: 'documentNumber',
        header: locale === 'ar' ? 'رقم المستند' : 'Document No',
        cell: (info) => (
          <span className="font-mono font-bold text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-xs">
            {info.getValue() as string}
          </span>
        )
      },
      {
        accessorKey: 'type',
        header: locale === 'ar' ? 'النوع' : 'Type',
        cell: (info) => {
          const isSale = info.getValue() === 'SALES_INVOICE';
          return (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isSale ? 'bg-cyan-950 text-cyan-300 border-cyan-800' : 'bg-purple-950 text-purple-300 border-purple-800'
              }`}
            >
              {isSale ? 'Sales Invoice' : 'Vendor Bill'}
            </span>
          );
        }
      },
      {
        id: 'party',
        header: locale === 'ar' ? 'الطرف الآخر' : 'Party / Counterparty',
        cell: ({ row }) => (
          <div>
            <div className="font-semibold text-white text-xs">
              {locale === 'ar' ? row.original.partyNameAr : row.original.partyNameEn}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">TRN: {row.original.partyTrn}</div>
          </div>
        )
      },
      {
        accessorKey: 'totalMinorUnits',
        header: () => <div className="text-end">{locale === 'ar' ? 'الإجمالي الشامل' : 'Total (Inc. VAT)'}</div>,
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
            CLEARED_PEPPOL: 'bg-emerald-950 text-emerald-300 border-emerald-800',
            APPROVED: 'bg-emerald-950 text-emerald-300 border-emerald-800',
            PENDING_APPROVAL: 'bg-amber-950 text-amber-300 border-amber-800',
            REJECTED: 'bg-rose-950 text-rose-300 border-rose-800'
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
        header: () => <div className="text-end">{locale === 'ar' ? 'عرض' : 'View'}</div>,
        cell: ({ row }) => (
          <div className="text-end">
            <button
              onClick={() => setSelectedInvoice(row.original)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition ms-auto"
              title="Preview Invoice"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      }
    ],
    [locale]
  );

  const table = useReactTable({
    data: invoices,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-400" />
            <span>
              {locale === 'ar'
                ? 'الفواتير والمشتريات (Peppol PINT-AE & AP Bills)'
                : 'Invoices & Vendor Bills (Peppol PINT-AE & AP)'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {locale === 'ar'
              ? 'إدارة فواتير المبيعات الإلكترونية ومطابقة مشتريات الموردين الثلاثية مع معاينة ثنائية اللغة'
              : 'E-invoicing compliance with 3-way matching, approval workflows, and bilingual PDF preview'}
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setSelectedType('ALL')}
            className={`px-3 py-1.5 rounded-lg transition ${
              selectedType === 'ALL' ? 'bg-emerald-600 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            All Docs
          </button>
          <button
            onClick={() => setSelectedType('SALES_INVOICE')}
            className={`px-3 py-1.5 rounded-lg transition ${
              selectedType === 'SALES_INVOICE'
                ? 'bg-emerald-600 text-slate-950 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sales Invoices
          </button>
          <button
            onClick={() => setSelectedType('VENDOR_BILL')}
            className={`px-3 py-1.5 rounded-lg transition ${
              selectedType === 'VENDOR_BILL'
                ? 'bg-emerald-600 text-slate-950 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Vendor Bills
          </button>
        </div>
      </div>

      {/* Main Split View: Table & Interactive Bilingual Document Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: TanStack Table */}
        <div className="xl:col-span-7">
          <StateContainer isLoading={isLoading} isError={isError} isEmpty={invoices.length === 0} onRetry={fetchInvoices}>
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
                    <tr
                      key={row.id}
                      onClick={() => setSelectedInvoice(row.original)}
                      className={`hover:bg-slate-800/40 cursor-pointer transition ${
                        selectedInvoice?.id === row.original.id ? 'bg-slate-800/60' : ''
                      }`}
                    >
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

        {/* Right: Bilingual PDF / Document Preview & Approval Panel */}
        <div className="xl:col-span-5">
          {selectedInvoice ? (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 shadow-2xl">
              {/* Preview Header & Actions */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <span className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase">
                    Official UAE Tax Document (en / ar)
                  </span>
                  <h2 className="text-base font-black text-white">{selectedInvoice.documentNumber}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                    title="Print Document"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Document Identity Banner */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex justify-between items-start text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">SUPPLIER / ISSUER</span>
                    <strong className="text-white">Al-Noor Trading LLC</strong>
                    <span className="text-slate-400 block text-[11px] font-mono">TRN: 100456789012345</span>
                  </div>
                  <div className="text-end">
                    <span className="text-slate-500 block text-[10px]">CUSTOMER / BUYER</span>
                    <strong className="text-white">{selectedInvoice.partyNameEn}</strong>
                    <div className="text-slate-400 text-[11px] font-arabic">{selectedInvoice.partyNameAr}</div>
                    <span className="text-slate-400 block text-[11px] font-mono">TRN: {selectedInvoice.partyTrn}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                  <div>
                    <span className="text-slate-500">Issue Date:</span>{' '}
                    <span className="text-slate-200 font-semibold">{selectedInvoice.issueDate}</span>
                  </div>
                  <div className="text-end">
                    <span className="text-slate-500">Due Date:</span>{' '}
                    <span className="text-slate-200 font-semibold">{selectedInvoice.dueDate}</span>
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 text-xs">
                <table className="w-full text-start">
                  <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px]">
                    <tr>
                      <th className="p-2.5 ps-3 text-start">Item Description</th>
                      <th className="p-2.5 text-center">VAT</th>
                      <th className="p-2.5 pe-3 text-end">Amount (Fils)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(selectedInvoice.lines || []).map((l) => (
                      <tr key={l.lineId}>
                        <td className="p-2.5 ps-3">
                          <div className="font-semibold text-white">{l.descriptionEn}</div>
                          <div className="text-[10px] text-slate-400 font-arabic">{l.descriptionAr}</div>
                        </td>
                        <td className="p-2.5 text-center font-bold text-amber-400">{l.vatRatePercent}%</td>
                        <td className="p-2.5 pe-3 text-end font-mono text-emerald-400 font-bold">
                          {formatMinorUnits(l.subtotalMinorUnits ?? '0', { locale })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Net Subtotal:</span>
                  <span className="font-mono text-white">
                    {formatMinorUnits(selectedInvoice.subtotalMinorUnits ?? '0', { locale })}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>VAT (5%):</span>
                  <span className="font-mono text-amber-400">
                    {formatMinorUnits(selectedInvoice.vatMinorUnits ?? '0', { locale })}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-black text-white pt-1.5 border-t border-slate-800">
                  <span>Total Due (AED):</span>
                  <span className="font-mono text-emerald-400">
                    {formatMinorUnits(selectedInvoice.totalMinorUnits ?? '0', { locale })}
                  </span>
                </div>
              </div>

              {/* Approval Workflow & Compliance Actions */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Approval Stage:</span>
                  <span className="font-bold text-emerald-400 font-mono text-[11px]">
                    {selectedInvoice.approvalLevel}
                  </span>
                </div>

                {selectedInvoice.status === 'PENDING_APPROVAL' && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleApproval(selectedInvoice.id, 'APPROVE')}
                      disabled={isProcessingApproval}
                      className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 text-xs font-black transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve & Clear</span>
                    </button>
                    <button
                      onClick={() => handleApproval(selectedInvoice.id, 'REJECT')}
                      disabled={isProcessingApproval}
                      className="flex-1 py-2 px-3 rounded-lg bg-rose-950 hover:bg-rose-900 disabled:opacity-50 text-rose-300 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-rose-800"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}

                {selectedInvoice.status === 'CLEARED_PEPPOL' && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-[11px] text-emerald-300 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Peppol PINT-AE UBL 2.1 Transmitted & Acknowledged by UAE Tax Authority Sandbox.</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 rounded-2xl border border-slate-800 bg-slate-900/40">
              Select an invoice or bill to inspect live details and bilingual preview.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InvoicesPage({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Loading invoice management...</div>}>
      <InvoicesView params={params} />
    </Suspense>
  );
}
