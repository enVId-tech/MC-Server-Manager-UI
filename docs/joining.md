# Joining a server

Open the server and look at the **How to join** card on the **Overview** tab.

## Java Edition

Enter the address shown, for example `survival.mc.example.com`. The proxy sends you to the right server. You do not need a port when the proxy listens on the default 25565.

## Bedrock Edition

When the proxy runs Geyser the card also shows a Bedrock address and port.

- Bedrock uses the **same host name as Java** unless the Geyser config sets a different public address (`bedrock.address`, or a `broadcast-port` that differs from the listening port).
- Bedrock has no host names in the way Java does, so players add a server with the address and the **port** from the card. With several servers behind one Geyser, an administrator picks which one Bedrock players land on in the proxy settings.

## Education Edition

When the proxy runs EduGeyser, the card shows the Education Edition join information:

- the join code as a row of **icons** (for example Agent, Panda, Carrot ...), with the icon names under each,
- the share **link** under the icons,
- connection IDs read from EduGeyser's files, and the server list entry,
- a **Refresh codes** button.

Pick the icons in the order shown in the Education join screen, or open the link. Codes are not stored in any file: they are requested from the proxy console (`edu joincode`) and read from its log, so the proxy has to be running and have console input (`stdin_open: true`). If the codes cannot be read, the card says why.

> [!NOTE]
> The icons are the closest emoji to the game's own pictures. If one looks different from what the game shows, use the name printed under it.

## No address yet

Servers imported from an existing proxy take their address from that proxy's forced hosts. If the proxy has none for the server, the server has no address yet and the **Network** tab asks you (or an administrator) to set one. Until then the card shows the port instead.

## Not joinable?

A warning on the **Network** tab means the server probably cannot be joined from outside: it has no proxy, no forwarding key, no proxy supports its version, or its port is not reachable. You can dismiss a warning, and it returns only if the situation changes. See [Troubleshooting](/docs/troubleshooting).
