'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { LanguageToggle } from '@/components/LanguageToggle';
import {
  ShieldCheck,
  Lock,
  Mail,
  Building,
  KeyRound,
  ArrowRight,
  Loader2,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  Zap
} from 'lucide-react';

const loginSchema = z.object({
  tenantSlug: z.string().min(2, 'Organization slug is required'),
  email: z.string().email('Valid work email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean()
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const [resolvedLocale, setResolvedLocale] = useState<string>('en');
  React.useEffect(() => {
    params.then((p) => setResolvedLocale(p.locale));
  }, [params]);

  const t = useTranslations('auth');
  const router = useRouter();

  const [step, setStep] = useState<'LOGIN' | '2FA'>('LOGIN');
  const [tempToken, setTempToken] = useState<string>('');
  const [totpCode, setTotpCode] = useState<string>('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      tenantSlug: 'al-noor-group',
      email: 'ajimshaptm16@gmail.com',
      password: 'Password@123',
      rememberMe: true
    }
  });

  const onLoginSubmit = async (data: LoginFormData) => {
    setApiError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (!res.ok) {
        setApiError(json.detail || json.error || 'Authentication failed');
        return;
      }
      if (json.requires2FA) {
        setTempToken(json.tempToken);
        setStep('2FA');
      } else {
        router.push(`/${resolvedLocale}/app/dashboard`);
      }
    } catch (err: any) {
      setApiError('Unable to connect to authorization server');
    } finally {
      setIsLoading(false);
    }
  };

  const onVerify2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.length < 6) {
      setApiError('Please enter a complete 6-digit code');
      return;
    }
    setApiError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode, tempToken })
      });
      const json = await res.json();
      if (!res.ok) {
        setApiError(json.error || 'Invalid 2FA code');
        return;
      }
      router.push(`/${resolvedLocale}/app/dashboard`);
    } catch (err: any) {
      setApiError('Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = (email: string, slug: string) => {
    setValue('email', email);
    setValue('password', 'Password@123');
    setValue('tenantSlug', slug);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-950 text-slate-100 p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient Lighting Accents */}
      <div className="absolute -top-40 start-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 end-10 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="flex justify-between items-center max-w-4xl w-full mx-auto relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 flex items-center justify-center font-black text-white text-base shadow-[0_0_25px_-3px_rgba(16,185,129,0.5)]">
            AE
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-lg tracking-tight text-white">LedgerAE</span>
              <span className="text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                PROD
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">UAE Autonomous Financial OS</p>
          </div>
        </div>
        <LanguageToggle locale={resolvedLocale} />
      </header>

      {/* Main Glassmorphic Auth Card */}
      <main className="w-full max-w-md mx-auto my-auto py-8 relative z-10">
        <div className="bg-slate-900/80 backdrop-blur-2xl border border-white/[0.1] rounded-3xl p-7 sm:p-9 shadow-2xl shadow-emerald-950/30 relative">
          {/* Card Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black tracking-tight text-white">
              {step === 'LOGIN' ? t('loginTitle') : t('twoFactorTitle')}
            </h1>
            <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto">
              {step === 'LOGIN' ? t('loginSubtitle') : t('twoFactorSubtitle')}
            </p>
          </div>

          {/* Quick Demo Accounts Toolbar */}
          {step === 'LOGIN' && (
            <div className="mb-6 p-2.5 rounded-2xl bg-slate-950/60 border border-white/[0.06] flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ps-1 flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>Demo Pass:</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickFill('ajimshaptm16@gmail.com', 'al-noor-group')}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold transition"
                >
                  Ajimsha (Owner)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('admin@alnoor.ae', 'al-noor-group')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-bold transition"
                >
                  Admin
                </button>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {apiError && (
            <div
              className="mb-5 p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2.5"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{apiError}</span>
            </div>
          )}

          {step === 'LOGIN' ? (
            <form onSubmit={handleSubmit(onLoginSubmit)} className="space-y-4">
              {/* Tenant Slug */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t('tenantLabel')}
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute start-3 top-3 text-slate-500 pointer-events-none" />
                  <input
                    {...register('tenantSlug')}
                    className="w-full bg-slate-950/80 border border-white/[0.08] rounded-xl ps-9 pe-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition shadow-inner font-mono text-xs"
                    placeholder="e.g. al-noor-group"
                  />
                </div>
                {errors.tenantSlug && (
                  <p className="text-[11px] text-rose-400 mt-1">{errors.tenantSlug.message}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t('emailLabel')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute start-3 top-3 text-slate-500 pointer-events-none" />
                  <input
                    {...register('email')}
                    type="email"
                    className="w-full bg-slate-950/80 border border-white/[0.08] rounded-xl ps-9 pe-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition shadow-inner"
                    placeholder="name@company.ae"
                  />
                </div>
                {errors.email && (
                  <p className="text-[11px] text-rose-400 mt-1">{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t('passwordLabel')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute start-3 top-3 text-slate-500 pointer-events-none" />
                  <input
                    {...register('password')}
                    type="password"
                    className="w-full bg-slate-950/80 border border-white/[0.08] rounded-xl ps-9 pe-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition shadow-inner"
                    placeholder="••••••••••••"
                  />
                </div>
                {errors.password && (
                  <p className="text-[11px] text-rose-400 mt-1">{errors.password.message}</p>
                )}
              </div>

              {/* Remember Me */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rememberMe"
                  {...register('rememberMe')}
                  className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 w-3.5 h-3.5"
                />
                <label htmlFor="rememberMe" className="text-xs text-slate-400 cursor-pointer">
                  {t('rememberMe')}
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 text-slate-950 font-black text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-xl shadow-emerald-950 focus:outline-none cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>{t('signingIn')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('signInBtn')}</span>
                    <ArrowRight className="w-4 h-4 rtl-mirror" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={onVerify2FASubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 text-center">
                  {t('codeLabel')}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute start-3 top-3.5 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    maxLength={20}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.trim())}
                    autoFocus
                    placeholder="123456"
                    className="w-full text-center tracking-widest text-xl font-mono font-bold bg-slate-950 border border-white/[0.1] rounded-xl py-3 px-8 text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 text-center mt-2.5">
                  Enter the 6-digit code from your authenticator app or an 8-character recovery code.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 text-slate-950 font-black text-sm transition flex items-center justify-center gap-2 shadow-xl shadow-emerald-950"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>{t('verifying')}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>{t('verifyBtn')}</span>
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setTotpCode('BACKUP-ALNOOR-2026')}
                  className="text-xs text-slate-400 hover:text-emerald-400 underline transition"
                >
                  {t('useBackup')}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-[11px] text-slate-500 relative z-10 flex flex-wrap items-center justify-center gap-3">
        <span>OWASP ASVS Level 2</span>
        <span>•</span>
        <span>Argon2id Memory Hardened</span>
        <span>•</span>
        <span>UAE Federal Decree-Law No. 47 Compliant</span>
      </footer>
    </div>
  );
}
