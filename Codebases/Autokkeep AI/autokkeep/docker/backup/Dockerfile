FROM alpine:3.20

RUN apk add --no-cache postgresql16-client gzip curl

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# Create backup directory
RUN mkdir -p /backups

# Setup cron: daily at 2:00 AM UTC
RUN echo "0 2 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root

CMD ["crond", "-f", "-l", "2"]
