# Worlds

A world is uploaded as a `.zip` when creating a server, or later from the **World** tab. The server must be stopped for a later upload, and uploads must be on for the server (administrators always may).

## How the world is checked

The world is read before it is used and sorted into one of three groups:

1. before 1.17,
2. 1.17 to 1.21.x,
3. 26.1 and newer (26.1 moved the dimensions into their own folder).

## What is safe

| Change | Result |
| --- | --- |
| Upgrade inside a group, or to a newer version | Works. The server converts the world the first time it loads it. **Keep a copy of the original.** |
| Downgrade inside a group | **Not supported.** A red warning explains why and the import only goes ahead after you tick the box. Chunks can be damaged, blocks and items can disappear, and the world may not load. |
| Move across 1.17 or 26.1, either direction | Refused. |

> [!WARNING]
> Downgrading a world can destroy it. Take a backup first. See [Files and backups](/docs/files-and-backups).

## What is copied

Only world files are copied, never symlinks. The previous world is moved to `backups/before-world-import-<time>` in the server folder, so you can put it back. The largest accepted zip is set by `MAX_WORLD_UPLOAD_MB` (4096 by default).
