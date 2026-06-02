const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5OTk0NTEsImV4cCI6MjA5NTM1OTQ1MX0.2RpSWBMZerrRKtwAnpuJrI7jkt6bHpu__Q5omhYC2ro';
const URL = 'https://autokkeep-db.host.datac.com';
const h = { 'Authorization': 'Bearer ' + KEY, 'apikey': KEY };
const dh = { ...h, 'Prefer': 'return=minimal' };

async function main() {
  // 1. Clean DB first (entities reference orgs, team_members reference orgs+users)
  console.log('1. Cleaning entities...');
  let r = await fetch(`${URL}/rest/v1/entities?id=neq.00000000-0000-0000-0000-000000000000`, { method:'DELETE', headers:dh });
  console.log('   Status:', r.status);
  
  console.log('2. Cleaning team_members...');
  r = await fetch(`${URL}/rest/v1/team_members?id=neq.00000000-0000-0000-0000-000000000000`, { method:'DELETE', headers:dh });
  console.log('   Status:', r.status);

  console.log('3. Cleaning organizations...');
  r = await fetch(`${URL}/rest/v1/organizations?id=neq.00000000-0000-0000-0000-000000000000`, { method:'DELETE', headers:dh });
  console.log('   Status:', r.status);

  // 2. Delete all auth users
  console.log('4. Deleting auth users...');
  const lr = await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=50`, { headers: h });
  const d = await lr.json();
  for (const u of (d.users || [])) {
    const dr = await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method:'DELETE', headers: h });
    console.log(`   Deleted ${u.email}: ${dr.status}`);
  }

  // 3. Create pre-confirmed user WITHOUT org (to test redirect)
  console.log('\n5. Creating pre-confirmed user (NO org)...');
  const cr = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'h.khalid@datac.com',
      password: 'DataC_Autokkeep2026!',
      email_confirm: true,
      user_metadata: { org_name: 'DATA C' },
    }),
  });
  const cd = await cr.json();
  console.log('   Status:', cr.status);
  console.log('   ID:', cd.id);
  console.log('   Email confirmed:', !!cd.email_confirmed_at);

  // 4. Verify: no org/entity/team_member for this user
  const orgs = await fetch(`${URL}/rest/v1/organizations?select=id`, { headers: h });
  const ents = await fetch(`${URL}/rest/v1/entities?select=id`, { headers: h });
  const tms = await fetch(`${URL}/rest/v1/team_members?select=id`, { headers: h });
  console.log('\n✅ Verification:');
  console.log('   Orgs:', (await orgs.json()).length);
  console.log('   Entities:', (await ents.json()).length);
  console.log('   Team members:', (await tms.json()).length);
  console.log('   User has NO org — should redirect to /onboarding');
}
main().catch(e => console.error(e));
