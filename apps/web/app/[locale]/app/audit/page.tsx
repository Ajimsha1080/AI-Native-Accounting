'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Shield, ShieldAlert, UserCheck, Clock, FileText } from 'lucide-react';

export default function AuditRolesPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const isAr = locale === 'ar';

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/audit-roles?limit=50');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.auditLogs || []);
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {isAr ? 'سجل التدقيق الأمني وإدارة الأدوار' : 'Security Audit Trail & User Roles'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'سجل غير قابل للتعديل لجميع العمليات المالية والضريبية وصلاحيات الوصول المتدرجة'
              : 'Cryptographic immutable audit trail of all financial actions and role-based access control'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500">{isAr ? 'جارٍ التحميل...' : 'Loading audit logs...'}</div>
      ) : (
        <div className="space-y-8">
          {/* Active Users & Roles */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-white text-base">
                <UserCheck className="w-5 h-5 text-emerald-400" />
                <span>{isAr ? 'المستخدمون والأدوار النشطة' : 'Users & Assigned Roles'}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-950/40 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">{isAr ? 'البريد الإلكتروني' : 'Email'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'الاسم' : 'Name'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'الدور الوظيفي' : 'Role'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'المصادقة الثنائية' : '2FA Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-mono text-emerald-400 font-medium">{u.email}</td>
                      <td className="py-3 px-4 font-semibold text-white">{isAr ? u.nameAr || u.nameEn : u.nameEn}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                          {u.is2faEnabled ? '2FA ENFORCED' : 'DISABLED'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Immutable Audit Log Stream */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-white text-base">
                <Shield className="w-5 h-5 text-indigo-400" />
                <span>{isAr ? 'سجل التدقيق اللحظي' : 'Immutable Audit Log Stream'}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-950/40 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">{isAr ? 'الوقت' : 'Timestamp'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'المستخدم' : 'Actor'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'الإجراء' : 'Action'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'نوع المورد' : 'Resource'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'التفاصيل' : 'Changes / Payload'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition text-xs font-mono">
                      <td className="py-3 px-4 text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="py-3 px-4 text-white font-medium">{log.userEmail || 'System Agent'}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-bold border border-slate-700">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-indigo-400 font-bold">{log.resourceType}</td>
                      <td className="py-3 px-4 text-slate-400 max-w-md truncate">
                        {typeof log.changes === 'object' ? JSON.stringify(log.changes) : log.changes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
