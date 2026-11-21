# Configuration reference

All configuration is through environment variables (`.env.local` when running from source, `stack.env` or the compose `environment` block with Docker). `.env.example` in the repository has every variable with comments.

## Required

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string. |
| `JWT_SECRET` | Secret used to sign session cookies. The app refuses to authenticate without it. |

## Domain and accounts

| Variable | Purpose |
| --- | --- |
| `SERVER_DOMAIN` | Domain servers live under: a server named `survival` is reached at `survival.<SERVER_DOMAIN>`. |
| `ADMIN_EMAILS` | Comma separated emails that become administrators when they sign up. The very first account is one regardless. |
| `INTERNAL_API_KEY` | Protects `/api/admin/docker-updates/scheduled`. The endpoint is disabled while empty. |

## Docker and Portainer

| Variable | Purpose |
| --- | --- |
| `PORTAINER_URL`, `PORTAINER_USERNAME`, `PORTAINER_PASSWORD`, `PORTAINER_ENV_ID` | Portainer access. |
| `PORTAINER_REJECT_UNAUTHORIZED` | `false` accepts self-signed certificates. |
| `DOCKER_DIRECT`, `DOCKER_SOCKET`, `DOCKER_HOST` | Docker-first path. See [Docker, Portainer and updates](/docs/docker-and-updates). |
| `CONTAINER_DNS`, `CONTAINER_DNS_SEARCH` | DNS for the Minecraft containers. |
| `PORT_CHECK_HOSTS` | Hosts probed when allocating ports (default `127.0.0.1` and the Portainer host). |

## Storage

| Variable | Purpose |
| --- | --- |
| `STORAGE_BACKEND` | `local` or `webdav`. Defaults to local when `LOCAL_STORAGE_PATH` is set. |
| `LOCAL_STORAGE_PATH` | Folder server files are stored in, as the app sees it. |
| `LOCAL_STORAGE_HOST_PATH` | The same folder as the Docker host sees it (when the app is containerised). Defaults to `LOCAL_STORAGE_PATH`. |
| `LOCAL_STORAGE_OWNER` | Optional `uid:gid` for created files. Needs the app to run as root. |
| `WEBDAV_URL`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD` | WebDAV storage. |
| `WEBDAV_SERVER_BASE_PATH` | Base folder for server folders (default `/minecraft-servers`). |
| `WEBDAV_REJECT_UNAUTHORIZED` | `false` accepts self-signed WebDAV certificates. |
| `MINECRAFT_PATH` | Path for Minecraft files on WebDAV storage. |
| `DELETE_SERVER_FOLDERS` | `true` deletes folders when a server is removed; `false` renames them with `DELETED_`. |
| `MAX_WORLD_UPLOAD_MB` | Largest world zip accepted (default 4096). |

## Containers

| Variable | Purpose |
| --- | --- |
| `CONTAINER_UID`, `CONTAINER_GID` | User the Minecraft containers run as (default `1000:1000`). |
| `CONTAINER_USER_MODE` | `direct` starts containers straight as that user (the folder must already belong to it). |

## Proxies and importing

| Variable | Purpose |
| --- | --- |
| `VELOCITY_IMAGE`, `BUNGEE_IMAGE` | Images for proxies created in the Proxies tab. |
| `VELOCITY_CONFIG_PATH` | `velocity.toml` to use. Without it the existing Velocity is found automatically. |
| `VELOCITY_RELOAD_FALLBACK` | `restart` (default) or `none`: what to do when `velocity reload` cannot be delivered. |
| `IMPORT_SCAN_PATHS` | Comma separated folders that hold servers or a proxy, for example `/imports=/mnt/ssd/docker`. |
| `PROXY_SCAN_PARENT` | `false` stops looking in the folder above the storage folder. |
| `PROXIES_CONFIG_PATH` | Location of proxy definitions from older versions; they are imported into the Proxies tab. |

## Add-ons

| Variable | Purpose |
| --- | --- |
| `CURSEFORGE_API_KEY` | Lets the manager download plugins and mods from CurseForge. |

## Background jobs and logging

| Variable | Purpose |
| --- | --- |
| `BACKGROUND_JOBS` | `false` turns off the jobs that run inside the app. |
| `ENABLE_CONSOLE_LOGS` | `true` enables console logs in production. |
| `DISABLE_CONSOLE_COLORS` | `true` removes colors (useful in CI). |
| `CONSOLE_FILE_MODE` | `development`, `whitelist`, `blacklist`, `production-debug` or `silent`. |
| `LOG_TO_FILE` | `true` writes logs to the `/logs` directory. |
