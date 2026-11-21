# Troubleshooting

## Players

### "Your server did not send a forwarding request to the proxy"

The backend server is not set up for the proxy's forwarding. The forwarding files only exist after the server's first start, so a brand-new server may not be configured yet.

1. Wait a minute: the manager finishes the setup in the background once the files appear.
2. Open the server's **Network** tab and use **Check** (or **Check and restart**, as an administrator).
3. If it persists, check that the forwarding **secret** in the backend matches the proxy's (`config/paper-global.yml` → `proxies.velocity.secret`) and that `online-mode=false` and `proxies.velocity.enabled: true`. Newer Paper versions use the `config/paper-global.yml` path.

### "Unable to connect" or timeouts

Check that the server is **Online**, that the **Network** tab has no warnings, that the proxy runs and that DNS (`*.<SERVER_DOMAIN>`) points at the proxy.

### Bedrock players cannot join

Confirm the proxy runs Geyser, use the **port** on the Overview card, and check the Geyser config `bedrock.port` and `broadcast-port`. A server host that is only reachable by UDP port forwarding needs UDP, not just TCP, forwarded.

### Education Edition join code is not shown

The code is requested from the proxy console and read from its log. The proxy must be running and have console input (`stdin_open: true`). Press **Refresh codes**. EduGeyser files give connection IDs even without the console.

## Console

### "Failed to connect to RCON ... connection refused"

RCON is off or listens on another port in that container. The manager then types the command into the console instead, and the answer appears in the log. To get replies back in the console, turn RCON on (`enable-rcon=true` and an `rcon.password`, or `ENABLE_RCON=true`).

### Commands are slow

Mount `/var/run/docker.sock` into the app container so commands go directly to Docker instead of through Portainer. See [Docker, Portainer and updates](/docs/docker-and-updates).

## Storage

### `AccessDeniedException: /data/server.properties` or "Unable to write eula"

The container user cannot write the folder. See [Storage and permissions](/docs/storage-and-permissions).

## Importing

### A proxy is not detected

The scan can only read folders the **app** can see. If the proxy runs in a container, the folder must be mounted into the app container and listed in `IMPORT_SCAN_PATHS` (for example `/velocity=/mnt/ssd/docker/velocity`). The scan result says when a proxy container was found but its folder is not mounted. Make sure Portainer or the Docker socket is reachable so containers can be inspected.

### Imported servers have no address

Imported servers take their address from the proxy's forced hosts. Add a forced host in `velocity.toml` and sync, or set the address in the server's **Network** tab.

## Containers

### "Cannot resolve launchermeta.mojang.com"

The host's DNS is not reachable from inside Docker. Set `CONTAINER_DNS`.

### A server keeps being stopped

It failed to start too many times in a row. Open it and read the reason on its dashboard, fix it (often memory, a bad plugin or a port clash) and start it again. The limit is in **Admin → Settings**.

### The dashboard shows Offline while a server is starting

It should say **Starting**. If it does not, the container may have no health check yet, or the Docker socket and Portainer are not reachable. Check the **Docker updates** section's infrastructure status in the Overview.

## Still stuck?

Search these docs, then open an issue on [GitHub](https://github.com/enVId-tech/MC-Server-Manager-UI) with the server type, version, what you did, and the last lines of the console.
