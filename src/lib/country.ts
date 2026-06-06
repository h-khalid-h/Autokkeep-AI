// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Country & Jurisdiction Helpers
// Provides flag emoji mapping, tax authority details, and country display names
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const COUNTRY_FLAG_MAP: Record<string, string> = {
  US: '🇺🇸',
  CA: '🇨🇦',
  BR: '🇧🇷',
  MX: '🇲🇽',
  GB: '🇬🇧',
  DE: '🇩🇪',
  FR: '🇫🇷',
  NL: '🇳🇱',
  IE: '🇮🇪',
  SE: '🇸🇪',
  FI: '🇫🇮',
  EE: '🇪🇪',
  CH: '🇨🇭',
  PL: '🇵🇱',
  LV: '🇱🇻',
  LT: '🇱🇹',
  AE: '🇦🇪',
  SA: '🇸🇦',
  QA: '🇶🇦',
  EG: '🇪🇬',
  AU: '🇦🇺',
  IN: '🇮🇳',
  JP: '🇯🇵',
  SG: '🇸🇬',
  HK: '🇭🇰',
  ZA: '🇿🇦',
  NG: '🇳🇬',
  KE: '🇰🇪',
};

export const COUNTRY_NAME_MAP: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  BR: 'Brazil',
  MX: 'Mexico',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  NL: 'Netherlands',
  IE: 'Ireland',
  SE: 'Sweden',
  FI: 'Finland',
  EE: 'Estonia',
  CH: 'Switzerland',
  PL: 'Poland',
  LV: 'Latvia',
  LT: 'Lithuania',
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  QA: 'Qatar',
  EG: 'Egypt',
  AU: 'Australia',
  IN: 'India',
  JP: 'Japan',
  SG: 'Singapore',
  HK: 'Hong Kong',
  ZA: 'South Africa',
  NG: 'Nigeria',
  KE: 'Kenya',
};

/**
 * Returns flag emoji for a given ISO country code (2 letter)
 */
export function getCountryFlag(countryCode?: string | null): string {
  if (!countryCode) return '🌐';
  const upper = countryCode.toUpperCase();
  return COUNTRY_FLAG_MAP[upper] || '🌐';
}

/**
 * Returns full country name for a given ISO country code
 */
export function getCountryName(countryCode?: string | null): string {
  if (!countryCode) return 'Global';
  const upper = countryCode.toUpperCase();
  return COUNTRY_NAME_MAP[upper] || upper;
}
