// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin Engine — Registry & Runner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {
  CompliancePlugin,
  ComplianceRegion,
  ComplianceCheckResult,
  TransactionForCompliance,
  EntityComplianceConfig,
} from './types';

const pluginRegistry = new Map<ComplianceRegion, CompliancePlugin>();

export function registerPlugin(plugin: CompliancePlugin): void {
  pluginRegistry.set(plugin.region, plugin);
}

export function getPlugin(region: ComplianceRegion): CompliancePlugin | undefined {
  return pluginRegistry.get(region);
}

export function getAvailableRegions(): ComplianceRegion[] {
  return Array.from(pluginRegistry.keys());
}

export function runComplianceCheck(
  region: ComplianceRegion,
  transactions: TransactionForCompliance[],
  config: EntityComplianceConfig
): ComplianceCheckResult {
  const plugin = pluginRegistry.get(region);
  if (!plugin) {
    throw new Error(`No compliance plugin registered for region: ${region}`);
  }
  return plugin.check(transactions, config);
}
