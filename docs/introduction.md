# Introduction

MC Server Creator is a web application for creating and running Minecraft servers on a machine you control. People sign up, pick a server type and version, and the manager builds the container, opens a port, wires the server into your Velocity (or BungeeCord, Waterfall) proxy and gives them a dashboard with a console, a file browser, plugin and mod management and backups.

## How it fits together

| Part | What it does |
| --- | --- |
| **The manager** | The Next.js web app you are looking at. It stores accounts and server records in MongoDB and does all the work through the pieces below. |
| **Docker** | Every Minecraft server and every proxy is a container, normally from the `itzg/minecraft-server` image. The manager talks to Docker through its socket first and falls back to Portainer. See [Docker, Portainer and updates](/docs/docker-and-updates). |
| **Portainer** | The backup route to Docker, and the way stacks are created. |
| **Storage** | The folder where server files live, on the local disk or over WebDAV. The containers bind-mount the same folders. See [Storage and permissions](/docs/storage-and-permissions). |
| **The proxy** | A Velocity, BungeeCord or Waterfall container that owns the public address. Players join `name.<domain>` and the proxy forwards them to the right server. See [Proxies and the network](/docs/proxies). |

## Roles

There are two kinds of account.

- **Users** create servers (up to their server quota), and manage the servers they own: power, console, files, plugins, mods, worlds and the settings an administrator has left unlocked.
- **Administrators** manage the whole installation: every server, every user, proxies, ports, memory rules and updates. The first account that signs up is an administrator, and so is any email listed in `ADMIN_EMAILS`.

Anything that belongs to the host (container options, ports, memory, forwarding secrets, the proxy network) is administrator territory. The [Security model](/docs/security) page lists exactly what users can and cannot see.

## What you can run

Servers are created from software the proxy hookup can configure: Paper, Folia, Purpur, Pufferfish, Leaf and Spigot, the Bukkit-based hybrids, and modded servers (Fabric, Quilt, Forge, NeoForge and modpacks), for which the manager installs the forwarding mods automatically. Versions are read live from each project's own API. See [Creating a server](/docs/creating-servers).

## Where to go next

- New here? Follow the [Quick start](/docs/quick-start).
- Running the manager yourself? Read [Installation](/docs/installation), then the [admin panel](/docs/admin-panel).
- Something broke? Try [Troubleshooting](/docs/troubleshooting) or use the search box.
