FROM alpine:3.20

RUN apk add --no-cache curl

COPY trigger.sh /usr/local/bin/trigger.sh
RUN chmod +x /usr/local/bin/trigger.sh

# ─────────────────────────────────────────────────────────
# Cron schedule (7 jobs — matches DEPLOY.md §Cron Jobs)
# ─────────────────────────────────────────────────────────
#   1. Auto-categorize:  every 15 min
#   2. Ledger sync:      every 30 min
#   3. Plaid sync:       every 4 hours
#   4. Suspense timeout: every 4 hours (offset 30 min)
#   5. Token refresh:    every 6 hours
#   6. Receipt chase:    weekdays 10:00 AM UTC
#   7. Weekly digest:    Fridays 4:00 PM UTC
# ─────────────────────────────────────────────────────────
RUN echo "*/15 * * * * /usr/local/bin/trigger.sh auto-categorize >> /var/log/cron.log 2>&1" > /etc/crontabs/root && \
    echo "*/30 * * * * /usr/local/bin/trigger.sh ledger-sync >> /var/log/cron.log 2>&1" >> /etc/crontabs/root && \
    echo "0 */4 * * * /usr/local/bin/trigger.sh plaid-sync >> /var/log/cron.log 2>&1" >> /etc/crontabs/root && \
    echo "30 */4 * * * /usr/local/bin/trigger.sh suspense-timeout >> /var/log/cron.log 2>&1" >> /etc/crontabs/root && \
    echo "0 */6 * * * /usr/local/bin/trigger.sh token-refresh >> /var/log/cron.log 2>&1" >> /etc/crontabs/root && \
    echo "0 10 * * 1-5 /usr/local/bin/trigger.sh receipt-chase >> /var/log/cron.log 2>&1" >> /etc/crontabs/root && \
    echo "0 16 * * 5 /usr/local/bin/trigger.sh weekly-digest >> /var/log/cron.log 2>&1" >> /etc/crontabs/root

CMD ["crond", "-f", "-l", "2"]
