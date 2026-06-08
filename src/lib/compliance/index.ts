// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin System — Registration & Barrel Export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { registerPlugin } from './engine';
import { unitedStatesPlugin } from './regions/united-states';
import { unitedKingdomPlugin } from './regions/united-kingdom';
import { germanyPlugin } from './regions/germany';
import { europeanUnionPlugin } from './regions/european-union';
import { estoniaPlugin } from './regions/estonia';
import { canadaPlugin } from './regions/canada';
import { australiaPlugin } from './regions/australia';
import { indiaPlugin } from './regions/india';
import { japanPlugin } from './regions/japan';
import { singaporePlugin } from './regions/singapore';
import { hongKongPlugin } from './regions/hong-kong';
import { switzerlandPlugin } from './regions/switzerland';
import { uaePlugin } from './regions/uae';
import { saudiArabiaPlugin } from './regions/saudi-arabia';
import { qatarPlugin } from './regions/qatar';
import { egyptPlugin } from './regions/egypt';
import { brazilPlugin } from './regions/brazil';
import { mexicoPlugin } from './regions/mexico';
import { southAfricaPlugin } from './regions/south-africa';
import { nigeriaPlugin } from './regions/nigeria';
import { kenyaPlugin } from './regions/kenya';

// Register all 21 region plugins on module load
registerPlugin(unitedStatesPlugin);
registerPlugin(unitedKingdomPlugin);
registerPlugin(germanyPlugin);
registerPlugin(europeanUnionPlugin);
registerPlugin(estoniaPlugin);
registerPlugin(canadaPlugin);
registerPlugin(australiaPlugin);
registerPlugin(indiaPlugin);
registerPlugin(japanPlugin);
registerPlugin(singaporePlugin);
registerPlugin(hongKongPlugin);
registerPlugin(switzerlandPlugin);
registerPlugin(uaePlugin);
registerPlugin(saudiArabiaPlugin);
registerPlugin(qatarPlugin);
registerPlugin(egyptPlugin);
registerPlugin(brazilPlugin);
registerPlugin(mexicoPlugin);
registerPlugin(southAfricaPlugin);
registerPlugin(nigeriaPlugin);
registerPlugin(kenyaPlugin);

// Re-export everything
export * from './types';
export * from './engine';
