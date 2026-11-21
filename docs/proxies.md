# Proxies and the network

A proxy owns the public address and forwards players to the right backend server. The manager supports **Velocity**, **BungeeCord** and **Waterfall**, each as its own type, and configures both sides automatically. Only administrators can create or see proxies.

## Managing proxies

Open **Admin → Proxies**.

- **Scan** looks for existing proxies in the storage folder, the import folders, the folder above the storage folder and every container, and adds anything it finds. Existing proxies are never recreated.
- **New proxy** creates a proxy container. Velocity uses `VELOCITY_IMAGE` (default `envidtech/velocity:latest`); BungeeCord and Waterfall use `BUNGEE_IMAGE` (default `itzg/mc-proxy:latest`). Proxies created by the manager have `stdin_open` on so they can be reloaded without disconnecting players.
- Click a proxy's name to open it.

## Addresses

With one proxy, servers are reached as `name.<SERVER_DOMAIN>`. With several, each proxy needs its own **base subdomain** and **port**, and servers are reached as `name.<base subdomain>.<SERVER_DOMAIN>` (for example `survival.ex1.example.org`).

## What happens when a server joins

Every new or existing server is added to the proxy that fits its version:

- a `[servers]` entry and a **forced host** for its address,
- the backend is configured for that proxy: `online-mode=false`, the forwarding secret in `config/paper-global.yml` (or a BungeeGuard token / `spigot.yml` for legacy), and the proxy's Docker network.

For a server's first start the config files do not exist yet, so the manager remembers what is left to write and finishes it in the background once the files appear, then restarts the server if needed.

When a server is added or removed the manager updates `velocity.toml` and sends `velocity reload` to the proxy console. Velocity re-reads its server list without disconnecting anyone.

> [!NOTE]
> The proxy container needs `stdin_open: true` (proxies created by the manager have it) or the `mc-send-to-console` helper. If the command cannot be delivered the proxy is restarted, which does disconnect players. Set `VELOCITY_RELOAD_FALLBACK=none` to never do that.

## No fallback

Servers are never added to `try`, and proxies are created with `try = []`. When a server stops its players are disconnected instead of being sent somewhere else.

## Forwarding and versions

Modern forwarding (Velocity) needs Minecraft 1.13+. A server goes to the most modern forwarding that supports its version: 1.20 goes to the modern proxy, 1.12 to the BungeeGuard or legacy one. All modern Velocity proxies share one forwarding secret, because a backend can know only one.

Legacy forwarding is insecure unless the backend port is not reachable from outside. Prefer BungeeGuard, which needs the BungeeGuard proxy plugin installed by an administrator.

## Load balancing

With several proxies of the same forwarding, choose to register servers on **all** of them, spread them **evenly**, or by **priority**.

## Servers without a proxy

The Proxies section lists servers that no proxy carries. **Check every server** adds them to a suitable proxy. Those no proxy supports keep a warning on their dashboard.

## Geyser and EduGeyser

The server's Overview shows the Java address, the Bedrock address and port and, for EduGeyser, the Education Edition join codes. Details are in [Joining a server](/docs/joining). The manager reads the Geyser config (`plugins/<Geyser folder>/config.yml`: `bedrock.port`, `clone-remote-port`, `broadcast-port`, `address`) to decide the Bedrock address.

## ViaVersion, ViaBackwards, ViaRewind

When the proxy has them, a copy is installed on each server behind it. This can be turned off in the load balancing settings.

## Locked options

Online mode and the other options the proxy depends on are grayed out for users and ignored if sent. Administrators can change them.

## Warnings

A server without a proxy, without a key, or that no proxy supports shows a warning that it will most likely not be joinable unless its port is forwarded or exposed to the internet. Users and administrators can dismiss it; it returns only if the situation changes. A server's **Network** tab has **Check** and **Check and restart** actions to re-apply the network settings.
