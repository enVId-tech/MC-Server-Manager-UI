# Automatic backups

Every server is backed up automatically. Users can download any backup of their servers; only administrators, in the admin panel, decide how often backups run and how many are kept, and make or delete them.

## What users see

Open a server and choose the **Backups** tab.

- The rule the server follows ("every day, the newest 7 are kept"), the time of the last backup and when the next one is due.
- The list of backups with their date, size and whether they were made automatically or by an administrator.
- A **Download** button on every backup. The download is a zip of the server folder.

The tab has no settings. Users cannot change the schedule, make a backup by hand or delete one, and neither is there a way to do it from a server's own page, even for administrators: everything that changes backups lives in the admin panel. The **Backup** button on the server page still downloads the server as it is right now.

## What a backup leaves out

A backup contains the same files as the server download and never anything that belongs to the proxy network or the platform:

- forwarding secrets, `velocity.toml`, BungeeGuard, Geyser and Floodgate files and keys, and the forwarding mods' configs,
- the proxy settings inside `paper-global.yml`, `spigot.yml` and `server.properties` are switched back to normal (`online-mode`, `bungeecord`, `velocity` enabled) and the RCON password and bind address are blanked,
- the `logs` and `cache` folders, because logs show proxy addresses.

On top of that, the manager looks for the **actual secrets** of this installation (the forwarding secret of every proxy and the server's RCON password) in every text file (`.yml`, `.properties`, `.toml`, `.json`, `.txt`, `.conf` and similar, up to 5 MB) and blanks them wherever they appear, for example in a plugin's config where someone pasted a secret. Jars, worlds and other binary files are copied as they are.

> [!NOTE]
> A backup is meant to be shared and restored safely, not to rebuild the proxy hookup. After restoring files, the manager's **Network** tab sets the forwarding up again.

## Rules (administrators)

Backup rules are changed in **Admin → Backups**, and only there.

### The default for all servers

The **Default rule** card applies to every server without a rule of its own:

| Setting | Default | Meaning |
| --- | --- | --- |
| **Back up servers automatically** | on | Turns the schedule on or off for all servers that follow the default. |
| **Hours between backups** | 24 | From 1 hour to 30 days (720 hours). |
| **Automatic backups kept** | 7 | The newest this many automatic backups per server stay; older ones are deleted. |

### A rule for one server

The **Servers** table lists every server with the rule it follows, its last backup and how many backups it has. **Manage** opens one server, where you choose:

- **Follow the default**,
- **Its own interval and number of copies**, for example every 6 hours keeping 12 for a busy server, or weekly keeping 4 for a quiet one,
- **No automatic backups**.

A server's rule only applies to that server and does not change the default.

### Back up now, download and delete

In the same panel administrators can make a backup at once (**Back up now**), download any backup and delete any backup. Backups made by hand are never deleted automatically, so they stay until an administrator removes them. When a server's rule keeps fewer copies than it has, the oldest automatic ones are removed.

## How it runs

A job inside the app checks every ten minutes which servers are due: the time since the last backup is at least the interval. At most two backups are started per check, so many servers do not all read the disk at once, and a server that has never been backed up is due straight away. If a backup fails, the reason is shown to administrators in the Backups tab and it is tried again after at most an hour.

While a **running** server is copied, the manager asks it (through RCON) to save its world and stop writing (`save-off` and `save-all flush`), and lets it write again (`save-on`) when the zip is complete. A server without RCON is copied as it is, which can catch a chunk mid-write, so such servers are best stopped when they matter.

## Where backups are stored

Backups are zip files in the storage, in `<base path>/.backups/<server id>/`, next to the owner folders and **not inside any server folder**, so a backup never contains other backups and users cannot browse or edit them in the Files tab.

- With **local storage** a backup is written as a stream, so large worlds do not fill memory.
- With **WebDAV** the whole zip is held in memory first, and a backup above 1 GB fails with a message. Use local storage for large servers.

> [!WARNING]
> Backups live on the same storage as the servers. They protect against mistakes, not against losing the disk. Copy the `.backups` folder somewhere else (another disk, another machine) if you need that.

## Deleting a server

When a server is deleted and its files are deleted too (`DELETE_SERVER_FOLDERS=true`, or the server was imported), its backups are deleted with it. If folders are only renamed with a `DELETED_` prefix, the backups stay.

## Restoring

Restoring is manual: download the backup and unzip it. A world can be put back with the **World** tab (see [Worlds](/docs/worlds)); other files can be uploaded in the **Files** tab when uploads are on for the server.

## Turning it off

Switch **Back up servers automatically** off in **Admin → Backups** to stop every server that follows the default, or give single servers the rule **No automatic backups**. Set `BACKGROUND_JOBS=false` to turn off all background jobs, including this one.
