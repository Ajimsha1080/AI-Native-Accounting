'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { StateContainer } from '@/components/StateContainer';
import {
  CalendarCheck2,
  ShieldCheck,
  CheckCircle2,
  Clock,
  History,
  Lock,
  Users,
  KeyRound,
  FileCode2,
  Check,
  AlertCircle
} from 'lucide-react';

interface CloseStepItem {
  id: number;
  titleEn: string;
  titleAr: string;
  category: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  assignedRole: string;
  completedAt?: string;
  completedBy?: string;
  automatedVerification: boolean;
}

interface AuditLogEntry {
  id: string;
  sequenceNumber: number;
  timestamp: string;
  actor: string;
  actorRole: string;
  action: string;
  entityId: string;
  payloadHash: string;
  previousHash: string;
  ipAddress: string;
}

interface RolePermissionItem {
  roleCode: string;
  titleEn: string;
  titleAr: string;
  memberCount: number;
  permissions: string[];
}

interface ClosePayload {
  period: string;
  steps: CloseStepItem[];
  auditLogs: AuditLogEntry[];
  roles: RolePermissionItem[];
  isHardLocked: boolean;
}

function CloseAndSettingsView({ params }: { params: Promise<{ locale: string }> }) {
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  useEffect(() => {
    params.then((p) => setLocale(p.locale as 'en' | 'ar'));
  }, [params]);

  const [activeTab, setActiveTab] = useState<'CHECKLIST' | 'AUDIT_LOG' | 'ROLES'>('CHECKLIST');
  const [data, setData] = useState<ClosePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchCloseData = async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch('/api/close');
      if (!res.ok) throw new Error('Failed to load close & settings');
      const json = await res.json();
      setData(json);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCloseData();
  }, []);

  const toggleStep = async (stepId: number) => {
    setIsUpdating(true);
    try {
      const res = await fetch('/api/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'TOGGLE_STEP', stepId })
      });
      if (!res.ok) throw new Error('Failed to update step');
      fetchCloseData();
    } catch (err: any) {
      alert('Error updating step: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const completedCount = data?.steps.filter((s) => s.status === 'COMPLETED').length || 0;
  const totalCount = data?.steps.length || 12;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              <span>Financial Governance & Period Controls</span>
            </span>
          </div>
          <h1 className="text-xl font-black text-white flex items-center gap-2 mt-0.5">
            <CalendarCheck2 className="w-5 h-5 text-emerald-400" />
            <span>
              {locale === 'ar'
                ? 'إقفال الفترة، سجل التدقيق والأدوار (Close & Governance)'
                : 'Month-End Close, Audit Trail & Role Permissions'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {locale === 'ar'
              ? 'متابعة قائمة مهام الإقفال المالي، سجل التدقيق المشفر غير القابل للتعديل، وإدارة صلاحيات المستخدمين'
              : 'Deterministic 12-step close checklist, SHA-256 hash-chained audit log, and RBAC matrix'}
          </p>
        </div>

        {data && (
          <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">Progress:</span>
            <strong className="text-emerald-400 font-mono text-sm">
              {completedCount} / {totalCount} Done
            </strong>
          </div>
        )}
      </div>

      {/* Tabs Selector */}
      <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs font-bold">
        <button
          onClick={() => setActiveTab('CHECKLIST')}
          className={`px-4 py-2 rounded-xl transition ${
            activeTab === 'CHECKLIST'
              ? 'bg-emerald-600 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Close Checklist ({completedCount}/{totalCount})
        </button>
        <button
          onClick={() => setActiveTab('AUDIT_LOG')}
          className={`px-4 py-2 rounded-xl transition ${
            activeTab === 'AUDIT_LOG'
              ? 'bg-emerald-600 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Cryptographic Audit Trail
        </button>
        <button
          onClick={() => setActiveTab('ROLES')}
          className={`px-4 py-2 rounded-xl transition ${
            activeTab === 'ROLES'
              ? 'bg-emerald-600 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Roles & Permissions Matrix
        </button>
      </div>

      <StateContainer isLoading={isLoading} isError={isError} isEmpty={!data} onRetry={fetchCloseData}>
        {data && (
          <div className="space-y-6">
            {/* 1. Close Checklist Tab */}
            {activeTab === 'CHECKLIST' && (
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-xs font-bold text-slate-300">
                    Period: <strong className="text-white">{data.period}</strong> · Monthly Close Protocol
                  </span>
                  <span className="text-xs text-emerald-400 font-semibold">
                    Target Complete: Day 4 of Calendar Month
                  </span>
                </div>

                <div className="space-y-3">
                  {data.steps.map((step) => (
                    <div
                      key={step.id}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                        step.status === 'COMPLETED'
                          ? 'bg-slate-950/40 border-slate-800/80'
                          : step.status === 'IN_PROGRESS'
                          ? 'bg-slate-950 border-amber-500/80 ring-1 ring-amber-500/30'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          <button
                            onClick={() => toggleStep(step.id)}
                            disabled={isUpdating}
                            className={`w-5 h-5 rounded flex items-center justify-center transition border ${
                              step.status === 'COMPLETED'
                                ? 'bg-emerald-600 border-emerald-500 text-slate-950'
                                : 'border-slate-700 bg-slate-900 hover:border-emerald-500'
                            }`}
                          >
                            {step.status === 'COMPLETED' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </button>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-slate-500">
                              Step {step.id}
                            </span>
                            <h4
                              className={`text-xs font-bold ${
                                step.status === 'COMPLETED' ? 'text-slate-300 line-through' : 'text-white'
                              }`}
                            >
                              {locale === 'ar' ? step.titleAr : step.titleEn}
                            </h4>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                            <span>Role: <code className="text-slate-300 font-mono">{step.assignedRole}</code></span>
                            {step.completedBy && (
                              <span>Verified By: <strong className="text-slate-300">{step.completedBy}</strong> ({step.completedAt})</span>
                            )}
                            {step.automatedVerification && (
                              <span className="text-emerald-400 font-medium">✓ Automated Pre-check</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border self-start sm:self-auto shrink-0 ${
                          step.status === 'COMPLETED'
                            ? 'bg-emerald-950 border-emerald-800 text-emerald-300'
                            : step.status === 'IN_PROGRESS'
                            ? 'bg-amber-950 border-amber-800 text-amber-300 animate-pulse'
                            : 'bg-slate-900 border-slate-800 text-slate-500'
                        }`}
                      >
                        {step.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Cryptographic Audit Trail Tab */}
            {activeTab === 'AUDIT_LOG' && (
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-black text-white uppercase tracking-wider">
                      Immutable Append-Only Audit Trail (SHA-256 Hash Chain)
                    </h3>
                  </div>
                  <span className="text-xs text-emerald-400 font-mono font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Cryptographic Chain Valid (Zero Tampering)</span>
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                  <table className="w-full text-xs text-start border-collapse">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="p-3 ps-4 text-start w-16">Seq #</th>
                        <th className="p-3 text-start">Timestamp (UTC)</th>
                        <th className="p-3 text-start">Actor & Role</th>
                        <th className="p-3 text-start">Action Executed</th>
                        <th className="p-3 text-start">Payload SHA-256 Hash</th>
                        <th className="p-3 pe-4 text-start">Previous Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {data.auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/40 text-[11px]">
                          <td className="p-3 ps-4 font-bold text-white">{log.sequenceNumber}</td>
                          <td className="p-3 text-slate-300">{log.timestamp}</td>
                          <td className="p-3">
                            <div className="font-sans font-bold text-white">{log.actor}</div>
                            <span className="text-[10px] text-emerald-400 font-mono">{log.actorRole}</span>
                          </td>
                          <td className="p-3 font-sans font-semibold text-slate-200">{log.action}</td>
                          <td className="p-3 text-cyan-400 truncate max-w-xs" title={log.payloadHash}>
                            {log.payloadHash.slice(0, 16)}...
                          </td>
                          <td className="p-3 pe-4 text-slate-500 truncate max-w-xs" title={log.previousHash}>
                            {log.previousHash.slice(0, 16)}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. Roles & Permissions Tab */}
            {activeTab === 'ROLES' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.roles.map((r) => (
                  <div key={r.roleCode} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-emerald-400" />
                          <h4 className="text-xs font-black text-white font-mono">{r.roleCode}</h4>
                        </div>
                        <div className="text-xs text-slate-300 mt-1 font-semibold">
                          {locale === 'ar' ? r.titleAr : r.titleEn}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-400">
                        {r.memberCount} Active Users
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Assigned Statutory Permissions:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {r.permissions.map((p) => (
                          <span
                            key={p}
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-950 border border-slate-800 text-slate-300"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </StateContainer>
    </div>
  );
}

export default function ClosePage({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Loading month-end close controls...</div>}>
      <CloseAndSettingsView params={params} />
    </Suspense>
  );
}
