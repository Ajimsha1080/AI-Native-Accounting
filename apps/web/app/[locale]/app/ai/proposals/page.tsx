'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { StateContainer } from '@/components/StateContainer';
import { formatMinorUnits } from '@/lib/money';
import {
  Bot,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Coins,
  Scale,
  Clock,
  Sparkles,
  ArrowRight,
  Filter
} from 'lucide-react';

interface CostMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostAedMinorUnits: string;
  executionLatencyMs: number;
  model: string;
}

interface ProposedJournal {
  debitAccount: string;
  creditAccount: string;
  amountMinorUnits: string;
}

interface AiProposalItem {
  id: string;
  titleEn: string;
  titleAr: string;
  sourceEvent: string;
  targetEntity: string;
  category: string;
  confidenceScore: number;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  legalBasis: string;
  logicExplanationEn: string;
  logicExplanationAr: string;
  proposedJournal?: ProposedJournal;
  costMetrics: CostMetrics;
}

interface ProposalsPayload {
  proposals: AiProposalItem[];
  pendingCount: number;
  totalTokensConsumed: number;
  totalProposals: number;
}

function ProposalsInboxView({ params }: { params: Promise<{ locale: string }> }) {
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  useEffect(() => {
    params.then((p) => setLocale(p.locale as 'en' | 'ar'));
  }, [params]);

  const [data, setData] = useState<ProposalsPayload | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchProposals = async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch('/api/ai/proposals');
      if (!res.ok) throw new Error('Failed to load AI proposals');
      const json = await res.json();
      setData(json);
      if (json.proposals.length > 0 && !activeProposalId) {
        setActiveProposalId(json.proposals[0].id);
      }
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, []);

  const handleDecision = async (proposalId: string, decision: 'APPROVE' | 'REJECT') => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/ai/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId,
          decision,
          rationale: `Decision submitted via Governance Console on ${new Date().toISOString()}`
        })
      });
      if (!res.ok) throw new Error('Decision submission failed');
      const newStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          proposals: prev.proposals.map((p) => (p.id === proposalId ? { ...p, status: newStatus as any } : p)),
          pendingCount: Math.max(0, prev.pendingCount - 1)
        };
      });
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProposals = useMemo(() => {
    if (!data) return [];
    if (filterCategory === 'ALL') return data.proposals;
    return data.proposals.filter((p) => p.category === filterCategory);
  }, [data, filterCategory]);

  const activeProposal = useMemo(() => {
    if (!data) return null;
    return data.proposals.find((p) => p.id === activeProposalId) || data.proposals[0];
  }, [data, activeProposalId]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
              <Bot className="w-3.5 h-3.5" />
              <span>Autonomous Agent Governance Core</span>
            </span>
          </div>
          <h1 className="text-xl font-black text-white flex items-center gap-2 mt-0.5">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <span>
              {locale === 'ar'
                ? 'صندوق مقترحات الذكاء الاصطناعي (AI Proposals Inbox)'
                : 'AI Proposals & Agent Governance Inbox'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {locale === 'ar'
              ? 'مراجعة واعتماد أو رفض توصيات المحاسب الآلي مع إظهار الأساس القانوني، المنطق، وتكلفة الرموز'
              : 'Human-in-the-loop review for agentic suggestions: source lineage, statutory logic, and token telemetry'}
          </p>
        </div>

        {/* Global Token Telemetry Pill */}
        {data && (
          <div className="flex items-center gap-3 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
              <Cpu className="w-3.5 h-3.5" />
              <span>{data.totalTokensConsumed.toLocaleString()} Tokens Ingested</span>
            </div>
            <div className="h-4 w-px bg-slate-800" />
            <div className="text-amber-400 font-bold">{data.pendingCount} Pending Approval</div>
          </div>
        )}
      </div>

      <StateContainer isLoading={isLoading} isError={isError} isEmpty={!data} onRetry={fetchProposals}>
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Proposals Feed */}
            <div className="lg:col-span-5 space-y-3">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-semibold overflow-x-auto">
                {['ALL', 'TAX_OPTIMIZATION', 'RECONCILIATION', 'COMPLIANCE'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-3 py-1 rounded-lg transition whitespace-nowrap ${
                      filterCategory === cat
                        ? 'bg-emerald-600 text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Proposal Cards List */}
              <div className="space-y-2.5">
                {filteredProposals.map((prop) => (
                  <div
                    key={prop.id}
                    onClick={() => setActiveProposalId(prop.id)}
                    className={`p-4 rounded-xl border text-xs cursor-pointer transition ${
                      activeProposal?.id === prop.id
                        ? 'bg-slate-800/80 border-emerald-500 ring-1 ring-emerald-500'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                          {prop.category.replace('_', ' ')}
                        </span>
                        <h4 className="font-bold text-white text-xs leading-snug">
                          {locale === 'ar' ? prop.titleAr : prop.titleEn}
                        </h4>
                        <div className="text-[11px] text-slate-400">{prop.targetEntity}</div>
                      </div>

                      <div className="text-end shrink-0">
                        <span className="font-mono font-black text-emerald-400 text-xs block">
                          {Math.round(prop.confidenceScore * 100)}%
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border inline-block mt-1 ${
                            prop.status === 'APPROVED'
                              ? 'bg-emerald-950 border-emerald-800 text-emerald-300'
                              : prop.status === 'REJECTED'
                              ? 'bg-rose-950 border-rose-800 text-rose-300'
                              : 'bg-amber-950 border-amber-800 text-amber-300'
                          }`}
                        >
                          {prop.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Deep Inspection Panel */}
            <div className="lg:col-span-7">
              {activeProposal ? (
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 shadow-2xl">
                  {/* Proposal Header */}
                  <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 text-[10px] font-mono font-bold">
                          {activeProposal.id}
                        </span>
                        <span className="text-xs text-slate-400">{activeProposal.targetEntity}</span>
                      </div>
                      <h2 className="text-base font-black text-white mt-1">
                        {locale === 'ar' ? activeProposal.titleAr : activeProposal.titleEn}
                      </h2>
                    </div>

                    <div className="text-end">
                      <span className="text-[10px] text-slate-500 block">AI CONFIDENCE</span>
                      <span className="text-lg font-black text-emerald-400 font-mono">
                        {Math.round(activeProposal.confidenceScore * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* 1. Source Event Lineage */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      SOURCE TRIGGER / EVENT LINEAGE
                    </span>
                    <div className="text-xs font-semibold text-slate-200">{activeProposal.sourceEvent}</div>
                  </div>

                  {/* 2. Statutory Legal Basis */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5" />
                      <span>UAE STATUTORY LEGAL BASIS & DECREE-LAW</span>
                    </span>
                    <div className="text-xs font-semibold text-slate-200">{activeProposal.legalBasis}</div>
                  </div>

                  {/* 3. Logic & Reasoning */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                      EXPLAINABLE REASONING & LOGIC
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {locale === 'ar'
                        ? activeProposal.logicExplanationAr
                        : activeProposal.logicExplanationEn}
                    </p>
                  </div>

                  {/* 4. Proposed Journal Voucher (if any) */}
                  {activeProposal.proposedJournal && (
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                        PROPOSED DOUBLE-ENTRY JOURNAL VOUCHER
                      </span>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-slate-500 block text-[10px]">DEBIT ACCOUNT</span>
                          <strong className="text-white text-xs">{activeProposal.proposedJournal.debitAccount}</strong>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-slate-500 block text-[10px]">CREDIT ACCOUNT</span>
                          <strong className="text-white text-xs">{activeProposal.proposedJournal.creditAccount}</strong>
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-1 text-xs">
                        <span className="text-slate-400">Posting Amount (Integer Fils):</span>
                        <strong className="font-mono text-emerald-400 text-sm">
                          {formatMinorUnits(activeProposal?.proposedJournal?.amountMinorUnits, { locale })}
                        </strong>
                      </div>
                    </div>
                  )}

                  {/* 5. Token Cost & Execution Telemetry */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Model: <strong className="text-slate-200">{activeProposal?.costMetrics?.model || 'Claude-3.7'}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>Tokens: <strong className="text-slate-200">{activeProposal?.costMetrics?.totalTokens ?? 0}</strong> ({activeProposal?.costMetrics?.promptTokens ?? 0} in / {activeProposal?.costMetrics?.completionTokens ?? 0} out)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Latency: <strong className="text-slate-200">{activeProposal?.costMetrics?.executionLatencyMs ?? 0}ms</strong></span>
                    </div>
                    <div>
                      <span>Cost: <strong className="text-emerald-400 font-mono">{formatMinorUnits(activeProposal?.costMetrics?.estimatedCostAedMinorUnits, { locale })}</strong></span>
                    </div>
                  </div>

                  {/* 6. Human Review Decision Actions */}
                  {activeProposal.status === 'PENDING_REVIEW' && (
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={() => handleDecision(activeProposal.id, 'APPROVE')}
                        disabled={isSubmitting}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-black text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Approve & Commit Action</span>
                      </button>
                      <button
                        onClick={() => handleDecision(activeProposal.id, 'REJECT')}
                        disabled={isSubmitting}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-rose-950 hover:bg-rose-900 disabled:opacity-50 text-rose-300 font-bold text-xs transition flex items-center justify-center gap-2 border border-rose-800"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject Proposal</span>
                      </button>
                    </div>
                  )}

                  {activeProposal.status !== 'PENDING_REVIEW' && (
                    <div className={`p-3 rounded-xl border text-xs text-center font-bold ${activeProposal.status === 'APPROVED' ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border-rose-800 text-rose-300'}`}>
                      Proposal has been {activeProposal.status} by Chief Accountant.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </StateContainer>
    </div>
  );
}

export default function ProposalsPage({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Loading AI proposals governance console...</div>}>
      <ProposalsInboxView params={params} />
    </Suspense>
  );
}
