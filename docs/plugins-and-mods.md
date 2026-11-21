# Plugins and mods

The **Plugins & mods** tab (and the same step on the create page) shows plugins, mods or both, depending on what the server type loads.

## Adding from a link

Paste **one link** to see its name and logo before adding it.

- Links from **Modrinth, SpigotMC, Bukkit and CurseForge** are looked up and can be installed by anyone who owns the server and can update themselves.
- **CurseForge** downloads need `CURSEFORGE_API_KEY` set by an administrator. Without it, CurseForge links show a preview but cannot be installed.
- Other links get no lookup and are downloaded as they are, which needs file uploads to be on for the server (or an administrator).
- **Advanced mode** takes one link per line.

Downloads only go to public hosts: private addresses are refused, including after redirects.

## Uploading jars

Jar files can be dragged in when uploads are on for the server. Each jar is checked:

- proxy plugins are refused on game servers,
- a mod has to match the server's loader (a Fabric mod on a Forge server is refused).

## Updates

Links to the known sites are checked every six hours, or when you press **Check for updates**.

- A **stopped** server is updated at once.
- For a **running** server, plugin updates are put in `plugins/update` (Bukkit swaps them at the next start) and mod updates wait in `.mms/staged` until the server is started from the dashboard.
- Auto-update can be turned off for each entry.

## Managed files

Files the manager installs for the proxy hookup (for example FabricProxy-Lite, ViaVersion copies) are marked as managed. You cannot remove or edit them.

## Memory

Adding plugins and mods changes the memory the server gets, because memory is calculated from their number. See [Creating a server](/docs/creating-servers#memory).
