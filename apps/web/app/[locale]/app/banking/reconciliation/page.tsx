'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { StateContainer } from '@/components/StateContainer';
import { formatMinorUnits, toSafeBigInt } from '@/lib/money';
import {
  Landmark,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Bot,
  ShieldCheck,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  RefreshCw
} from 'lucide-react';

interface BankStatementLine {
  id: string;
  date: string;
  reference: string;
  description: string;
  amountMinorUnits: string;
  currency: string;
  matchedStatus: 'MATCHED' | 'UNMATCHED' | 'PARTIAL';
  matchedLedgerEntryId?: string;
}

interface LedgerTransactionLine {
  id: string;
  voucherNumber: string;
  date: string;
  description: string;
  amountMinorUnits: string;
  accountCode: string;
  isReconciled: boolean;
}

interface AiMatchSuggestion {
  id: string;
  statementLineId: string;
  ledgerLineId: string;
  confidence: number;
  explanationEn: string;
  explanationAr: string;
  matchType: string;
  varianceFils: string;
}

interface ReconPayload {
  accountName: string;
  iban: string;
  currency: string;
  bankBalanceMinorUnits: string;
  ledgerBalanceMinorUnits: string;
  differenceMinorUnits: string;
  statements: BankStatementLine[];
  ledgerTransactions: LedgerTransactionLine[];
  suggestions: AiMatchSuggestion[];
}

