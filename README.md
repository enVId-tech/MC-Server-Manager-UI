# MC Server Creator & Manager

A comprehensive web application for creating, deploying, and managing Minecraft servers with advanced configuration options, real-time monitoring, and automated infrastructure management.

## 🚀 Overview

MC Server Creator is a full-stack Next.js application that provides users with a complete solution for managing Minecraft servers. From initial creation with custom configurations to ongoing management through an intuitive dashboard, this platform streamlines the entire server lifecycle.

## ✨ Features

### 🎮 Server Creation & Management
- **Multi-step Creation Wizard**: Step-by-step interface for creating custom Minecraft servers
- **Velocity-Ready Server Types**: Only software that the Velocity hookup can configure can be created: Paper, Folia, Purpur, Pufferfish, Leaf, Spigot and the Bukkit based hybrids Mohist, Banner, Arclight, Magma, Ketting and Youer. Vanilla, mod loaders, modpack installers and the like are not offered because they cannot read the forwarding settings
- **Live Version Lists**: The versions of every server type are read from the software's own API (PaperMC, Purpur, Fabric, Quilt, Forge, NeoForge, Mojang) and are not stored in the database
- **Every itzg Setting**: About 230 options of the `itzg/minecraft-server` image, shown only when they apply to the chosen server type and Minecraft version, in the creation wizard and in the server dashboard (Settings tab)
- **Automatic Java**: The Java version follows from the Minecraft version through the image tag. EULA, RCON, ports, user ids and the server type itself are managed by the platform and cannot be changed
- **Advanced Configuration**: server.properties for the chosen version, plus every container setting
- **File Upload**: Plugin, mod, and world file import capabilities

### 🖥️ Dashboard & Monitoring
- **Real-time Server Status**: Live monitoring of server online/offline status
- **Server Management**: Start, stop, and delete servers with progress tracking
- **Advanced Security**: Multi-step deletion confirmation with subdomain verification
- **Auto-refresh**: Automatic dashboard updates every 60 seconds

### 📁 File Management & Editor
- **Flexible File Storage**: Browse and manage server files through the web interface, stored on the local disk or over WebDAV
- **Built-in File Editor**: Edit configuration files directly in the browser. `server.properties`, YAML (`paper-global.yml`, `spigot.yml`, `purpur.yml`, ...) and JSON files open as a settings form that keeps comments and layout; every other file opens in a text editor
- **Real-time Preview**: View file contents with syntax highlighting
- **Auto-save Protection**: Unsaved changes warning when navigating away
- **File Navigation**: Breadcrumb navigation and folder browsing

### 💬 User Interface & Notifications
- **Styled Notification System**: Beautiful notifications replacing browser alerts
- **Confirmation Dialogs**: Themed modal confirmations for destructive actions
- **Real-time Feedback**: Success, error, warning, and info notifications
- **Auto-dismiss**: Smart notification timing with manual close options
- **Mobile-responsive**: Touch-friendly interface on all devices

### 🔐 Authentication & Security
- **JWT Authentication**: Secure session management with HTTP-only cookies
- **User Registration**: Account creation with validation; the first account to sign up (or any email in `ADMIN_EMAILS`) becomes an administrator
- **Single Active Session**: Logging in elsewhere or changing a password invalidates the previous session
- **Hardened APIs**: Admin and internal endpoints require authentication, file paths are validated, and console commands are shell-escaped
- **Protected Routes**: Automatic authentication checks and redirects

### 🌐 Infrastructure Integration
- **Docker Containers**: Automated server deployment via Portainer
- **Dynamic Port Allocation**: Automatic port assignment with conflict resolution
- **File System**: local disk (default when configured) or WebDAV for server file management

### 🌐 Multi-Proxy Support
- **Velocity**: High-performance modern proxy with advanced features
- **BungeeCord**: Traditional proxy server with plugin ecosystem
- **Waterfall**: BungeeCord fork with performance improvements and fixes
- **Unified Management**: Single interface for all proxy types
- **Auto-Configuration**: Automatic proxy setup and server registration

### 🐳 Docker Management & Updates
- **Automated Updates**: Scheduled Docker image updates with maintenance windows
- **Manual Updates**: Admin-triggered updates with progress tracking
- **Image Cleanup**: Automatic removal of outdated Docker images
- **Bulk Operations**: Update multiple servers simultaneously
- **Rollback Support**: Automatic rollback on update failures
- **Health Monitoring**: Post-update health checks and status reporting

