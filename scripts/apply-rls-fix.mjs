const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5OTk0NTEsImV4cCI6MjA5NTM1OTQ1MX0.2RpSWBMZerrRKtwAnpuJrI7jkt6bHpu__Q5omhYC2ro';
const URL = 'https://autokkeep-db.host.datac.com';
const h = { 'Authorization': 'Bearer ' + KEY, 'apikey': KEY, 'Content-Type': 'application/json' };

// The SQL to apply the RLS fix
const sql = `
-- 1. Allow authenticated users to create a new organization (they must be the owner)
DROP POLICY IF EXISTS "organizations_insert" ON organizations;
CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (
    auth.uid() = owner_id
  );

-- 2. Allow authenticated users to add THEMSELVES as the first team member of an org they own.
-- First drop the existing insert policy that is too restrictive for bootstrapping.
DROP POLICY IF EXISTS "team_members_insert" ON team_members;
DROP POLICY IF EXISTS "team_members_self_insert" ON team_members;
CREATE POLICY "team_members_insert" ON team_members
  FOR INSERT WITH CHECK (
    -- Either they're already a member of the org (normal case)
    (org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid()))
    OR
    -- OR they are the owner of the org and are inserting themselves (bootstrap case)
    (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM organizations WHERE id = org_id AND owner_id = auth.uid()
      )
    )
  );
`;

async function main() {
  // Try using the pg-meta REST endpoint for SQL execution
  // Supabase self-hosted typically has this at /pg/ or we can use rpc
  
  // Method 1: Try rpc with a custom function
  console.log('Attempting to execute SQL via creating a helper RPC...');
  
  // Create a temporary function that applies the migration
  const _createFnSql = `
    CREATE OR REPLACE FUNCTION apply_onboarding_rls_fix()
    RETURNS void AS $$
    BEGIN
      -- 1. Add INSERT policy for organizations
      DROP POLICY IF EXISTS "organizations_insert" ON organizations;
      EXECUTE 'CREATE POLICY "organizations_insert" ON organizations FOR INSERT WITH CHECK (auth.uid() = owner_id)';
      
      -- 2. Replace team_members INSERT policy for bootstrapping
      DROP POLICY IF EXISTS "team_members_insert" ON team_members;
      DROP POLICY IF EXISTS "team_members_self_insert" ON team_members;
      EXECUTE 'CREATE POLICY "team_members_insert" ON team_members FOR INSERT WITH CHECK (
        (org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid()))
        OR
        (user_id = auth.uid() AND EXISTS (SELECT 1 FROM organizations WHERE id = org_id AND owner_id = auth.uid()))
      )';
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;
  
  // Create the function
  const createRes = await fetch(`${URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: h,
  });
  console.log('RPC endpoint status:', createRes.status);
  
  // Try the SQL execution through pg endpoint (self-hosted Supabase)
  console.log('\nTrying /pg/ endpoint...');
  const pgRes = await fetch(`${URL}/pg/query`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ query: sql }),
  });
  console.log('PG query status:', pgRes.status);
  if (pgRes.ok) {
    const data = await pgRes.json();
    console.log('Result:', JSON.stringify(data, null, 2));
  } else {
    const text = await pgRes.text();
    console.log('Response:', text.slice(0, 500));
  }
  
  // Try the /sql endpoint
  console.log('\nTrying /sql endpoint...');
  const sqlRes = await fetch(`${URL}/sql`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ query: sql }),
  });
  console.log('SQL endpoint status:', sqlRes.status);
  if (sqlRes.ok) {
    const data = await sqlRes.json();
    console.log('Result:', JSON.stringify(data, null, 2));
  } else {
    const text = await sqlRes.text();
    console.log('Response:', text.slice(0, 500));
  }
  
  // Try /rest/v1/rpc endpoint to create the function
  console.log('\nTrying to create RPC function via direct REST...');
  const rpcRes = await fetch(`${URL}/rest/v1/rpc/apply_onboarding_rls_fix`, {
    method: 'POST',
    headers: h,
    body: '{}',
  });
  console.log('RPC call status:', rpcRes.status);
  const rpcText = await rpcRes.text();
  console.log('RPC response:', rpcText.slice(0, 500));
}

main().catch(e => console.error(e));
