'use client';

import React from 'react';
import { Loader2, AlertCircle, ShieldAlert, FolderOpen } from 'lucide-react';

interface StateContainerProps {
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  isUnauthorized?: boolean;
  errorMessage?: string;
  requiredRole?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}

export function StateContainer({
  isLoading,
  isError,
  isEmpty,
  isUnauthorized,
  errorMessage,
  requiredRole,
  onRetry,
  children
}: StateContainerProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-3" role="status" aria-live="polite">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="text-sm font-medium">Loading ledger data...</span>
      </div>
    );
  }

  if (isUnauthorized) {
    return (
      <div className="p-6 rounded-xl border border-rose-900/60 bg-rose-950/20 text-rose-300 space-y-3" role="alert">
        <div className="flex items-center gap-2 font-bold text-rose-400">
          <ShieldAlert className="w-5 h-5" />
          <span>Access Denied (403 Forbidden)</span>
        </div>
        <p className="text-xs text-rose-300/80">
          Your current session role is not authorized to access this resource.
          {requiredRole && (
            <span className="block mt-1 font-mono text-[11px] bg-rose-950 px-2 py-0.5 rounded border border-rose-800 w-fit">
              Required Role: {requiredRole}
            </span>
          )}
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 rounded-xl border border-amber-900/60 bg-amber-950/20 text-amber-300 space-y-3" role="alert">
        <div className="flex items-center gap-2 font-bold text-amber-400">
          <AlertCircle className="w-5 h-5" />
          <span>Error Loading Data</span>
        </div>
        <p className="text-xs text-amber-300/80">{errorMessage || 'An unexpected API communication error occurred.'}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            Retry Request
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 space-y-2 text-center">
        <FolderOpen className="w-10 h-10 text-slate-600" />
        <h4 className="text-sm font-semibold text-slate-300">No Records Found</h4>
        <p className="text-xs max-w-sm">No entries or vouchers exist for the active entity and period context.</p>
      </div>
    );
  }

  return <>{children}</>;
}