### 👑 Administrative Features
- **Admin Dashboard**: Comprehensive admin interface with tabbed navigation
- **Server Overview**: View and manage all servers across all users
- **Bulk Server Management**: Start, stop, restart, or delete multiple servers
- **User Management**: Promote, demote, activate, deactivate, set server quotas for, and delete users from the admin panel
- **System Monitoring**: Docker update status and system health
- **Advanced Filtering**: Search and filter servers by various criteria

### 🔧 Developer Tools & Logging
- **Console Configuration**: File-specific logging controls with blacklist/whitelist modes
- **REST API Logging**: Toggleable request/response logging with detailed options
  - Request/response headers and body logging
  - Request timing and performance metrics
  - Error-only logging mode for production
  - Configurable via environment variables
- **Debug Mode**: Enhanced development logging with timestamps and colors

### 🎨 User Experience
- **Responsive Design**: Mobile-first approach that works on all devices
- **Professional UI**: Styled notifications and confirmation dialogs
- **Real-time Feedback**: Live progress tracking and status updates
- **Error Handling**: Comprehensive error messages and recovery options
- **Progressive UI**: Loading states, progress indicators, and smooth animations
- **Accessibility**: Keyboard navigation and screen reader support

## 🛠️ Technology Stack

- **Frontend**: Next.js 16, React 19, TypeScript, SCSS Modules
- **Backend**: Next.js API Routes, MongoDB, JWT Authentication
- **Infrastructure**: Docker, Portainer, WebDAV
- **UI/UX**: React Context API, Custom Notification System, Mobile-responsive Design
- **Development**: ESLint, TypeScript, SASS, Node.js 20+

## 🚦 Quick Start

1. **Clone and install**
   ```bash
   git clone https://github.com/enVId-tech/MC-Server-Manager-UI.git
   cd MC-Server-Manager-UI
   npm install
   ```

2. **Configure the environment**
   ```bash
   cp .env.example .env.local
   ```
   Fill in `.env.local` (see the table below). `MONGODB_URI` and `JWT_SECRET` are required, and Portainer and WebDAV credentials are needed to actually deploy servers.

3. **Start development**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` and sign up. The first account becomes the administrator.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign session cookies (required) |
| `SERVER_DOMAIN` | Domain servers live under: a server named `survival` is reached at `survival.<SERVER_DOMAIN>` (default `mc.etran.dev`) |
| `ADMIN_EMAILS` | Comma separated emails that become administrators when they sign up |
| `INTERNAL_API_KEY` | Protects `/api/admin/docker-updates/scheduled`; the endpoint is disabled while empty |
| `PORTAINER_URL`, `PORTAINER_USERNAME`, `PORTAINER_PASSWORD`, `PORTAINER_ENV_ID` | Portainer access used to create and manage containers |
| `PORTAINER_REJECT_UNAUTHORIZED` | Set to `false` to accept self-signed Portainer certificates |
| `STORAGE_BACKEND` | `local` or `webdav`. Defaults to local when `LOCAL_STORAGE_PATH` is set |
| `CONTAINER_UID`, `CONTAINER_GID` | User the Minecraft containers run as (default `1000:1000`). Set it to the owner of your storage folder, otherwise the image fails with `AccessDeniedException: /data/server.properties` |
| `IMPORT_SCAN_PATHS` | Comma separated folders that already hold servers or a Velocity proxy, for example `/imports=/mnt/ssd/docker`. Write `app=host` when Docker sees a folder under another path than the app does |
| `VELOCITY_CONFIG_PATH` | Optional path of the `velocity.toml` to use. Without it the existing Velocity instance is found automatically |
| `LOCAL_STORAGE_PATH`, `LOCAL_STORAGE_HOST_PATH`, `LOCAL_STORAGE_OWNER` | Local storage folder, the same folder as the Docker host sees it (when the app is containerised), and an optional `uid:gid` for created files |
| `WEBDAV_URL`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD`, `WEBDAV_SERVER_BASE_PATH` | WebDAV storage for server files |
| `WEBDAV_REJECT_UNAUTHORIZED` | Set to `false` to accept self-signed WebDAV certificates |
| `PROXIES_CONFIG_PATH` | Location of proxy definitions from older versions; they are imported into the Proxies tab |
| `VELOCITY_IMAGE`, `BUNGEE_IMAGE` | Images for proxies created in the Proxies tab |
| `DOCKER_DIRECT`, `DOCKER_SOCKET`, `DOCKER_HOST` | Docker first, Portainer as the backup. Container, image, network, log and command calls go through the Docker socket (much quicker); stacks, Portainer environments that are another Docker host, and any call that cannot reach the socket still use Portainer. Mount `/var/run/docker.sock` into the app container. `DOCKER_DIRECT` is `auto` (on when the socket exists), `true` or `false`. A Portainer environment is only answered by the socket when both are the same Docker engine. Containers made this way are not labelled by Portainer, and private registry pulls stay with Portainer |
| `PROXY_SCAN_PARENT` | Existing proxies are looked for in the folder above the storage folder and its subfolders too (so the app can read and write there). Set to `false` to switch this off |
| `CURSEFORGE_API_KEY` | Lets the manager download plugins and mods from CurseForge. Without it, CurseForge links show a preview but cannot be installed |
| `MAX_WORLD_UPLOAD_MB` | Largest world zip that is accepted (default 4096) |
| `BACKGROUND_JOBS` | Set to `false` to turn off the jobs that run inside the app (start failure guard, image updates, plugin and mod updates, existing server detection) |

