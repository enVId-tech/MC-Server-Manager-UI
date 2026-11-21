# Installation

You need a machine with Docker, a MongoDB database, and (recommended) Portainer. The manager itself runs from source or as a container.

## Requirements

- **Node.js 20 or newer** when running from source.
- **MongoDB**, either the one in the compose file or your own.
- **Docker** on the machine that will run the Minecraft containers.
- **Portainer** is optional but supported as the backup route to Docker and used for stacks. Provide its URL and credentials if you want it.
- A **domain** whose wildcard DNS (`*.mc.example.com`) points at your proxy.

## Option A: Docker Compose

```bash
git clone https://github.com/enVId-tech/MC-Server-Manager-UI.git
cd MC-Server-Manager-UI
cp .env.example stack.env
# edit stack.env, then:
docker compose up -d
```

The compose file starts the app and a MongoDB instance. App data, including the proxy definitions, is kept in `./mc-server-creator`.

To get the quick Docker-first path, mount the Docker socket into the app container by uncommenting the `/var/run/docker.sock` line in `docker-compose.yml`. Without it everything still works, through Portainer.

## Option B: from source

```bash
git clone https://github.com/enVId-tech/MC-Server-Manager-UI.git
cd MC-Server-Manager-UI
npm install
cp .env.example .env.local
npm run dev        # development
npm run build && npm start   # production
```

## Minimum configuration

| Variable | Why |
| --- | --- |
| `MONGODB_URI` | Where accounts and servers are stored. |
| `JWT_SECRET` | Signs session cookies. The app refuses to authenticate without it. Use a long random value. |
| `SERVER_DOMAIN` | The domain servers live under, for example `mc.example.com`. |
| `LOCAL_STORAGE_PATH` | Where server files are stored (or configure WebDAV). |
| `PORTAINER_*` | Needed if you use Portainer. |

Every variable is described in the [Configuration reference](/docs/configuration).

## First start

1. Open the app and **Register**. The first account becomes the administrator.
2. Open **Admin → Proxies**. If you already run a Velocity proxy, press **Scan**; otherwise create one. See [Proxies and the network](/docs/proxies).
3. If you already have Minecraft servers on the host, import them from **Admin → Servers**. See [Existing servers](/docs/existing-servers).
4. Review **Admin → Settings**: memory limits, folder naming and update window. See [Platform settings](/docs/platform-settings).

> [!WARNING]
> If the app runs in a container, any folder it should read or write (storage, imports, an existing Velocity folder) has to be mounted into the app container. A folder that only the Docker host can see will not be found. See [Storage and permissions](/docs/storage-and-permissions).

## Checks

```bash
npx tsc --noEmit   # types
npm run lint       # eslint
npm run build      # production build
```

Several focused test scripts exist (`npm run test:network`, `test:local-storage`, `test:world` and more); see `package.json`.
