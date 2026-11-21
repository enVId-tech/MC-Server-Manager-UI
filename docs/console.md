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

### Suggestions and Tab

The command line suggests like the game does. Nothing is sent when you pick a suggestion; it only fills in the line.

- **Commands:** as you type, the commands that fit are listed, those that start with your letters first, then those that contain them. The list follows the **version** and **kind** of the server: `tick` is only offered from 1.20.3, `damage` from 1.19.4, and Paper, Purpur, Forge and the proxies add their own commands (`plugins`, `timings`, `tps`, `forge`, `server`, `send` and so on). A proxy console only lists proxy commands.
- **Arguments:** after a space the list moves on to the arguments of that command, and the arguments after it. `give @a dia` lists items such as `minecraft:diamond`; `gamerule keepInventory ` offers `true` and `false`; `time set ` offers `day`, `night`, `noon`, `midnight` and typical numbers. Items, blocks, entities, effects, enchantments and game rules are checked against the version as well.
- **Targets:** wherever a command takes a target, the list has the players and the selectors (`@a`, `@e`, `@p`, `@r`, `@s`, and `@n` from 1.21). The players are the ones online now, then those who appear in the log. Selector arguments complete as well, for example `@e[type=pig` and `@a[sort=`.
- **`execute`:** its subcommands are followed (`as`, `at`, `positioned`, `if`, `unless`, `store` and the others), and after `run` the line starts over as a command.
- **Choosing:** press **Tab** to fill in the first suggestion and **Tab** again for the next one (**Shift+Tab** goes back). The **up** and **down arrows** walk the same list. Both work until you press **space**, which moves on to the next argument. You can also click a suggestion. **Esc** closes the list.
- When an argument cannot be listed (a count, coordinates, a message) the line shows what it expects, such as `<message>`.

The lists hold what is typed most; any other command or name can still be typed by hand and sent. Commands that come from plugins and mods are not listed unless they are in the table above.

### Earlier commands

With nothing in the command line, the **up arrow** brings back the command you sent before, again for the one before that, and the **down arrow** moves toward the newest. Once you type something, the arrows go back to the list of suggestions (or do nothing when there is none). The last 100 commands are kept per server in this browser.

### When RCON is not reachable

If RCON refuses the connection (an imported server with `enable-rcon=false`, or a different RCON port), the manager types the command into the server's console instead. The console then says so, and the answer appears in the log. If the container has no console input either, the console shows what to enable:

- RCON: `enable-rcon=true` with an `rcon.password` in `server.properties`, or `ENABLE_RCON=true`; or
- console input: start the container with `stdin_open: true`.

Servers created by the manager already have RCON on.

### Commands that switch servers

Administrators can turn off commands that move players to another server. When that setting is on, `server`, `send`, `sendall`, `transfer`, `hub` and `lobby` are refused for users with the message "Administrators have turned off commands that switch servers." The block also applies behind `execute ... run` and with a namespace such as `minecraft:transfer`. Administrators can still run them. See [Platform settings](/docs/platform-settings).

## Speed

Commands go through the Docker socket when it is available, which is much faster than going through Portainer. See [Docker, Portainer and updates](/docs/docker-and-updates).