### Running with Docker

```bash
cp .env.example stack.env   # then fill it in
docker compose up -d
```

The compose file starts the app and a MongoDB instance. App data, including the proxy definitions, is kept in `./mc-server-creator`.

### Checks

```bash
npx tsc --noEmit   # types
npm run lint       # eslint
npm run build      # production build
npm run test:itzg-catalog   # option catalog, version rules, version parsers, config file helpers
npm run test:local-storage  # local storage backend
npm run test:port-probe     # network check used when allocating ports
npm run test:velocity-reload  # reloading Velocity without disconnecting players
npm run test:network test:access test:proxy-discovery test:modded test:proxy-identity   # proxy network, file access rules, proxy detection, modded servers, proxy names and ports
npm run test:folder-naming test:existing-servers test:world test:addons   # folder names, existing server detection, world checks, plugin and mod links
```


## Ports and Velocity

- New servers get the next free port above 25565. Each candidate is checked against Portainer's containers, the database, ports just handed out to servers that are still being created, and the network itself (a connection attempt on `127.0.0.1` and the Portainer host, see `PORT_CHECK_HOSTS`).
- When a server is added or removed the manager updates `velocity.toml` and sends `velocity reload` to the proxy console. Velocity re-reads its server list without disconnecting anyone. The proxy container needs `stdin_open: true` (proxies created by the manager have it) or the `mc-send-to-console` helper. If the command cannot be delivered the proxy is restarted, which does disconnect players; set `VELOCITY_RELOAD_FALLBACK=none` to never do that.

## Proxy network

Admins manage proxies in **Admin → Proxies**: Velocity, BungeeCord and Waterfall, as their own type. Regular users cannot see or change them.

- **Servers join automatically.** Every new or existing server is added to the proxy that fits its version (its `[servers]` entry and a forced host for its address), and the backend is configured for that proxy: `online-mode=false`, the forwarding secret in `config/paper-global.yml` (or BungeeGuard token / `spigot.yml` for legacy), and the proxy's Docker network.
- **No fallback.** Servers are never added to `try`, and the proxies are created with `try = []`. When a server stops its players are disconnected instead of being sent elsewhere.
- **Forwarding and versions.** Modern forwarding (Velocity) needs Minecraft 1.13+. If modern is the only forwarding in the network, users can only create 1.13+ servers; with a BungeeGuard or legacy proxy they can pick any version. A server goes to the most modern forwarding that supports its version (1.20 to the modern proxy, 1.12 to the BungeeGuard or legacy one). Admins can create servers no proxy supports.
- **Load balancing.** With several proxies of the same forwarding, choose to register servers on all of them, spread them evenly, or by priority. All modern Velocity proxies share one forwarding secret, because a server can know only one.
- **Warnings.** A server without a proxy, without a key, or that no proxy supports shows a warning that it will most likely not be joinable unless its port is forwarded or exposed to the internet. Users and admins can dismiss it; it comes back only if the situation changes.
- **ViaVersion, ViaBackwards, ViaRewind.** When the proxy has them, a copy is installed on each server behind it (can be turned off in the load balancing settings).
- **Geyser and EduGeyser.** The server dashboard shows the Java address, the Bedrock address and port, and, for EduGeyser, the Education Edition join codes read from the proxy console. Bedrock has no host names, so pick a server in the proxy settings for players without one.
- **Locked options.** Online mode and the other options the proxy depends on are grayed out for users and ignored if sent; admins can change them. Admins can also update the image and version of a server from its dashboard (Updates tab).

