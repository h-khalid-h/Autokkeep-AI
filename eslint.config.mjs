import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated output:
    "coverage/**",
  ]),
  {
    rules: {
      // Allow unused vars with _ prefix (standard TypeScript pattern)
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  // Single escape-hatch file for dynamic Supabase query builder chains.
  // All other files MUST use proper types — only this file is allowed to use `any`.
  {
    files: ["src/lib/supabase/query-client.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Complex data-fetching pages with many useCallback/useMemo hooks that the
  // React Compiler cannot auto-optimize. These are opted out via 'use no memo'.
  {
    files: [
      "src/app/transactions/page.tsx",
      "src/app/vendors/page.tsx",
    ],
    rules: {
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
]);

export default eslintConfig;