function ReconciliationView({ params }: { params: Promise<{ locale: string }> }) {
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  useEffect(() => {
    params.then((p) => setLocale(p.locale as 'en' | 'ar'));
  }, [params]);

  const [data, setData] = useState<ReconPayload | null>(null);
  const [selectedStmtId, setSelectedStmtId] = useState<string | null>(null);
  const [selectedLedgId, setSelectedLedgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isMatching, setIsMatching] = useState(false);

  const fetchRecon = async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch('/api/banking/reconciliation');
      if (!res.ok) throw new Error('Failed to load reconciliation');
      const json = await res.json();
      setData(json);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecon();
  }, []);

  const handleManualMatch = async (stmtId: string, ledgId: string) => {
    setIsMatching(true);
    try {
      const res = await fetch('/api/banking/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'MATCH', statementLineId: stmtId, ledgerLineId: ledgId })
      });
      if (!res.ok) throw new Error('Match failed');
      setSelectedStmtId(null);
      setSelectedLedgId(null);
      fetchRecon();
    } catch (err: any) {
      alert('Error matching records: ' + err.message);
    } finally {
      setIsMatching(false);
    }
  };

  const handleCreateFeeEntry = async (stmtId: string) => {
    setIsMatching(true);
    try {
      const res = await fetch('/api/banking/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'FEE_ENTRY', statementLineId: stmtId })
      });
      if (!res.ok) throw new Error('Fee posting failed');
      fetchRecon();
    } catch (err: any) {
      alert('Error auto-posting fee: ' + err.message);
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-7 rounded-3xl bg-white border border-[#E8E4DC] shadow-[0_4px_24px_-4px_rgba(28,25,23,0.06)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 flex items-center gap-2">
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700">
              <Landmark className="w-5 h-5" />
            </div>
            <span>
              {locale === 'ar'
                ? 'التسوية المصرفية الذكية (Bank Reconciliation)'
                : 'AI-Powered Bank Reconciliation'}
            </span>
          </h1>
          <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
            {locale === 'ar'
              ? 'مطابقة كشوف الحسابات المصرفية (MT940/CAMT.053) مع قيود دفتر الأستاذ العام وتفسير الفروقات بالذكاء الاصطناعي'
              : 'Continuous matching of bank feeds against general ledger with explainable confidence'}
          </p>
        </div>

        <button
          onClick={fetchRecon}
          className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition duration-200 shadow-sm flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Feed</span>
        </button>
      </div>

      <StateContainer isLoading={isLoading} isError={isError} isEmpty={!data} onRetry={fetchRecon}>
        {data && (
          <div className="space-y-6">
            {/* Account Status Header Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-white border border-[#E8E4DC] shadow-sm">
                <span className="text-[11px] text-stone-500 font-bold uppercase tracking-wider block">BANK STATEMENT BALANCE</span>
                <div className="text-2xl font-black text-stone-900 mt-1">
                  {formatMinorUnits(data.bankBalanceMinorUnits, { locale })}
                </div>
                <span className="text-[10px] text-stone-400 font-mono mt-1 block">IBAN: {data.iban}</span>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-[#E8E4DC] shadow-sm">
                <span className="text-[11px] text-stone-500 font-bold uppercase tracking-wider block">GENERAL LEDGER BALANCE</span>
                <div className="text-2xl font-black text-stone-900 mt-1">
                  {formatMinorUnits(data.ledgerBalanceMinorUnits, { locale })}
                </div>
                <span className="text-[10px] text-stone-600 font-medium mt-1 block">{data.accountName}</span>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-[#E8E4DC] shadow-sm">
                <span className="text-[11px] text-stone-500 font-bold uppercase tracking-wider block">RECONCILIATION VARIANCE</span>
                <div className={`text-2xl font-black mt-1 ${data.differenceMinorUnits === '0' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {formatMinorUnits(data.differenceMinorUnits, { locale })}
                </div>
                <span className="text-[10px] text-stone-500 mt-1 block">
                  {data.differenceMinorUnits === '0' ? 'Zero Variance - Fully Reconciled' : 'Pending Unmatched Items'}
                </span>
              </div>
            </div>

            {/* AI Smart Match Assistant Banner */}
            {data.suggestions.length > 0 && (
              <div className="p-5 rounded-2xl bg-white border border-emerald-300 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-black text-stone-900 tracking-wide uppercase">
                      AI Reconciliation Agent: {data.suggestions.length} High-Confidence Explanations
                    </h3>
                  </div>
                  <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full">
                    Audited Suggestions
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.suggestions.map((sugg) => (
                    <div
                      key={sugg.id}
                      className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8E4DC] flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                            {sugg.matchType}
                          </span>
                          <span className="text-[11px] font-black text-emerald-700">
                            {Math.round(sugg.confidence * 100)}% Match
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 font-medium">
                          {locale === 'ar' ? sugg.explanationAr : sugg.explanationEn}
                        </p>
                      </div>

                      <div className="flex justify-end pt-1">
                        {sugg.matchType === 'FEES_INCLUDED' ? (
                          <button
                            onClick={() => handleCreateFeeEntry(sugg.statementLineId)}
                            disabled={isMatching}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition shadow-sm cursor-pointer"
                          >
                            Auto-Post Bank Fee Journal
                          </button>
                        ) : (
                          <button
                            onClick={() => handleManualMatch(sugg.statementLineId, sugg.ledgerLineId)}
                            disabled={isMatching}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm cursor-pointer"
                          >
                            Accept & Match Entry
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Split Screen: Bank Statement vs General Ledger */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Bank Statement Lines */}
              <div className="p-5 rounded-2xl bg-white border border-[#E8E4DC] shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                    Bank Statement Feed (MT940 / CAMT.053)
                  </h3>
                  <span className="text-[11px] text-stone-500 font-medium">
                    {data.statements.filter((s) => s.matchedStatus === 'UNMATCHED').length} Unmatched
                  </span>
                </div>

                <div className="space-y-2">
                  {data.statements.map((stmt) => (
                    <div
                      key={stmt.id}
                      onClick={() => stmt.matchedStatus !== 'MATCHED' && setSelectedStmtId(stmt.id)}
                      className={`p-3.5 rounded-xl border text-xs transition cursor-pointer ${
                        stmt.matchedStatus === 'MATCHED'
                          ? 'bg-[#FAF8F5]/50 border-[#E8E4DC] opacity-60'
                          : selectedStmtId === stmt.id
                          ? 'bg-emerald-50/60 border-emerald-500 ring-1 ring-emerald-500'
                          : 'bg-[#FAF8F5] border-[#E8E4DC] hover:border-emerald-500'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-stone-900">{stmt.description}</div>
                          <span className="text-[10px] text-stone-400 font-mono">Ref: {stmt.reference} · {stmt.date}</span>
                        </div>
                        <div className="text-end">
                          <div className={`font-mono font-bold ${toSafeBigInt(stmt.amountMinorUnits) > 0n ? 'text-emerald-700' : 'text-stone-800'}`}>
                            {formatMinorUnits(stmt.amountMinorUnits, { locale })}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stmt.matchedStatus === 'MATCHED' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                            {stmt.matchedStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: General Ledger Transactions */}
              <div className="p-5 rounded-2xl bg-white border border-[#E8E4DC] shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                    Ledger Account 1020 Transactions
                  </h3>
                  <span className="text-[11px] text-stone-500 font-medium">
                    {data.ledgerTransactions.filter((l) => !l.isReconciled).length} Unreconciled
                  </span>
                </div>

                <div className="space-y-2">
                  {data.ledgerTransactions.map((ledg) => (
                    <div
                      key={ledg.id}
                      onClick={() => !ledg.isReconciled && setSelectedLedgId(ledg.id)}
                      className={`p-3.5 rounded-xl border text-xs transition cursor-pointer ${
                        ledg.isReconciled
                          ? 'bg-[#FAF8F5]/50 border-[#E8E4DC] opacity-60'
                          : selectedLedgId === ledg.id
                          ? 'bg-emerald-50/60 border-emerald-500 ring-1 ring-emerald-500'
                          : 'bg-[#FAF8F5] border-[#E8E4DC] hover:border-emerald-500'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-stone-900">{ledg.description}</div>
                          <span className="text-[10px] text-stone-400 font-mono">Voucher: {ledg.voucherNumber} · {ledg.date}</span>
                        </div>
                        <div className="text-end">
                          <div className={`font-mono font-bold ${toSafeBigInt(ledg.amountMinorUnits) > 0n ? 'text-emerald-700' : 'text-stone-800'}`}>
                            {formatMinorUnits(ledg.amountMinorUnits, { locale })}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ledg.isReconciled ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                            {ledg.isReconciled ? 'RECONCILED' : 'UNRECONCILED'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Manual Match Trigger Bar */}
            {selectedStmtId && selectedLedgId && (
              <div className="p-4 rounded-2xl bg-stone-900 border border-stone-800 text-white flex items-center justify-between shadow-xl animate-fade-in">
                <span className="text-xs text-stone-200 font-medium">
                  Statement line <code className="font-mono text-emerald-400 font-bold">{selectedStmtId}</code> selected with Ledger entry <code className="font-mono text-emerald-400 font-bold">{selectedLedgId}</code>
                </span>
                <button
                  onClick={() => handleManualMatch(selectedStmtId, selectedLedgId)}
                  disabled={isMatching}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm cursor-pointer"
                >
                  Confirm Manual Match
                </button>
              </div>
            )}
          </div>
        )}
      </StateContainer>
    </div>
  );
}

export default function BankReconPage({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-stone-500">Loading bank reconciliation workspace...</div>}>
      <ReconciliationView params={params} />
    </Suspense>
  );
}
