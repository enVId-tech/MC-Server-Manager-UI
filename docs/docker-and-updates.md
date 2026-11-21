# Docker, Portainer and updates

## Docker first, Portainer as the backup

The manager talks to Docker directly through its socket whenever it can, and uses Portainer when it cannot. This is much faster for containers, images, networks, logs and console commands.

| Goes through the Docker socket | Goes through Portainer |
| --- | --- |
| Containers, images, networks, logs, exec (commands) | Stacks, Portainer environments that are a different Docker host, private-registry pulls, stream responses, and any call that cannot reach the socket |

To switch the Docker-first path on, mount `/var/run/docker.sock` into the app container. Then:

| Variable | Meaning |
| --- | --- |
| `DOCKER_DIRECT` | `auto` (default, on when the socket exists), `true` or `false`. |
| `DOCKER_SOCKET` | Path of the socket (default `/var/run/docker.sock`). |
| `DOCKER_HOST` | A TCP address such as `tcp://docker-host:2375` instead of a socket. |

A Portainer environment is only answered by the socket when both are the same Docker engine. Containers created this way are not labelled by Portainer.

> [!WARNING]
> Access to the Docker socket is root-equivalent on the host. Only mount it into a container you trust, and keep the manager behind authentication.

## Portainer

Set `PORTAINER_URL`, `PORTAINER_USERNAME`, `PORTAINER_PASSWORD` and `PORTAINER_ENV_ID`. Use `PORTAINER_REJECT_UNAUTHORIZED=false` for a self-signed certificate. If the stored environment id is wrong the manager finds a valid one.

## Image updates

**Admin → Docker updates** shows containers with newer images, the last update and the update settings.

- **Automatic updates** pull newer images every hour and recreate running containers on them inside the update window (default 3:00 to 5:00).
- **Manual updates** can be started by an administrator, for one server or many, with progress tracking.
- Old images are cleaned up, a failed update rolls back, and a health check follows each update.
- `INTERNAL_API_KEY` protects `/api/admin/docker-updates/scheduled`, for triggering updates from an outside scheduler. The endpoint stays disabled while the key is empty.

## DNS inside containers

If a container log says it cannot resolve `launchermeta.mojang.com`, set `CONTAINER_DNS` (comma separated addresses). `CONTAINER_DNS_SEARCH=none` removes the search domains Docker copies from the host.
