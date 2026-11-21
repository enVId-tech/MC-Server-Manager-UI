# Quick start

From nothing to a joinable server in a few minutes. This page assumes an administrator has already installed the manager (see [Installation](/docs/installation)).

## 1. Create an account

Open **Register**, enter your email and a password (at least six characters) and sign in. If you are the very first person to sign up on a fresh installation you become the administrator.

## 2. Create a server

1. Open the **Dashboard** and choose **Create New Server**.
2. Give the server a name and an address (the part players type, such as `survival`).
3. Pick a **server type** and **Minecraft version**. Types are grouped into *Vanilla and plugins*, *Modded*, *Hybrid* and *Other*. If you are unsure, choose **Paper**.
4. Set the game options you care about (game mode, difficulty, seed, player limit).
5. Optionally add plugins or mods and upload a world.
6. Review the **Summary** and create the server.

Creating a server pulls the image and starts the container, which takes a few minutes the first time. The dashboard card shows **Starting** until the server is ready.

> [!NOTE]
> You cannot choose memory. It is worked out from the server type, the number of plugins and mods and the player limit. See [Creating a server](/docs/creating-servers#memory).

## 3. Join

Open the server and read the **How to join** card on the **Overview** tab. It lists the Java address and, when the proxy runs Geyser, the Bedrock address and port. Education Edition players get their join code as icons there too. See [Joining a server](/docs/joining).

## 4. Run it

- Use **Start**, **Stop**, **Restart** and **Kill** at the top of the server page. **Kill** ends the process at once and can lose recent changes.
- Watch the **Console**, and send commands from the box under it. See [Console and commands](/docs/console).
- Take a **Backup** before big changes. See [Files and backups](/docs/files-and-backups).

## Next steps

- [Plugins and mods](/docs/plugins-and-mods)
- [Worlds](/docs/worlds)
- [Server settings](/docs/server-settings)
