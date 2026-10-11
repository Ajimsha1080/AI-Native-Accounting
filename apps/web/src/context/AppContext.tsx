'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
}

export interface LegalEntity {
  id: string;
  tenantId: string;
  name: string;
  nameAr: string;
  trn: string;
  jurisdiction: 'MAINLAND' | 'FREE_ZONE' | 'QFZP' | 'DIFC_ADGM' | 'GROUP';
}

interface AppContextType {
  tenant: Tenant;
  entity: LegalEntity;
  availableTenants: Tenant[];
  availableEntities: LegalEntity[];
  fiscalPeriod: string;
  sessionRemainingSeconds: number;
  setTenant: (tenant: Tenant) => void;
  setEntity: (entity: LegalEntity) => void;
  refreshSession: () => void;
}

const DEFAULT_TENANTS: Tenant[] = [
  { id: 't-alnoor', name: 'Al-Noor Holdings Group', slug: 'al-noor-group' },
  { id: 't-gulfcorp', name: 'Gulf Distribution PJSC', slug: 'gulf-corp' }
];

const DEFAULT_ENTITIES: LegalEntity[] = [
  {
    id: 'group',
    tenantId: 't-alnoor',
    name: 'Al-Noor Group (Consolidated)',
    nameAr: 'مجموعة النور (القوائم الموحدة)',
    trn: 'N/A - Group',
    jurisdiction: 'GROUP'
  },
  {
    id: 'ent-mainland',
    tenantId: 't-alnoor',
    name: 'Al-Noor Trading LLC (Dubai Mainland)',
    nameAr: 'شركة النور للتجارة ذ.م.م (دبي)',
    trn: '100456789012345',
    jurisdiction: 'MAINLAND'
  },
  {
    id: 'ent-dmcc',
    tenantId: 't-alnoor',
    name: 'Al-Noor Tech DMCC (Free Zone)',
    nameAr: 'النور للتقنية م.د.م.س (منطقة حرة)',
    trn: '100222333444555',
    jurisdiction: 'FREE_ZONE'
  },
  {
    id: 'ent-jafza',
    tenantId: 't-alnoor',
    name: 'Al-Noor Logistics FZE (JAFZA QFZP)',
    nameAr: 'النور للخدمات اللوجستية م.ح.ف (جافزا)',
    trn: '100111222333444',
    jurisdiction: 'QFZP'
  },
  {
    id: 'ent-difc',
    tenantId: 't-alnoor',
    name: 'Al-Noor Capital Partners Ltd (DIFC)',
    nameAr: 'النور كابيتال بارتنرز المحدودة (مركز دبي المالي العالمي)',
    trn: 'N/A - Financial Services',
    jurisdiction: 'DIFC_ADGM'
  }
];

const AppContext = createContext<AppContextType | null>(null);

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<Tenant>(DEFAULT_TENANTS[0]);
  const [entity, setEntity] = useState<LegalEntity>(DEFAULT_ENTITIES[0]);
  const [sessionRemainingSeconds, setSessionRemainingSeconds] = useState(1800); // 30 min session

  useEffect(() => {
    const timer = setInterval(() => {
      setSessionRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const refreshSession = () => {
    setSessionRemainingSeconds(1800);
  };

  return (
    <AppContext.Provider
      value={{
        tenant,
        entity,
        availableTenants: DEFAULT_TENANTS,
        availableEntities: DEFAULT_ENTITIES,
        fiscalPeriod: 'FY2026 - P01 [OPEN]',
        sessionRemainingSeconds,
        setTenant,
        setEntity,
        refreshSession
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppContextProvider');
  }
  return context;
}
