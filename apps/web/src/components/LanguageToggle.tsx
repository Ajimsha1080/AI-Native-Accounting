'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe } from 'lucide-react';

export function LanguageToggle({ locale }: { locale: string }) {
  const pathname = usePathname();
  const targetLocale = locale === 'ar' ? 'en' : 'ar';
  
  // Replace current locale prefix with target locale prefix
  const targetPath = pathname.replace(`/${locale}`, `/${targetLocale}`) || `/${targetLocale}`;

  return (
    <Link
      href={targetPath}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-[#E8E4DC] bg-white hover:bg-[#F6F3EB] text-stone-700 shadow-xs transition focus:outline-none focus:ring-2 focus:ring-stone-900"
      aria-label={locale === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
    >
      <Globe className="w-3.5 h-3.5 text-stone-500" />
      <span>{locale === 'ar' ? 'English' : 'العربية'}</span>
    </Link>
  );
}
