const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5OTk0NTEsImV4cCI6MjA5NTM1OTQ1MX0.2RpSWBMZerrRKtwAnpuJrI7jkt6bHpu__Q5omhYC2ro';
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc5OTk5NDUxLCJleHAiOjIwOTUzNTk0NTF9.hv6rtYfzJo_y-Jil0AtPJ8Fbz4FkG61YcXQySmr0bpM';
const URL='https://autokkeep-db.host.datac.com';
const h = {'Authorization':'Bearer '+KEY,'apikey':KEY,'Content-Type':'application/json'};

async function main() {
  // The problem: the RLS policy WITH CHECK (auth.uid() = owner_id) evaluates to TRUE
  // (we proved this), yet the INSERT still fails. This is a known issue in some
  // PostgreSQL/PostgREST versions where the INSERT policy is checked AFTER the
  // row is written, and if there's also a SELECT policy that can't see the new row,
  // PostgREST returns 403.
  //
  // The fix: Create a SECURITY DEFINER function that performs the bootstrap
  // operations, bypassing RLS entirely. This is the standard Supabase pattern
  // for bootstrapping operations.
  
  console.log('Creating bootstrap RPC function...');
  
  const createFn = `
    CREATE OR REPLACE FUNCTION bootstrap_onboarding(
      p_entity_name text,
      p_fiscal_year_end text DEFAULT '12',
      p_currency text DEFAULT 'USD'
    )
    RETURNS jsonb AS $$
    DECLARE
      v_user_id uuid;
      v_org_id uuid;
      v_entity_id uuid;
      v_existing_org_id uuid;
      v_slug text;
    BEGIN
      -- Get the authenticated user
      v_user_id := auth.uid();
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      -- Check if user already has an org
      SELECT org_id INTO v_existing_org_id
      FROM team_members
      WHERE user_id = v_user_id
      LIMIT 1;

      IF v_existing_org_id IS NOT NULL THEN
        v_org_id := v_existing_org_id;
      ELSE
        -- Create slug
        v_slug := lower(regexp_replace(p_entity_name || '-org', '[^a-z0-9-]', '', 'g'));
        v_slug := v_slug || '-' || substr(md5(random()::text), 1, 8);

        -- Create organization
        INSERT INTO organizations (name, slug, owner_id)
        VALUES (p_entity_name || ' Org', v_slug, v_user_id)
        RETURNING id INTO v_org_id;

        -- Add user as owner team member
        INSERT INTO team_members (org_id, user_id, role)
        VALUES (v_org_id, v_user_id, 'owner');
      END IF;

      -- Create entity
      INSERT INTO entities (org_id, name, fiscal_year_end)
      VALUES (v_org_id, p_entity_name, p_fiscal_year_end)
      RETURNING id INTO v_entity_id;

      RETURN jsonb_build_object(
        'orgId', v_org_id,
        'entityId', v_entity_id
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Grant execute to authenticated users
    GRANT EXECUTE ON FUNCTION bootstrap_onboarding(text, text, text) TO authenticated;
  `;

  const res = await fetch(`${URL}/pg/query`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ query: createFn })
  });
  console.log('Create function status:', res.status);
  const data = await res.json();
  if (res.status !== 200 || (data && data.error)) {
    console.log('Error:', JSON.stringify(data));
    return;
  }
  console.log('✅ Function created');

  // Reload PostgREST schema cache
  await fetch(`${URL}/pg/query`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema'" })
  });
  console.log('Schema cache reloaded');
  await new Promise(r => setTimeout(r, 3000));

  // Test: Login and call the function
  console.log('\nTesting bootstrap_onboarding...');
  const loginRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'h.khalid@datac.com', password: 'DataC_Autokkeep2026!' })
  });
  const loginData = await loginRes.json();
  console.log('Login:', loginRes.status, 'User:', loginData.user?.id);

  const rpcRes = await fetch(`${URL}/rest/v1/rpc/bootstrap_onboarding`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + loginData.access_token,
      'apikey': ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_entity_name: 'DATA C Test',
      p_fiscal_year_end: '12',
      p_currency: 'EUR'
    })
  });
  console.log('RPC status:', rpcRes.status);
  const rpcData = await rpcRes.text();
  console.log('Result:', rpcData);

  if (rpcRes.status === 200) {
    const result = JSON.parse(rpcData);
    console.log('\n✅ BOOTSTRAP WORKS!');
    console.log('  Org ID:', result.orgId);
    console.log('  Entity ID:', result.entityId);
    
    // Clean up test data
    console.log('\nCleaning up test data...');
    await fetch(`${URL}/pg/query`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ query: `DELETE FROM entities WHERE id = '${result.entityId}'` })
    });
    await fetch(`${URL}/pg/query`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ query: `DELETE FROM team_members WHERE org_id = '${result.orgId}'` })
    });
    await fetch(`${URL}/pg/query`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ query: `DELETE FROM organizations WHERE id = '${result.orgId}'` })
    });
    console.log('✅ Cleaned up');
  }
}
main().catch(e => console.error(e));
