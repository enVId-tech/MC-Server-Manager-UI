# Files and backups

## The file browser

The **Files** tab shows what is really in the server's folder, with breadcrumb navigation and folder browsing. Proxy files are never listed.

- **Uploading** and **editing files directly** are off for every server by default. The server's owner switches them on in the Files tab; administrators always can.
- **Settings files open as forms.** `server.properties`, YAML files (`paper-global.yml`, `spigot.yml`, `purpur.yml` and similar) and JSON files open as a settings form that keeps comments and layout. Every other file opens in a text editor.
- The editor warns you before you leave a page with unsaved changes.

> [!TIP]
> After editing a config file, restart the server for the change to apply. Some plugins can reload their own config; check their documentation.

## Backups

Servers are also backed up automatically on a schedule; see [Automatic backups](/docs/backups).

**Backup** on the dashboard or server page downloads the server as a zip. Proxy data (forwarding secrets, `velocity.toml`, Geyser and Floodgate keys and similar files) is left out on purpose, and the secrets of this installation are blanked wherever they appear in text files, so a backup can be shared safely.

Before a world import the previous world is also moved to `backups/before-world-import-<time>` inside the server folder. See [Worlds](/docs/worlds).

## What users cannot see

Users cannot see, download, back up or change forwarding secrets and similar files, and cannot remove the proxy mods the manager installed. All file routes go through one set of rules. See [Security model](/docs/security).

## Deleting

When a server is deleted the folder is removed if `DELETE_SERVER_FOLDERS=true`; otherwise it is renamed with a `DELETED_` prefix. Imported servers never have their files removed.
