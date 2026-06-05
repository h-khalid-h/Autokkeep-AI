/**
 * Untyped Supabase query helpers.
 *
 * The generated Database type only knows about columns declared in
 * `types.ts`.  When a route calls `.select('id, org_id')` the strict
 * PostgREST type parser sometimes narrows the result to `never`,
 * breaking downstream property access.
 *
 * Rather than scattering `as any` (which triggers
 * `@typescript-eslint/no-explicit-any`), we define a *single*
 * loosely-typed client alias and cast to it in API routes.
 *
 * The `no-explicit-any` rule is disabled for this file via
 * eslint.config.mjs — this is the ONLY file in the project
 * that intentionally uses `any` as a type-level escape hatch.
 */

// The `any` return types below are intentional: this file serves as the
// single escape hatch for dynamic Supabase query builder chains.
// eslint no-explicit-any is disabled at the config level for this file only.
export type SupabaseQueryClient = {
  from: (table: string) => any;       // eslint config override
  storage: { from: (bucket: string) => any };
  rpc: (fn: string, params?: Record<string, unknown>) => any;
  auth: any;
};
