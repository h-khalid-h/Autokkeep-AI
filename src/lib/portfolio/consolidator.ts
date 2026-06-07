// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Consolidated Portfolio View
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Aggregates financial data across all entities in an organization,
// converts values to a common display currency, and computes portfolio totals.

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';
import { fxRateProvider, type FXRateProvider } from '@/lib/currency/fx-rates';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConsolidatedEntity {
  entityId: string;
  entityName: string;
  baseCurrency: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  convertedNetWorth: number;
  fxRate: number;
}

export interface ConsolidatedPortfolio {
  displayCurrency: string;
  asOfDate: string;
  generatedAt: string;
  entities: ConsolidatedEntity[];
  totalConvertedAssets: number;
  totalConvertedLiabilities: number;
  totalConvertedNetWorth: number;
}

// ── Consolidator ─────────────────────────────────────────────────────────────

export interface PortfolioConsolidatorOptions {
  db: SupabaseQueryClient;
  fxProvider?: FXRateProvider;
}

/**
 * Builds a consolidated portfolio view across all entities in an org.
 *
 * 1. Fetch all entities for the org
 * 2. For each entity, compute total assets and liabilities from
 *    approved/synced transactions up to asOfDate
 * 3. Convert each entity's values to the display currency
 * 4. Sum all converted values for portfolio totals
 */
export async function buildConsolidatedPortfolio(
  orgId: string,
  displayCurrency: string,
  asOfDate: string,
  options: PortfolioConsolidatorOptions
): Promise<ConsolidatedPortfolio> {
  const { db, fxProvider = fxRateProvider } = options;
  const generatedAt = new Date().toISOString();

  // 1. Fetch all entities for the org
  const { data: entities, error: entitiesError } = await db
    .from('entities')
    .select('id, name, base_currency')
    .eq('org_id', orgId);

  if (entitiesError) {
    throw new Error(`Failed to fetch entities: ${entitiesError.message}`);
  }

  if (!entities || entities.length === 0) {
    return {
      displayCurrency,
      asOfDate,
      generatedAt,
      entities: [],
      totalConvertedAssets: 0,
      totalConvertedLiabilities: 0,
      totalConvertedNetWorth: 0,
    };
  }

  // 2. For each entity, compute assets and liabilities
  const consolidatedEntities: ConsolidatedEntity[] = [];

  for (const entity of entities) {
    // Query approved/synced transactions up to asOfDate
    const { data: transactions } = await db
      .from('transactions')
      .select('amount')
      .eq('entity_id', entity.id)
      .in('status', [TRANSACTION_STATUS.APPROVED, TRANSACTION_STATUS.SYNCED])
      .is('deleted_at', null)
      .lte('date', asOfDate);

    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const txn of transactions || []) {
      const amount = Number(txn.amount) || 0;
      if (amount >= 0) {
        totalAssets += amount;
      } else {
        totalLiabilities += Math.abs(amount);
      }
    }

    const netWorth = totalAssets - totalLiabilities;

    // 3. Convert to display currency
    const entityCurrency = (entity.base_currency || 'USD').toUpperCase();
    const targetCurrency = displayCurrency.toUpperCase();

    let fxRate = 1.0;
    if (entityCurrency !== targetCurrency) {
      const rateResult = await fxProvider.getRate(entityCurrency, targetCurrency);
      fxRate = rateResult.rate;
    }

    const convertedNetWorth = Math.round(netWorth * fxRate * 100) / 100;

    consolidatedEntities.push({
      entityId: entity.id,
      entityName: entity.name,
      baseCurrency: entityCurrency,
      totalAssets: Math.round(totalAssets * 100) / 100,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
      netWorth: Math.round(netWorth * 100) / 100,
      convertedNetWorth,
      fxRate,
    });
  }

  // 4. Sum all converted values for portfolio totals
  let totalConvertedAssets = 0;
  let totalConvertedLiabilities = 0;
  let totalConvertedNetWorth = 0;

  for (const ce of consolidatedEntities) {
    totalConvertedAssets += Math.round(ce.totalAssets * ce.fxRate * 100) / 100;
    totalConvertedLiabilities += Math.round(ce.totalLiabilities * ce.fxRate * 100) / 100;
    totalConvertedNetWorth += ce.convertedNetWorth;
  }

  return {
    displayCurrency,
    asOfDate,
    generatedAt,
    entities: consolidatedEntities,
    totalConvertedAssets: Math.round(totalConvertedAssets * 100) / 100,
    totalConvertedLiabilities: Math.round(totalConvertedLiabilities * 100) / 100,
    totalConvertedNetWorth: Math.round(totalConvertedNetWorth * 100) / 100,
  };
}