`VELOCITY_IMAGE` (default `envidtech/velocity:latest`) and `BUNGEE_IMAGE` (default `itzg/mc-proxy:latest`) select the proxy images. Legacy forwarding is insecure unless the backend port is not reachable from outside; prefer BungeeGuard. Bungee/Waterfall need the BungeeGuard proxy plugin installed by an admin for BungeeGuard forwarding.

## Creating servers

Open **Create New Server**. Administrators also see a **Proxy** tab there to create a proxy from the same page.

- **Folder name.** A server's folder is its unique id by default, or its own name if you choose that on the General tab. Both kinds are recognised everywhere. If a name is taken, a number is added (`survival`, `survival-2`): the oldest server keeps the plain name, and folders left behind by partly deleted servers count as taken.
- **Memory.** Users cannot set memory. It is worked out from the server type, the number of plugins and mods, and the player limit, up to the maximum an administrator sets in **Admin → Settings**, and it is worked out again whenever plugins or mods change. A running container picks up a new value the next time it is rebuilt.
- **Server types.** Modded types (Fabric, Quilt, Forge, NeoForge and modpacks) can be created. The manager adds the mods and config that let them join a Velocity proxy with modern forwarding (Fabric: Fabric API, FabricProxy-Lite, CrossStitch; Forge and NeoForge: proxy-compatible-forge; Ambassador on Velocity for older Forge). These files are marked as managed: users cannot delete or change them, and neither can they see anything proxy related.
- **Several proxies.** With more than one proxy, each needs its own base subdomain and port. Servers behind a proxy are reached as `name.<base subdomain>.<SERVER_DOMAIN>` (for example `survival.ex1.example.org`).

## Worlds

A world is uploaded as a `.zip` when creating a server, or later from the **World** tab of the dashboard (the server must be stopped and uploads must be on for it, administrators always may). The world is read before it is used and sorted into one of three groups: before 1.17, 1.17 to 1.21.x, and 26.1 and newer (26.1 moved the dimensions into their own folder).

- Upgrading inside a group, or to a newer version, works: the server converts the world the first time it loads it. Keep a copy of the original.
- Downgrading inside a group is **not supported**. A red warning explains this and the import only goes ahead after the box is ticked. Chunks can be damaged, blocks and items disappear, and the world may not load.
- A world can never be moved across 1.17 or 26.1, in either direction. These are refused.
- Only world files are copied, never symlinks. The previous world is moved to `backups/before-world-import-<time>`.

## Plugins and mods

The **Plugins & mods** tab (and the same step in the create page) shows plugins, mods or both, depending on what the server type loads.

- Paste **one link** to see its name and logo before adding it. Modrinth, SpigotMC, Bukkit and CurseForge links are looked up and can be installed by anyone who owns the server and can update themselves. Other links get no lookup and are downloaded as they are, which needs file uploads to be on for the server (or an administrator).
- **Advanced mode** takes one link per line.
- Jar files can be dragged in when uploads are on for the server. Each jar is checked: proxy plugins are refused on game servers, and a mod has to match the server's loader.
- Downloads only go to public hosts: private addresses are refused, including after redirects.
- **Updates.** Links to the known sites are checked every six hours (or with *Check for updates*). A stopped server is updated at once. For a running server, plugin updates are put in `plugins/update` (Bukkit swaps them at the next start) and mod updates wait in `.mms/staged` and are put in place when the server is started from the dashboard. Auto-update can be turned off for each entry.

## Files, backups and what users can see

- **Files.** Uploading files and editing them directly are off for every server by default. The owner switches them on in the Files tab; administrators always can. The file list shows what is really in the folder, minus proxy files.
- **Proxy data stays hidden.** Users cannot see, download, back up or change forwarding secrets, `velocity.toml`, Geyser and Floodgate keys and similar files, and the manager-installed proxy mods cannot be removed. All file routes go through one set of rules (`lib/server/accessPolicy.ts`).
- **Backups.** The download of a server is a zip that leaves out the proxy data listed above.
- **Portainer and network settings** can only be changed by administrators.
- **Impersonation.** An administrator can preview the site as an ordinary user, or open it as a particular account (as that user, or as that user with admin rights), from Admin → Users. A banner shows it at all times and ends it.

