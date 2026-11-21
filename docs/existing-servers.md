# Existing servers

If you already run Minecraft servers or a proxy on the host, the manager can adopt them without changing their files.

## Importing servers

Open **Admin → Servers → Import existing servers**. The manager finds:

- `itzg` Minecraft containers, running or stopped, and
- folders with a `server.properties`

that are not in the dashboard, and adds the ones you choose. You can also ignore a found server so it is not offered again.

Folders outside the storage folder must be listed in `IMPORT_SCAN_PATHS` so the app can read and edit them, for example `/imports=/mnt/ssd/docker`. Write `app=host` when Docker sees a folder under another path than the app does. If the app runs in a container, **mount the folder into the app container** at the `app` path.

### Addresses of imported servers

Imported servers take their address from the proxy's own **forced hosts**, never from the server's name. If the proxy has no forced host for a server, it has no address yet and the **Network** tab lets you set one. The manager re-reads the forced hosts whenever servers are synced, so changes made in `velocity.toml` show up.

### How imported servers behave

They work like any other server: files, console, logs, power buttons, `server.properties` settings and the proxy hookup. Because their container is defined elsewhere:

- **Save and apply** restarts the container instead of rebuilding it,
- deleting removes the container and the dashboard entry, never the files.

## Importing proxies

Existing proxies (a Velocity found through `VELOCITY_CONFIG_PATH`, container mounts or the import folders; a BungeeCord or Waterfall container) are added to the **Proxies** tab automatically and are never recreated. If a proxy is not found, the scan says whether its folder is simply not mounted into the app. See [Troubleshooting](/docs/troubleshooting#a-proxy-is-not-detected).

## Who gets imported servers

Every ten minutes the manager looks for servers and proxies that are not in the dashboard. With one administrator they are added to that account. With several, the next administrator who signs in is asked which account should get them; leaving it empty means their own account.
