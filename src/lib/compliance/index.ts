// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin System — Registration & Barrel Export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { registerPlugin } from './engine';
import { estoniaPlugin } from './regions/estonia';
import { qatarPlugin } from './regions/qatar';
import { hongKongPlugin } from './regions/hong-kong';
import { japanPlugin } from './regions/japan';
import { indiaPlugin } from './regions/india';
import { unitedStatesPlugin } from './regions/united-states';

// Register all region plugins on module load
registerPlugin(estoniaPlugin);
registerPlugin(qatarPlugin);
registerPlugin(hongKongPlugin);
registerPlugin(japanPlugin);
registerPlugin(indiaPlugin);
registerPlugin(unitedStatesPlugin);

// Re-export everything
export * from './types';
export * from './engine';
