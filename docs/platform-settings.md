# Platform settings

**Admin → Settings** holds the rules that apply to every server and user. Changes apply to new and changed servers.

## Memory

Users cannot choose memory. It is calculated, then limited by these values:

| Setting | Meaning |
| --- | --- |
| **Largest heap** | The most memory the automatic sizing gives a server. |
| **Smallest heap** | Every server gets at least this much. |
| **Base heap** | A plain server with no plugins, mods or extra players. |
| **Extra for modded** | Added for Forge, NeoForge, Fabric and Quilt servers. |
| **Extra for modpacks** | Added for servers that install a modpack. |
| **Per plugin / per mod** | Added for every plugin or mod. |
| **Per player above 10** | Added for every player slot above ten. |

The page shows an example: a Paper server with 10 plugins and 20 player slots. The result is rounded to 256 MB.

## Folder names of new servers

One setting for the whole installation, changeable only by administrators: **Unique ID** (never clashes) or **the server's own name** (easier to find by hand). It applies to servers created afterwards. With names, a folder that already exists is never reused. See [Creating a server](/docs/creating-servers#folder-names).

## Block server-switching commands

When on, users cannot run `server`, `send`, `sendall`, `transfer`, `hub` or `lobby` from the console, also not behind `execute ... run`. Administrators are exempt. See [Console and commands](/docs/console#commands-that-switch-servers).

## Failed starts

A server that fails to start this many times in a row is stopped for good and shows why on its dashboard (default 5).

## Updates

- **Update container images automatically**: newer images are pulled every hour and running containers are recreated on them, but only inside the **update window** (default 3:00 to 5:00 server time).
- Use the same hour twice to allow updates at any time.

## Background jobs

These run inside the app (turn them all off with `BACKGROUND_JOBS=false`):

| When | What |
| --- | --- |
| Every minute | Stops servers that keep failing to start; finishes pending proxy setups for new servers. |
| Every hour | Updates images inside the update window. |
| Every 10 minutes | Finds existing servers and proxies not yet in the dashboard. |
| Every six hours | Checks plugin and mod updates. |
