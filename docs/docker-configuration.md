# Docker Update Management Configuration

This document outlines the environment variables and configuration options for the Docker Update Management system.

## Environment Variables

### Core Configuration

```bash
# Enable/disable Docker automatic updates globally
DOCKER_AUTO_UPDATES_ENABLED=true

# Default schedule for automatic updates (cron format)
DOCKER_UPDATE_SCHEDULE="0 2 * * 0"  # Sunday at 2 AM

# Maintenance window (hours in UTC when updates are allowed)
DOCKER_MAINTENANCE_WINDOW_START=2    # 2 AM UTC
DOCKER_MAINTENANCE_WINDOW_END=6      # 6 AM UTC

# Enable cleanup of old Docker images after updates
DOCKER_CLEANUP_OLD_IMAGES=true

# Internal API key for scheduled update endpoint
DOCKER_UPDATE_INTERNAL_API_KEY=your-secure-random-key-here

# Rollback timeout in minutes (how long to wait before auto-rollback on failure)
DOCKER_ROLLBACK_TIMEOUT=10
```

### Portainer Integration

```bash
# Portainer endpoint configuration (required for Docker operations)
PORTAINER_URL=http://localhost:9000
PORTAINER_USERNAME=admin
PORTAINER_PASSWORD=your-portainer-password

# Default Portainer endpoint ID for Docker operations
PORTAINER_ENDPOINT_ID=2
```

### Update Behavior Configuration

```bash
# Maximum number of concurrent server updates
DOCKER_MAX_CONCURRENT_UPDATES=3

# Timeout for individual container updates (in minutes)
DOCKER_UPDATE_TIMEOUT=15

# Retry attempts for failed updates
DOCKER_UPDATE_RETRY_ATTEMPTS=2

# Wait time between retry attempts (in seconds)
DOCKER_UPDATE_RETRY_DELAY=30

# Health check timeout after update (in seconds)
DOCKER_HEALTH_CHECK_TIMEOUT=120
```

### Notification Settings

```bash
# Enable notifications for update results
DOCKER_UPDATE_NOTIFICATIONS=true

# Admin email for update notifications
ADMIN_EMAIL=admin@yourminecraftserver.com

# Webhook URL for update notifications (optional)
DOCKER_UPDATE_WEBHOOK_URL=https://your-webhook-url.com/notifications
```

## Cron Job Setup

To enable scheduled Docker updates, set up a cron job that calls the scheduled update endpoint:

### Using cron (Linux/macOS)

1. Open crontab editor:
```bash
crontab -e
```

2. Add the following line (adjust the schedule as needed):
```bash
# Run Docker updates every Sunday at 2 AM
0 2 * * 0 curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer YOUR_INTERNAL_API_KEY" http://localhost:3000/api/admin/docker-updates/scheduled
```

### Using Windows Task Scheduler

1. Open Task Scheduler
2. Create a new Basic Task
3. Set the trigger to your desired schedule
4. Set the action to run a PowerShell script:

```powershell
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer YOUR_INTERNAL_API_KEY"
}

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/docker-updates/scheduled" -Method POST -Headers $headers
    Write-Output "Docker update completed: $($response.message)"
} catch {
    Write-Error "Docker update failed: $($_.Exception.Message)"
}
```

### Using Docker (if your app runs in Docker)

Add a sidecar container with cron:

```yaml
# docker-compose.yml
services:
  minecraft-server-creator:
    # ... your existing service config
    
  cron-scheduler:
    image: alpine:latest
    command: >
      sh -c "
        echo '0 2 * * 0 wget --post-data='' --header=\"Authorization: Bearer ${DOCKER_UPDATE_INTERNAL_API_KEY}\" --header=\"Content-Type: application/json\" -O- http://minecraft-server-creator:3000/api/admin/docker-updates/scheduled || echo \"Update failed\"' > /var/spool/cron/crontabs/root &&
        crond -f
      "
    environment:
      - DOCKER_UPDATE_INTERNAL_API_KEY=${DOCKER_UPDATE_INTERNAL_API_KEY}
    depends_on:
      - minecraft-server-creator
```

