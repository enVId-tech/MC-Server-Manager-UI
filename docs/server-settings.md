# Server settings

The **Settings** tab holds `server.properties` and the container options of the `itzg/minecraft-server` image (about 230), shown only when they apply to your server type and version.

## Saving

**Save and apply** writes the settings and rebuilds the container so they take effect. For imported servers, whose container is defined elsewhere, it restarts the container instead.

## What is locked

Settings the platform depends on are locked for users. They show grayed out, and a value sent anyway is ignored:

- memory and Java options,
- ports, user ids and the server type,
- RCON, query, online mode and the settings that tie a server to the proxy,
- forwarding secrets (not even readable).

Administrators can change them.

## Updates tab (administrators)

Administrators can change a server's **image and version** from the **Updates** tab, for example to move to a new Minecraft version or a different Java image. Take a backup before changing versions.

## Where the values live

`server.properties` settings are written into the file in the server folder, and environment options are stored with the container definition. If you edit `server.properties` by hand in the Files tab, restart the server so the change applies.