## Platform settings and background jobs

Admin → Settings holds the memory limits, how many failed starts stop a server, and whether container images update by themselves (containers are only recreated inside an update window, by default 3:00 to 5:00 server time). These jobs run inside the app:

- every minute: servers that keep failing to start are stopped after the set number of failures (default 5) and show why on their dashboard;
- every hour: images are updated inside the update window;
- every 10 minutes: existing servers and proxies that are not in the dashboard are found. With one administrator they are added to that account. With several, the next administrator who signs in is asked which account should get them, and leaving it empty means their own account;
- every six hours: plugin and mod updates.

The delete progress bar never goes over 100%.

## Existing servers and Velocity

- **Admin → Servers → Import existing servers** finds itzg Minecraft containers (running or stopped) and folders with a `server.properties` that are not in the dashboard, and adds the ones you choose. Their files and containers are not changed. Folders outside the storage folder need to be listed in `IMPORT_SCAN_PATHS` so the app can read and edit them.
- Imported servers work like the others: files, console, logs, power buttons, `server.properties` settings and the Velocity hookup. Because their container is defined elsewhere, "Save and apply" restarts the container instead of rebuilding it, and deleting one removes its container and dashboard entry but never its files.
- Existing proxies (a Velocity found through `VELOCITY_CONFIG_PATH`, container mounts or the import folders, a BungeeCord or Waterfall container) are added to the **Proxies** tab automatically and are never recreated.

## Local file storage

Server files can live directly on the machine instead of going through WebDAV, so nothing is sent over the network.

```env
STORAGE_BACKEND=local
LOCAL_STORAGE_PATH=/data/minecraft
```

- Files are stored under `LOCAL_STORAGE_PATH/<WEBDAV_SERVER_BASE_PATH>/<user>/<server id>`, and the Minecraft containers bind mount the same folders.
- If the app itself runs in Docker, mount the folder into the app container at `LOCAL_STORAGE_PATH` and set `LOCAL_STORAGE_HOST_PATH` to the folder's path on the Docker host, because that is the path Docker uses for the bind mounts.
- The app only touches files inside the storage folder. Paths with `..`, and symlinks that point outside it, are refused.
- Set `LOCAL_STORAGE_OWNER=1000:1000` (the user of the itzg images) to have created files owned by the container user. This needs the app to run as root.
- `npm run test:local-storage` runs the safety checks for this backend.

## 🔐 Folder permissions

Minecraft containers start as root, hand their `/data` folder to `CONTAINER_UID:CONTAINER_GID` and then drop to that user, so a server folder that was created by Docker (owned by root) still works. If you see `Unable to write eula to /data. Please make sure attached directory is writable by uid=1000`, the container was started directly as that user (`CONTAINER_USER_MODE=direct`) or the storage does not allow `chown`. Fix the folder once:

```bash
# find the first user ID and group ID of 3000 or higher that no user on the machine has
echo "uid: $(getent passwd | cut -d: -f3 | sort -n | awk 'BEGIN{n=3000} $1==n{n++} END{print n}')"
echo "gid: $(getent group  | cut -d: -f3 | sort -n | awk 'BEGIN{n=3000} $1==n{n++} END{print n}')"

# list every user ID that is taken from 1000 up
getent passwd | awk -F: '$3>=1000 && $3<65534 {print $3, $1}' | sort -n
```

On TrueNAS SCALE create a user with that UID under *Credentials → Local Users* (untick *Create New Primary Group* if you made a group with that GID), then set `CONTAINER_UID` and `CONTAINER_GID` to it and give it the storage folder: `chown -R <uid>:<gid> /mnt/<pool>/<dataset>/minecraft-servers`.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## ⚠️ Legal Disclaimer

This website and repository/codebase is not an official Minecraft website and is not associated with Mojang Studios or Microsoft. All product and company names are trademarks or registered trademarks of their respective holders. Use of these names does not imply any affiliation or endorsement by them.

## 🙏 Acknowledgments

- **itzg/minecraft-server** - Docker image for Minecraft server deployment
- **Portainer** - Container management platform
- **MongoDB** - Database platform
- **Next.js Team** - Framework development
- **React Community** - Component libraries and tools

## Note and Disclaimer
Partially developed with AI