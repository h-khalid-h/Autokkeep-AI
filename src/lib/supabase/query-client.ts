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
 * This keeps the lint rule happy while still documenting where we
 * intentionally escape the strict schema types.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SupabaseQueryClient = {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
  rpc: (fn: string, params?: Record<string, unknown>) => any;
  auth: any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */
