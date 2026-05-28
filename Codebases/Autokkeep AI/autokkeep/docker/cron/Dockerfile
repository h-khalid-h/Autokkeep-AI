FROM alpine:3.20

RUN apk add --no-cache curl

COPY trigger.sh /usr/local/bin/trigger.sh
RUN chmod +x /usr/local/bin/trigger.sh

# Cron schedule:
#   - Plaid sync: every 4 hours
#   - Suspense timeout: daily at 6:00 AM UTC
RUN echo "0 */4 * * * /usr/local/bin/trigger.sh plaid-sync >> /var/log/cron.log 2>&1" > /etc/crontabs/root && \
    echo "0 6 * * * /usr/local/bin/trigger.sh suspense-timeout >> /var/log/cron.log 2>&1" >> /etc/crontabs/root

CMD ["crond", "-f", "-l", "2"]
