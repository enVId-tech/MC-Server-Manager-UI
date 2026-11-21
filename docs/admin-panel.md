# The admin panel

Administrators see **Admin** in the navigation bar. It has eight sections.

| Section | What you do there |
| --- | --- |
| **Overview** | Infrastructure status, quick actions and the port range handed out to servers. |
| **Servers** | Every server of every user, with bulk start, stop, restart and delete, filters, and **Import existing servers**. Click a server to open it. See [Existing servers](/docs/existing-servers). |
| **Proxies** | Create, scan for, configure and balance proxies. Click a proxy to open it. See [Proxies and the network](/docs/proxies). |
| **Ports** | Check a port, reserve one for a user, release one and see where ports are used. |
| **Users** | Promote, demote, activate, deactivate, set quotas for and delete users; impersonate. See [Users and impersonation](/docs/users). |
| **Backups** | The default backup rule, a rule per server, and every server's backups to download or delete. See [Automatic backups](/docs/backups). |
| **Docker updates** | Available image updates, the last update, and update settings. See [Docker, Portainer and updates](/docs/docker-and-updates). |
| **Settings** | Memory rules, limits, folder naming and command rules. See [Platform settings](/docs/platform-settings). |

## Ports

New servers get the next free port above 25565. Each candidate is checked against Portainer's containers, the database, ports just handed out to servers still being created, and the network itself (a connection attempt on `127.0.0.1` and the Portainer host, see `PORT_CHECK_HOSTS`). The **Ports** section lets you test a specific port, reserve one for a user and release it again.

## Bulk actions

In **Servers** you can select several servers and start, stop, restart or delete them together. Deleting asks for confirmation.

## Who can see it

Only administrators can open the admin panel or call the admin API. Everything an ordinary user cannot see or change is listed in the [Security model](/docs/security).
