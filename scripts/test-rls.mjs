const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5OTk0NTEsImV4cCI6MjA5NTM1OTQ1MX0.2RpSWBMZerrRKtwAnpuJrI7jkt6bHpu__Q5omhYC2ro';
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc5OTk5NDUxLCJleHAiOjIwOTUzNTk0NTF9.hv6rtYfzJo_y-Jil0AtPJ8Fbz4FkG61YcXQySmr0bpM';
const URL='https://autokkeep-db.host.datac.com';
const h = {'Authorization':'Bearer '+KEY,'apikey':KEY,'Content-Type':'application/json'};

async function main() {
  // Check the users table referenced by the FK
  const sql1 = `
    SELECT schemaname, tablename 
    FROM pg_tables 
    WHERE tablename = 'users';
  `;
  const r1 = await fetch(`${URL}/pg/query`, {method:'POST',headers:h,body:JSON.stringify({query:sql1})});
  console.log('Users tables:', JSON.stringify(await r1.json(), null, 2));
  
  // Check what the FK actually references
  const sql2 = `
    SELECT 
      tc.constraint_name,
      tc.table_schema || '.' || tc.table_name as from_table,
      kcu.column_name as from_column,
      ccu.table_schema || '.' || ccu.table_name as to_table,
      ccu.column_name as to_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'organizations';
  `;
  const r2 = await fetch(`${URL}/pg/query`, {method:'POST',headers:h,body:JSON.stringify({query:sql2})});
  console.log('\nFK details:', JSON.stringify(await r2.json(), null, 2));
  
  // Check if the user exists in the referenced users table
  const loginRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method:'POST',
    headers:{'apikey':ANON,'Content-Type':'application/json'},
    body:JSON.stringify({email:'h.khalid@datac.com',password:'DataC_Autokkeep2026!'})
  });
  const loginData = await loginRes.json();
  const userId = loginData.user.id;
  console.log('\nUser ID:', userId);
  
  // Check auth.users
  const sql3 = `SELECT id, email FROM auth.users WHERE id = '${userId}'`;
  const r3 = await fetch(`${URL}/pg/query`, {method:'POST',headers:h,body:JSON.stringify({query:sql3})});
  console.log('\nAuth users:', JSON.stringify(await r3.json(), null, 2));
  
  // Check public.users (if it exists)
  const sql4 = `SELECT id FROM public.users WHERE id = '${userId}'`;
  const r4 = await fetch(`${URL}/pg/query`, {method:'POST',headers:h,body:JSON.stringify({query:sql4})});
  console.log('\nPublic users:', JSON.stringify(await r4.json(), null, 2));
  
  // Also try disabling RLS temporarily and inserting
  console.log('\n=== Test: Direct insert bypassing RLS ===');
  const sql5 = `
    INSERT INTO organizations (name, slug, owner_id) 
    VALUES ('Direct Test', 'direct-test-${Date.now()}', '${userId}')
    RETURNING id, name, owner_id;
  `;
  const r5 = await fetch(`${URL}/pg/query`, {method:'POST',headers:h,body:JSON.stringify({query:sql5})});
  console.log('Direct SQL insert status:', r5.status);
  const d5 = await r5.json();
  console.log('Result:', JSON.stringify(d5, null, 2));
  
  // If it worked, try team_members and entity too
  if (d5?.[0]?.id) {
    const orgId = d5[0].id;
    console.log('\n✅ Direct SQL insert works! Org:', orgId);
    
    // Try team_members
    const sql6 = `
      INSERT INTO team_members (org_id, user_id, role) 
      VALUES ('${orgId}', '${userId}', 'owner')
      RETURNING id;
    `;
    const r6 = await fetch(`${URL}/pg/query`, {method:'POST',headers:h,body:JSON.stringify({query:sql6})});
    console.log('Team member:', JSON.stringify(await r6.json(), null, 2));
    
    // Try entity
    const sql7 = `
      INSERT INTO entities (org_id, name, fiscal_year_end) 
      VALUES ('${orgId}', 'DATA C', '12')
      RETURNING id;
    `;
    const r7 = await fetch(`${URL}/pg/query`, {method:'POST',headers:h,body:JSON.stringify({query:sql7})});
    console.log('Entity:', JSON.stringify(await r7.json(), null, 2));
    
    // Clean up
    await fetch(`${URL}/pg/query`, {method:'POST',headers:h,body:JSON.stringify({query:`DELETE FROM entities WHERE org_id = '${orgId}'`})});
    await fetch(`${URL}/pg/query`, {method:'POST',headers:h,body:JSON.stringify({query:`DELETE FROM team_members WHERE org_id = '${orgId}'`})});
    await fetch(`${URL}/pg/query`, {method:'POST',headers:h,body:JSON.stringify({query:`DELETE FROM organizations WHERE id = '${orgId}'`})});
    console.log('✅ Cleaned up');
  }
}
main().catch(e => console.error(e));
