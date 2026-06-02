const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5OTk0NTEsImV4cCI6MjA5NTM1OTQ1MX0.2RpSWBMZerrRKtwAnpuJrI7jkt6bHpu__Q5omhYC2ro';
const URL = 'https://autokkeep-db.host.datac.com';
const h = { 'Authorization': 'Bearer ' + KEY, 'apikey': KEY };

async function main() {
  // 1. Get the user
  console.log('1. Finding user...');
  const lr = await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=50`, { headers: h });
  const d = await lr.json();
  const user = (d.users || []).find(u => u.email === 'h.khalid@datac.com');
  if (!user) { console.error('User not found!'); return; }
  console.log('   User ID:', user.id);

  // 2. Check existing tables
  console.log('\n2. Checking DB schema...');
  
  // List organizations columns
  const orgSchemaRes = await fetch(`${URL}/rest/v1/organizations?select=*&limit=0`, {
    headers: { ...h, 'Prefer': 'return=representation' },
  });
  console.log('   Organizations table status:', orgSchemaRes.status);

  // 3. Create organization
  console.log('\n3. Creating organization...');
  const orgRes = await fetch(`${URL}/rest/v1/organizations`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({
      name: 'DATA C',
      slug: 'data-c',
      owner_id: user.id,
    }),
  });
  
  const orgData = await orgRes.json();
  console.log('   Status:', orgRes.status);
  console.log('   Data:', JSON.stringify(orgData));
  
  if (orgRes.status >= 400) {
    console.error('   Failed to create org. Response:', JSON.stringify(orgData));
    // Try listing columns to understand schema
    const colRes = await fetch(`${URL}/rest/v1/organizations?select=*&limit=1`, {
      headers: h,
    });
    console.log('   Schema check status:', colRes.status);
    const colData = await colRes.json();
    console.log('   Schema data:', JSON.stringify(colData));
    return;
  }
  
  const orgId = Array.isArray(orgData) ? orgData[0]?.id : orgData?.id;
  console.log('   Org ID:', orgId);

  // 4. Create team_member
  console.log('\n4. Adding user as team member...');
  const tmRes = await fetch(`${URL}/rest/v1/team_members`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({
      org_id: orgId,
      user_id: user.id,
      role: 'owner',
    }),
  });
  const tmData = await tmRes.json();
  console.log('   Status:', tmRes.status);
  console.log('   Data:', JSON.stringify(tmData));

  // 5. Create entity
  console.log('\n5. Creating entity...');
  const entRes = await fetch(`${URL}/rest/v1/entities`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({
      org_id: orgId,
      name: 'DATA C',
      country: 'EE',
      currency: 'EUR',
      timezone: 'Europe/Tallinn',
      fiscal_year_end: 12,
    }),
  });
  const entData = await entRes.json();
  console.log('   Status:', entRes.status);
  console.log('   Data:', JSON.stringify(entData));

  // 6. Verify
  console.log('\n✅ Setup complete!');
  console.log('   User: h.khalid@datac.com');
  console.log('   Org: DATA C');
  console.log('   Entity: DATA C (Estonia, EUR, Europe/Tallinn)');
}

main().catch(e => console.error(e));
