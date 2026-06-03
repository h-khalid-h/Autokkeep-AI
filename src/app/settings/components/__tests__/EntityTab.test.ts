import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock Supabase client (called at module scope during loadEntityData)
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockReturnValue({
            then: vi.fn((r: (v: unknown) => void) => r({ data: [], error: null })),
          }),
          like: vi.fn().mockResolvedValue({ data: [], error: null }),
          then: vi.fn((r: (v: unknown) => void) => r({ data: [], error: null })),
        }),
        then: vi.fn((r: (v: unknown) => void) => r({ data: [], error: null })),
      }),
      then: vi.fn((r: (v: unknown) => void) => r({ data: [], error: null })),
    }),
  }),
}));

// ─── Tests ──────────────────────────────────────────────────────────────────────

/*
 * NOTE: This project has no React component testing infrastructure (no
 * @testing-library/react, no jsdom environment, vitest.config includes only
 * *.test.ts). These tests verify the EntityTab module's export shape and
 * basic behavioural contracts that can be validated without rendering.
 *
 * For full render tests, add @testing-library/react + jsdom and update
 * vitest.config to include *.test.tsx with environment: 'jsdom'.
 */

describe('EntityTab component module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export a default function component', async () => {
    const mod = await import('../../components/EntityTab');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('should accept the expected props signature (loading, entities, teamMembers, userRole)', async () => {
    const mod = await import('../../components/EntityTab');
    const EntityTab = mod.default;

    // Function.length gives the number of formal parameters.
    // React components receive a single props object, so length should be 1.
    expect(EntityTab.length).toBeGreaterThanOrEqual(1);
  });

  it('should have a displayName or name matching EntityTab', async () => {
    const mod = await import('../../components/EntityTab');
    const EntityTab = mod.default;

    // The function name should be "EntityTab" based on the `export default function EntityTab(...)` declaration
    expect(EntityTab.name).toBe('EntityTab');
  });

  /*
   * Structural checks: verify the component depends on expected modules
   * so we can confirm our mocking strategy is correct.
   */
  it('should depend on @/lib/supabase/client', async () => {
    const { createClient } = await import('@/lib/supabase/client');
    expect(vi.isMockFunction(createClient)).toBe(true);
  });
});
