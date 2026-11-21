# Security model

## Authentication

- Sessions use **JWT in HTTP-only cookies**.
- Only **one session is active** per account: logging in elsewhere or changing the password invalidates the previous one.
- Admin and internal endpoints require authentication. The scheduled update endpoint is disabled until `INTERNAL_API_KEY` is set.
- The API is for this app's own pages (same origin), so no permissive CORS headers are sent.

## What users cannot do

Everything that belongs to the host is administrator territory, and every route applies the same rules (`lib/server/accessPolicy.ts`):

| Hidden or locked from users | Why |
| --- | --- |
| Memory, Java options, ports, user ids | They decide how the container runs on the host. |
| RCON, query, online mode and proxy-related settings | The platform and proxy depend on them. |
| Forwarding secrets, `velocity.toml`, Geyser and Floodgate keys | They would let someone join around the proxy. Not readable, not downloadable, not in backups. |
| Proxies and the proxy network | Admin only to see, create or change. |
| Managed proxy mods and config | Cannot be removed or edited. |
| Folder naming, command limits, backup rules, platform settings | Admin only. Users can download backups of their own servers, nothing else about them. |
| Other users' servers | A user only sees servers they own. |

Uploads and direct file editing are off by default per server and switched on by the owner (administrators always can).

## Backups and secrets

Downloaded and automatic backups leave out every proxy secret and key, switch proxy-related settings back to normal and blank the real forwarding secrets and the RCON password in every text file. See [Automatic backups](/docs/backups).

## Input hardening

- Console commands are passed to the container as a single, shell-quoted argument, and must be one line, so `$(...)`, backticks and backslashes cannot run other commands.
- File paths are validated; `..` and symlinks leaving the storage folder are refused.
- Plugin and mod downloads only go to public hosts. Private addresses are refused, including after redirects.
- Uploaded jars are inspected; proxy plugins and mismatching loaders are refused.
- A world upload only copies world files, never symlinks.

## Deployment advice

- Use a long random `JWT_SECRET`.
- Serve the manager over HTTPS.
- Mounting the Docker socket is root-equivalent: do it only if you accept that.
- Treat configuration archives you share as secret: Geyser and Velocity files contain tokens and keys.

## Reporting a problem

Open an issue on [GitHub](https://github.com/enVId-tech/MC-Server-Manager-UI) and, for a vulnerability, avoid posting details publicly.
