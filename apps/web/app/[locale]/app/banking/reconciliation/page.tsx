'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { StateContainer } from '@/components/StateContainer';
import { formatMinorUnits } from '@/lib/money';
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
        body: JSON.stringify({ action: 'AUTO_CREATE_FEE_ENTRY', statementLineId: stmtId })
      });
      if (!res.ok) throw new Error('Fee posting failed');
      fetchRecon();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Landmark className="w-5 h-5 text-emerald-400" />
            <span>
              {locale === 'ar'
                ? 'التسوية المصرفية الذكية (Bank Reconciliation)'
                : 'AI-Powered Bank Reconciliation'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {locale === 'ar'
              ? 'مطابقة كشوف الحسابات المصرفية (MT940/CAMT.053) مع قيود دفتر الأستاذ العام وتفسير الفروقات بالذكاء الاصطناعي'
              : 'Continuous matching of bank feeds against general ledger with explainable confidence'}
          </p>
        </div>

        <button
          onClick={fetchRecon}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto"
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
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
                <span className="text-[11px] text-slate-400 font-semibold block">BANK STATEMENT BALANCE</span>
                <div className="text-lg font-black text-white mt-1">
                  {formatMinorUnits(BigInt(data.bankBalanceMinorUnits), { locale })}
                </div>
                <span className="text-[10px] text-slate-500 font-mono">IBAN: {data.iban}</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
                <span className="text-[11px] text-slate-400 font-semibold block">GENERAL LEDGER BALANCE</span>
                <div className="text-lg font-black text-white mt-1">
                  {formatMinorUnits(BigInt(data.ledgerBalanceMinorUnits), { locale })}
                </div>
                <span className="text-[10px] text-slate-500 font-medium">{data.accountName}</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
                <span className="text-[11px] text-slate-400 font-semibold block">RECONCILIATION VARIANCE</span>
                <div className={`text-lg font-black mt-1 ${data.differenceMinorUnits === '0' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {formatMinorUnits(BigInt(data.differenceMinorUnits), { locale })}
                </div>
                <span className="text-[10px] text-slate-500">
                  {data.differenceMinorUnits === '0' ? 'Zero Variance - Fully Reconciled' : 'Pending Unmatched Items'}
                </span>
              </div>
            </div>

            {/* AI Smart Match Assistant Banner */}
            {data.suggestions.length > 0 && (
              <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-black text-white tracking-wide uppercase">
                      AI Reconciliation Agent: {data.suggestions.length} High-Confidence Explanations
                    </h3>
                  </div>
                  <span className="text-[10px] bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                    Audited Suggestions
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.suggestions.map((sugg) => (
                    <div
                      key={sugg.id}
                      className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between gap-2.5"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold text-cyan-400">
                            {sugg.matchType}
                          </span>
                          <span className="text-[11px] font-black text-emerald-400">
                            {Math.round(sugg.confidence * 100)}% Match
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">
                          {locale === 'ar' ? sugg.explanationAr : sugg.explanationEn}
                        </p>
                      </div>

                      <div className="flex justify-end pt-1">
                        {sugg.matchType === 'FEES_INCLUDED' ? (
                          <button
                            onClick={() => handleCreateFeeEntry(sugg.statementLineId)}
                            disabled={isMatching}
                            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition shadow"
                          >
                            Auto-Post Bank Fee Journal
                          </button>
                        ) : (
                          <button
                            onClick={() => handleManualMatch(sugg.statementLineId, sugg.ledgerLineId)}
                            disabled={isMatching}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[11px] transition shadow"
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
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Bank Statement Feed (MT940 / CAMT.053)
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {data.statements.filter((s) => s.matchedStatus === 'UNMATCHED').length} Unmatched
                  </span>
                </div>

                <div className="space-y-2">
                  {data.statements.map((stmt) => (
                    <div
                      key={stmt.id}
                      onClick={() => stmt.matchedStatus !== 'MATCHED' && setSelectedStmtId(stmt.id)}
                      className={`p-3 rounded-xl border text-xs transition cursor-pointer ${
                        stmt.matchedStatus === 'MATCHED'
                          ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                          : selectedStmtId === stmt.id
                          ? 'bg-slate-800 border-emerald-500 ring-1 ring-emerald-500'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-white">{stmt.description}</div>
                          <span className="text-[10px] text-slate-500 font-mono">Ref: {stmt.reference} · {stmt.date}</span>
                        </div>
                        <div className="text-end">
                          <div className={`font-mono font-bold ${BigInt(stmt.amountMinorUnits) > 0n ? 'text-emerald-400' : 'text-slate-300'}`}>
                            {formatMinorUnits(BigInt(stmt.amountMinorUnits), { locale })}
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${stmt.matchedStatus === 'MATCHED' ? 'bg-emerald-950 border-emerald-800 text-emerald-300' : 'bg-amber-950 border-amber-800 text-amber-300'}`}>
                            {stmt.matchedStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: General Ledger Transactions */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Ledger Account 1020 Transactions
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {data.ledgerTransactions.filter((l) => !l.isReconciled).length} Unreconciled
                  </span>
                </div>

                <div className="space-y-2">
                  {data.ledgerTransactions.map((ledg) => (
                    <div
                      key={ledg.id}
                      onClick={() => !ledg.isReconciled && setSelectedLedgId(ledg.id)}
                      className={`p-3 rounded-xl border text-xs transition cursor-pointer ${
                        ledg.isReconciled
                          ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                          : selectedLedgId === ledg.id
                          ? 'bg-slate-800 border-emerald-500 ring-1 ring-emerald-500'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-white">{ledg.description}</div>
                          <span className="text-[10px] text-slate-500 font-mono">Voucher: {ledg.voucherNumber} · {ledg.date}</span>
                        </div>
                        <div className="text-end">
                          <div className={`font-mono font-bold ${BigInt(ledg.amountMinorUnits) > 0n ? 'text-emerald-400' : 'text-slate-300'}`}>
                            {formatMinorUnits(BigInt(ledg.amountMinorUnits), { locale })}
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${ledg.isReconciled ? 'bg-emerald-950 border-emerald-800 text-emerald-300' : 'bg-amber-950 border-amber-800 text-amber-300'}`}>
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
              <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-800 flex items-center justify-between animate-fade-in">
                <span className="text-xs text-emerald-300 font-semibold">
                  Statement line <code className="font-mono text-white">{selectedStmtId}</code> selected with Ledger entry <code className="font-mono text-white">{selectedLedgId}</code>
                </span>
                <button
                  onClick={() => handleManualMatch(selectedStmtId, selectedLedgId)}
                  disabled={isMatching}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition"
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
    <Suspense fallback={<div className="p-8 text-slate-400">Loading bank reconciliation workspace...</div>}>
      <ReconciliationView params={params} />
    </Suspense>
  );
}
