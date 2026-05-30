# Autokkeep — Incident Response Runbook

## Severity Levels

| Level | Definition | Response Time | Examples |
|-------|-----------|---------------|----------|
| SEV-1 (Critical) | Service is completely down or data loss | 15 minutes | Database down, authentication broken, data corruption |
| SEV-2 (Major) | Core feature degraded | 1 hour | AI categorization failing, Plaid sync broken, billing errors |
| SEV-3 (Minor) | Non-critical feature impacted | 4 hours | Email notifications failing, analytics not loading |
| SEV-4 (Low) | Cosmetic or minor UX issue | Next business day | Styling bugs, typos, non-blocking UI issues |

## Incident Response Checklist

### 1. Detect & Assess
- [ ] Verify the issue is real (not a false alarm)
- [ ] Determine severity level
- [ ] Create an incident log (date, time, reporter, description)
- [ ] Notify stakeholders based on severity

### 2. Mitigate
- [ ] Apply temporary fix if possible
- [ ] If service is down: check EasyPanel dashboard, container logs, health endpoint
- [ ] If database issue: check Supabase Dashboard → Logs
- [ ] If API errors: check application logs in EasyPanel

### 3. Resolve
- [ ] Identify root cause
- [ ] Apply permanent fix
- [ ] Deploy fix (auto-deploy via EasyPanel GitHub integration)
- [ ] Verify fix in production

### 4. Post-Mortem
- [ ] Document: What happened, why, how it was resolved
- [ ] Action items: What will prevent this from happening again?
- [ ] Update monitoring/alerting if gaps were found

## Common Issues & Quick Fixes

### Database Connection Timeout
**Symptom**: 500 errors on API routes, "connection pool exhausted"
**Fix**: 
1. Check Supabase Dashboard → Database → Connections
2. If at limit: restart the app container in EasyPanel
3. Long-term: Check for connection leaks in API routes

### AI Categorization Failing
**Symptom**: Transactions stuck in 'pending', OpenAI errors in logs
**Fix**:
1. Check OpenAI API status: status.openai.com
2. Verify OPENAI_API_KEY is valid
3. Check usage limits on platform.openai.com
4. Transactions will auto-retry on next cron cycle

### Plaid Sync Not Running
**Symptom**: No new transactions appearing
**Fix**:
1. Manually trigger: `curl -X POST https://autokkeep.com/api/cron/plaid-sync -H "Authorization: Bearer $CRON_SECRET"`
2. Check bank_connections status in Supabase
3. Check Plaid Dashboard for item errors
4. If Plaid webhook failing: verify webhook URL matches production domain

### High Memory / OOM
**Symptom**: Container restarts, slow responses
**Fix**:
1. Check EasyPanel → Container metrics
2. If batch AI processing is running: reduce CONCURRENCY_LIMIT
3. Increase container memory limit in EasyPanel

### Stripe Webhooks Failing
**Symptom**: Subscriptions not updating after payment
**Fix**:
1. Check Stripe Dashboard → Developers → Webhooks → Recent events
2. Verify STRIPE_WEBHOOK_SECRET matches
3. Manually resend failed webhook events from Stripe dashboard

### Email Notifications Not Sending
**Symptom**: Weekly digest not received, no high-risk alerts
**Fix**:
1. Check Resend dashboard → Logs
2. Verify RESEND_API_KEY and RESEND_FROM_EMAIL in env
3. Check that domain is verified in Resend
4. Check cron job is running (weekly-digest schedule: Monday 8am UTC)

### Rate Limiting Not Working
**Symptom**: No rate limit responses, unlimited API calls
**Fix**:
1. Check REDIS_URL environment variable
2. Verify Redis container is running in EasyPanel
3. If Redis is down: rate limiting gracefully degrades (no blocking)
4. Test: `curl -v https://autokkeep.com/api/health` should return X-RateLimit headers

## Health Checks

- **Application**: `GET /api/health` (authenticated with CRON_SECRET for full details)
- **Supabase**: Check Supabase Dashboard → Health
- **Redis**: EasyPanel → Redis service status
- **Plaid**: `GET /api/health` includes Plaid connectivity check

## Escalation Path

1. On-call engineer (check logs, attempt fix)
2. Tech lead (architecture decisions, rollback approval)
3. CEO/Founder (customer communication, business impact decisions)

## Rollback Procedure

1. Go to EasyPanel → App → Deployments
2. Click on the previous successful deployment
3. Click "Rollback" or redeploy with the previous commit SHA
4. Or via git: `git revert HEAD && git push origin main`
