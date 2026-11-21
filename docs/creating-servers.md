# Creating a server

Open **Dashboard → Create New Server**. The page walks through the server's configuration, world, plugins and mods, container settings and a final summary. Administrators also get a **Proxy** tab to create a proxy from the same page.

## Name and address

The **name** is what you see on the dashboard. The **address** is the part players type. Servers behind a proxy are reached as `address.<proxy base subdomain>.<SERVER_DOMAIN>` when there are several proxies, or `address.<SERVER_DOMAIN>` with one. Addresses use lowercase letters, digits and dashes and must be unique across the installation.

## Server type and version

The type list is grouped:

| Group | Contains |
| --- | --- |
| **Vanilla and plugins** | Vanilla-compatible servers and Bukkit-family software (Paper, Folia, Purpur, Pufferfish, Leaf, Spigot). |
| **Modded** | Fabric, Quilt, Forge, NeoForge and modpack installers. |
| **Hybrid (plugins and mods)** | Mohist, Banner, Arclight, Magma, Ketting, Youer. |
| **Other** | Anything else the image supports. |

Versions come live from each project's API (PaperMC, Purpur, Fabric, Quilt, Forge, NeoForge, Mojang) and are never stored in the database. The Java version follows from the Minecraft version through the image tag, so you never choose it.

> [!NOTE]
> Modern Velocity forwarding needs Minecraft 1.13 or newer. If modern forwarding is the only kind in the network, users can only create 1.13+ servers. With a BungeeGuard or legacy proxy any version can be picked. Administrators can create servers no proxy supports.

### Modded servers

For modded servers the manager adds the mods and config that let them join a Velocity proxy with modern forwarding: Fabric API, FabricProxy-Lite and CrossStitch on Fabric, proxy-compatible-forge on Forge and NeoForge, and Ambassador on Velocity for older Forge. These files are marked as managed. You cannot delete or change them, and you will not see anything proxy related.

## Game options

Game mode, difficulty, seed, player limit, `server.properties` for the chosen version and about 230 settings of the `itzg/minecraft-server` image are available, shown only when they apply to the chosen type and version. EULA, RCON, ports, user ids and the server type itself are managed by the platform and cannot be changed.

## Memory

You cannot set memory. It is worked out from:

- the server type (modded servers and modpacks get more),
- the number of plugins and mods,
- the player limit, counting every slot above ten,

and kept between the minimum and maximum an administrator sets in **Admin → Settings**. It is recalculated whenever plugins or mods change. A running container picks up a new value the next time it is rebuilt.

## World, plugins and mods

You can upload a world zip while creating the server and add plugins or mods by link. See [Worlds](/docs/worlds) and [Plugins and mods](/docs/plugins-and-mods).

## Folder names

Each server has a folder in the storage. By default it is named after the server's unique id. An administrator can switch the whole installation to the server's own name under **Admin → Settings**. Users cannot choose. With names, a clash gets a number (`survival`, `survival-2`), the oldest server keeps the plain name, and folders left behind by partly deleted servers count as taken. Existing servers keep their folders.

## Server limit

Each user has a server quota (three by default). Administrators change it per user in **Admin → Users**.

## After you press create

The manager allocates a port (the next free one above 25565, checked against Portainer's containers, the database, ports just handed out, and the network itself), builds the container, registers the server with the fitting proxy and starts it. The first start finishes the proxy forwarding setup: the server's config files only exist after its first run, so the manager completes them in the background and restarts the server once if needed.
