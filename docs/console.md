# Console and commands

The **Console** tab shows the server's live log and has a command line at the bottom.

## Reading the log

The log shows the most recent 300 lines of the container. It refreshes by itself.

- **Auto refresh** can be switched off with the checkbox. While it is off, **Refresh now** reads the log once.
- The interval can be **1, 5 or 10 seconds** (default 5). Your choice is kept in this browser.
- **Scrolling:** new output only scrolls into view when you are already at the bottom. If you scroll up to read something, the view stays where it is and a **Jump to latest** button appears. Sending a command jumps back to the bottom.

The connect and disconnect lines of RCON are hidden, because every command opens and closes an RCON connection.

## Sending commands

Type a command (without the leading slash) and press **Send**. The server must be online.

Commands are sent through `rcon-cli` inside the container, and the server's reply is shown under the command. Many commands answer only in the log; for those the console says the server sent no reply, so look above.

### When RCON is not reachable

If RCON refuses the connection (an imported server with `enable-rcon=false`, or a different RCON port), the manager types the command into the server's console instead. The console then says so, and the answer appears in the log. If the container has no console input either, the console shows what to enable:

- RCON: `enable-rcon=true` with an `rcon.password` in `server.properties`, or `ENABLE_RCON=true`; or
- console input: start the container with `stdin_open: true`.

Servers created by the manager already have RCON on.

### Commands that switch servers

Administrators can turn off commands that move players to another server. When that setting is on, `server`, `send`, `sendall`, `transfer`, `hub` and `lobby` are refused for users with the message "Administrators have turned off commands that switch servers." The block also applies behind `execute ... run` and with a namespace such as `minecraft:transfer`. Administrators can still run them. See [Platform settings](/docs/platform-settings).

## Speed

Commands go through the Docker socket when it is available, which is much faster than going through Portainer. See [Docker, Portainer and updates](/docs/docker-and-updates).
