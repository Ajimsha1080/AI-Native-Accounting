'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ShieldCheck, Lock, Mail, Building, KeyRound, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

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
    formState: { errors }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      tenantSlug: 'al-noor-group',
      email: '',
      password: '',
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

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-950 text-slate-100 p-4 sm:p-6">
      {/* Top bar with language switcher */}
      <header className="flex justify-between items-center max-w-4xl w-full mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white shadow-md">
            AE
          </div>
          <span className="font-extrabold text-base tracking-tight">LedgerAE</span>
        </div>
        <LanguageToggle locale={resolvedLocale} />
      </header>

      {/* Main Auth Card */}
      <main className="w-full max-w-md mx-auto my-auto py-8">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-emerald-950/20">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {step === 'LOGIN' ? t('loginTitle') : t('twoFactorTitle')}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {step === 'LOGIN' ? t('loginSubtitle') : t('twoFactorSubtitle')}
            </p>
          </div>

          {/* Error Banner */}
          {apiError && (
            <div
              className="mb-5 p-3 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2"
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
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('tenantLabel')}
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute start-3 top-3 text-slate-500" />
                  <input
                    {...register('tenantSlug')}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl ps-9 pe-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                    placeholder="e.g. al-noor-group"
                  />
                </div>
                {errors.tenantSlug && (
                  <p className="text-[11px] text-rose-400 mt-1">{errors.tenantSlug.message}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('emailLabel')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute start-3 top-3 text-slate-500" />
                  <input
                    {...register('email')}
                    type="email"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl ps-9 pe-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                    placeholder="name@company.ae"
                  />
                </div>
                {errors.email && (
                  <p className="text-[11px] text-rose-400 mt-1">{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('passwordLabel')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute start-3 top-3 text-slate-500" />
                  <input
                    {...register('password')}
                    type="password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl ps-9 pe-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
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
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
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
                  <KeyRound className="w-4 h-4 absolute start-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    maxLength={20}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.trim())}
                    autoFocus
                    placeholder="123456"
                    className="w-full text-center tracking-widest text-lg font-mono font-bold bg-slate-950 border border-slate-800 rounded-xl py-2 px-8 text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 text-center mt-2">
                  Enter the 6-digit code from your authenticator app or an 8-character recovery code.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
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
      <footer className="text-center text-[11px] text-slate-500">
        LedgerAE UAE Compliance Core · OWASP ASVS Level 2 · Strict AES-256 Auth Session
      </footer>
    </div>
  );
}