## Configuration Management

### Runtime Configuration

The Docker Update Manager supports runtime configuration changes through the admin interface. Changes made through the UI will override environment variables for:

- Auto-updates enabled/disabled
- Update schedule
- Maintenance window
- Cleanup settings

### Database Storage

Configuration changes are stored in the MongoDB database in the `docker_update_config` collection:

```javascript
{
  _id: "docker_update_config",
  autoUpdatesEnabled: true,
  updateSchedule: "0 2 * * 0",
  maintenanceWindowStart: 2,
  maintenanceWindowEnd: 6,
  cleanupOldImages: true,
  maxConcurrentUpdates: 3,
  updateTimeout: 15,
  retryAttempts: 2,
  updatedAt: new Date(),
  updatedBy: "admin@example.com"
}
```

## Security Considerations

### API Key Management

- Generate a strong, random API key for `DOCKER_UPDATE_INTERNAL_API_KEY`
- Store the key securely (use Docker secrets, environment files with restricted permissions, etc.)
- Rotate the key regularly
- Never commit the key to version control

### Network Security

- Ensure the scheduled update endpoint is only accessible from trusted sources
- Consider using HTTPS for all API communications
- Implement rate limiting on the update endpoints

### Portainer Security

- Use strong credentials for Portainer access
- Limit Portainer user permissions to only what's required
- Consider using Portainer's API tokens instead of username/password

## Monitoring and Logging

### Update Logs

Docker update operations are logged to:
- Application logs (console output)
- Database (`docker_update_logs` collection)
- Individual server operation logs

### Health Checks

Monitor the following endpoints for system health:
- `GET /api/admin/docker-updates` - Current update status
- `GET /api/admin/servers` - Server status overview

### Metrics to Track

- Update success/failure rates
- Update duration
- Number of containers updated
- Rollback frequency
- System resource usage during updates

## Troubleshooting

### Common Issues

1. **Updates not running automatically**
   - Check cron job is configured correctly
   - Verify `DOCKER_UPDATE_INTERNAL_API_KEY` is set
   - Check maintenance window settings
   - Review application logs for errors

2. **Update failures**
   - Verify Portainer connection
   - Check Docker image availability
   - Review container resource limits
   - Check network connectivity

3. **Rollback issues**
   - Ensure previous image versions are available
   - Check container configuration compatibility
   - Verify sufficient disk space

### Debug Mode

Enable debug logging by setting:
```bash
LOG_LEVEL=debug
DOCKER_UPDATE_DEBUG=true
```

This will provide detailed logging for troubleshooting update operations.

## Best Practices

1. **Test in staging first** - Always test update procedures in a staging environment
2. **Backup before updates** - Ensure server data is backed up before major updates
3. **Monitor resource usage** - Track CPU, memory, and disk usage during updates
4. **Set appropriate maintenance windows** - Choose low-traffic periods for updates
5. **Implement gradual rollouts** - Update servers in batches to minimize risk
6. **Monitor after updates** - Check server health and performance after updates complete

## Example Configuration File

Create a `.env.docker-updates` file:

```bash
# Docker Update Management Configuration
DOCKER_AUTO_UPDATES_ENABLED=true
DOCKER_UPDATE_SCHEDULE="0 2 * * 0"
DOCKER_MAINTENANCE_WINDOW_START=2
DOCKER_MAINTENANCE_WINDOW_END=6
DOCKER_CLEANUP_OLD_IMAGES=true
DOCKER_UPDATE_INTERNAL_API_KEY=secure-random-key-change-this
DOCKER_MAX_CONCURRENT_UPDATES=3
DOCKER_UPDATE_TIMEOUT=15
DOCKER_UPDATE_RETRY_ATTEMPTS=2
DOCKER_UPDATE_RETRY_DELAY=30
DOCKER_HEALTH_CHECK_TIMEOUT=120
DOCKER_UPDATE_NOTIFICATIONS=true
ADMIN_EMAIL=admin@yourdomain.com
```

Load this file in your Docker Compose or deployment configuration.