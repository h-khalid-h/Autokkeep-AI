const SVC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5OTk0NTEsImV4cCI6MjA5NTM1OTQ1MX0.2RpSWBMZerrRKtwAnpuJrI7jkt6bHpu__Q5omhYC2ro';
const URL = 'https://autokkeep-db.host.datac.com';
const h = { 'Authorization': 'Bearer ' + SVC_KEY, 'apikey': SVC_KEY, 'Content-Type': 'application/json' };

async function main() {
  // Get ALL details about the RLS policies including permissive/restrictive and roles
  const sql = `
    SELECT 
      polname as policy_name,
      CASE polcmd 
        WHEN '*' THEN 'ALL'
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
      END as command,
      CASE WHEN polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END as type,
      pg_get_expr(polqual, polrelid) as using_expr,
      pg_get_expr(polwithcheck, polrelid) as with_check_expr,
      ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(polroles)) as roles
    FROM pg_policy
    WHERE polrelid = 'organizations'::regclass
    ORDER BY polname;
  `;
  
  const res = await fetch(`${URL}/pg/query`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.json();
  console.log('Detailed policies on organizations:');
  console.log(JSON.stringify(data, null, 2));
  
  // Also check if there's an RLS FORCE setting
  const sql2 = `
    SELECT relname, relrowsecurity, relforcerowsecurity 
    FROM pg_class 
    WHERE relname = 'organizations';
  `;
  const res2 = await fetch(`${URL}/pg/query`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ query: sql2 }),
  });
  const data2 = await res2.json();
  console.log('\nTable RLS settings:');
  console.log(JSON.stringify(data2, null, 2));
}
main().catch(e => console.error(e));
