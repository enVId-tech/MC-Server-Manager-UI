# MC Server Creator & Manager

A comprehensive web application for creating, deploying, and managing Minecraft servers with advanced configuration options, real-time monitoring, and automated infrastructure management.

## 🚀 Overview

MC Server Creator is a full-stack Next.js application that provides users with a complete solution for managing Minecraft servers. From initial creation with custom configurations to ongoing management through an intuitive dashboard, this platform streamlines the entire server lifecycle.

## ✨ Features

### 🎮 Server Creation & Management
- **Multi-step Creation Wizard**: Step-by-step interface for creating custom Minecraft servers
- **Multiple Server Types**: Vanilla, Spigot, Paper, Bukkit, Purpur, Forge, and Fabric support
- **Version Support**: Minecraft 1.8 through 1.21+ with version-specific configurations
- **Advanced Configuration**: 50+ server properties including world settings, performance tuning, and player management
- **File Upload**: Plugin, mod, and world file import capabilities

### 🖥️ Dashboard & Monitoring
- **Real-time Server Status**: Live monitoring of server online/offline status
- **Server Management**: Start, stop, and delete servers with progress tracking
- **Advanced Security**: Multi-step deletion confirmation with subdomain verification
- **Auto-refresh**: Automatic dashboard updates every 60 seconds

### 📁 File Management & Editor
- **Flexible File Storage**: Browse and manage server files through the web interface, stored on the local disk or over WebDAV
- **Built-in File Editor**: Edit configuration files directly in the browser
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
| `LOCAL_STORAGE_PATH`, `LOCAL_STORAGE_HOST_PATH`, `LOCAL_STORAGE_OWNER` | Local storage folder, the same folder as the Docker host sees it (when the app is containerised), and an optional `uid:gid` for created files |
| `WEBDAV_URL`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD`, `WEBDAV_SERVER_BASE_PATH` | WebDAV storage for server files |
| `WEBDAV_REJECT_UNAUTHORIZED` | Set to `false` to accept self-signed WebDAV certificates |
| `PROXIES_CONFIG_PATH` | Location of the proxy definitions (defaults to `lib/config/proxies.yaml`, see `lib/config/proxies.example.yaml`) |

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
```


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