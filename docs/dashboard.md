# The dashboard

The dashboard lists every server you own, plus proxies if you are an administrator. It refreshes by itself, and faster while a server is starting or stopping.

## Status

Each card shows the live state of the container, not just whether it exists.

| Status | Meaning |
| --- | --- |
| **Online** | The container runs and, when it has a health check, is healthy. |
| **Starting** | The container was just started or its health check has not passed yet. Large modpacks can stay here for several minutes. |
| **Stopping** | A stop was requested and the server is saving and shutting down. |
| **Offline** | The container is stopped. |
| **Crashed** | The container exited with an error. The server page shows why when it is known. |
| **Paused** | The container is paused. |
| **Unhealthy** | The container runs but its health check fails. |

## Players and resources

The numbers are read from the running server, not stored.

- **Players** come from the server itself: the manager pings it (`mc-monitor`, which the itzg images have, and which writes nothing to the log). If that does not work it asks over RCON with `list`, and only when both fail does it count the joins and leaves in the log of the current run. A server that is not running has no players.
- **CPU** is shown in percent of one core, as `docker stats` shows it, so a server using two cores fully shows 200%. It needs two samples, which the manager takes.
- **Memory** is what the server's processes use. The file cache that Docker counts in its usage is left out, so the number matches what `docker stats` shows. The limit is the one set on the container; without one, the memory configured for the server is used instead of the memory of the whole machine.
- Numbers are cached for a few seconds, so many open tabs do not ask Docker over and over.

## Power buttons

- **Start** and **Stop** are the normal way to run a server. Stop lets the server save the world first.
- **Restart** stops and starts it again.
- **Kill** ends the process immediately. Use it only when a normal stop does not work.

A server that keeps failing to start is stopped automatically after a number of failures an administrator sets, and its dashboard shows the reason. See [Platform settings](/docs/platform-settings).

## Opening a server

Click a card to open the server page. Its tabs are:

| Tab | What it is for |
| --- | --- |
| **Overview** | Players, memory, how to join, and details. |
| **Console** | Live output and a command line. See [Console and commands](/docs/console). |
| **Files** | Browse and edit files. See [Files and backups](/docs/files-and-backups). |
| **Plugins & mods** | Install and update add-ons. |
| **World** | Upload a world. |
| **Settings** | `server.properties` and container options. |
| **Network** | Addresses, proxy status and warnings. |
| **Updates** | Image and version changes (administrators). |

## Backups and deleting

**Backup** downloads the server's files as a zip. Proxy data (forwarding secrets and similar) is left out. **Delete** asks you to type the server's address before anything is removed, offers a backup first, and shows progress while the container and files are removed. Deleting an imported server removes its container and dashboard entry, never its files.
