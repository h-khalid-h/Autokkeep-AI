'use client';

import { useEffect, useState } from 'react';
import { getCountryFlag, getCountryName } from '@/lib/country';

export interface GeoData {
  country: string;
  countryName: string;
  flag: string;
  currency: string;
  currencySymbol: string;
  taxAuthority: string;
  taxSystemLabel: string;
  timezone: string;
  loaded: boolean;
}

const DEFAULT_GEO: GeoData = {
  country: 'US',
  countryName: 'United States',
  flag: '🇺🇸',
  currency: 'USD',
  currencySymbol: '$',
  taxAuthority: 'IRS',
  taxSystemLabel: 'Federal Income Tax',
  timezone: 'America/New_York',
  loaded: false,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  CAD: '$',
  GBP: '£',
  EUR: '€',
  AUD: '$',
  INR: '₹',
  JPY: '¥',
  AED: 'د.إ',
  BRL: 'R$',
  MXN: '$',
};

const COUNTRY_DEFAULTS: Record<string, { currency: string; taxAuthority: string; taxSystemLabel: string; timezone: string }> = {
  US: { currency: 'USD', taxAuthority: 'IRS', taxSystemLabel: 'Federal Income Tax', timezone: 'America/New_York' },
  CA: { currency: 'CAD', taxAuthority: 'CRA', taxSystemLabel: 'Corporate Income Tax', timezone: 'America/Toronto' },
  GB: { currency: 'GBP', taxAuthority: 'HMRC', taxSystemLabel: 'Corporation Tax', timezone: 'Europe/London' },
  DE: { currency: 'EUR', taxAuthority: 'Finanzamt', taxSystemLabel: 'Körperschaftsteuer', timezone: 'Europe/Berlin' },
  FR: { currency: 'EUR', taxAuthority: 'DGFiP', taxSystemLabel: 'Impôt sur les sociétés', timezone: 'Europe/Paris' },
  NL: { currency: 'EUR', taxAuthority: 'Belastingdienst', taxSystemLabel: 'Vennootschapsbelasting', timezone: 'Europe/Amsterdam' },
  IE: { currency: 'EUR', taxAuthority: 'Revenue', taxSystemLabel: 'Corporation Tax', timezone: 'Europe/Dublin' },
  EE: { currency: 'EUR', taxAuthority: 'EMTA', taxSystemLabel: 'Corporation Tax', timezone: 'Europe/Tallinn' },
  AE: { currency: 'AED', taxAuthority: 'FTA', taxSystemLabel: 'Corporate Tax', timezone: 'Asia/Dubai' },
  AU: { currency: 'AUD', taxAuthority: 'ATO', taxSystemLabel: 'Company Tax', timezone: 'Australia/Sydney' },
  IN: { currency: 'INR', taxAuthority: 'Income Tax Department', taxSystemLabel: 'Income Tax', timezone: 'Asia/Kolkata' },
  JP: { currency: 'JPY', taxAuthority: 'NTA', taxSystemLabel: 'Corporate Tax', timezone: 'Asia/Tokyo' },
  BR: { currency: 'BRL', taxAuthority: 'Receita Federal', taxSystemLabel: 'IRPJ', timezone: 'America/Sao_Paulo' },
  MX: { currency: 'MXN', taxAuthority: 'SAT', taxSystemLabel: 'ISR', timezone: 'America/Mexico_City' },
};

export function useGeoLocation() {
  // Use lazy initializer to read cached geo from sessionStorage,
  // avoiding setState-during-effect lint violations.
  const [geoData, setGeoData] = useState<GeoData>(() => {
    try {
      const cached = sessionStorage.getItem('autokkeep_geo');
      if (cached) return JSON.parse(cached) as GeoData;
    } catch (_e) { /* ignore */ }
    return DEFAULT_GEO;
  });

  useEffect(() => {
    // If we already have cached data (loaded=true), skip detection
    if (geoData.loaded) return;

    const controller = new AbortController();
    const detect = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const countryCode = (data.country_code || 'US').toUpperCase();
        
        const name = getCountryName(countryCode);
        const flag = getCountryFlag(countryCode);
        const defaults = COUNTRY_DEFAULTS[countryCode] || COUNTRY_DEFAULTS.US;
        const symbol = CURRENCY_SYMBOLS[defaults.currency] || '$';

        const geo: GeoData = {
          country: countryCode,
          countryName: name,
          flag,
          currency: defaults.currency,
          currencySymbol: symbol,
          taxAuthority: defaults.taxAuthority,
          taxSystemLabel: defaults.taxSystemLabel,
          timezone: data.timezone || defaults.timezone,
          loaded: true,
        };

        setGeoData(geo);
        try {
          sessionStorage.setItem('autokkeep_geo', JSON.stringify(geo));
        } catch (_e) { /* ignore */ }
      } catch (_err) {
        // Fallback to default but mark loaded
        setGeoData(prev => ({ ...prev, loaded: true }));
      }
    };

    void detect();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return geoData;
}
