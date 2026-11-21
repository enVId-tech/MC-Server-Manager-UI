# Storage and permissions

## Where files live

Server files are stored under `<storage>/<WEBDAV_SERVER_BASE_PATH>/<user>/<server folder>`, and the Minecraft containers bind-mount the same folders.

### Local storage (recommended)

```env
STORAGE_BACKEND=local
LOCAL_STORAGE_PATH=/data/minecraft
```

- Files are read and written directly on the machine, so nothing is sent over the network.
- If the app runs in Docker, mount the folder into the app container at `LOCAL_STORAGE_PATH` and set `LOCAL_STORAGE_HOST_PATH` to the folder's path **on the Docker host**, because that is the path Docker uses for bind mounts.
- The app only touches files inside the storage folder. Paths with `..`, and symlinks pointing outside it, are refused.
- `LOCAL_STORAGE_OWNER=1000:1000` gives created files to the container user (the app has to run as root for this).

### WebDAV

Set `STORAGE_BACKEND=webdav` and the `WEBDAV_*` variables. Files go over the network, so local storage is quicker when the app runs on the same host as Docker.

## Permissions

Minecraft containers start as root, hand their `/data` folder to `CONTAINER_UID:CONTAINER_GID` and then drop to that user, so a server folder created by Docker (owned by root) still works.

If you see `Unable to write eula to /data. Please make sure attached directory is writable by uid=1000` or `AccessDeniedException: /data/server.properties`, either the container was started directly as that user (`CONTAINER_USER_MODE=direct`) or the storage does not allow `chown`. Pick a user that can write the folder.

### Find a free user id

```bash
# the first user ID and group ID of 3000 or higher that nobody on the machine has
echo "uid: $(getent passwd | cut -d: -f3 | sort -n | awk 'BEGIN{n=3000} $1==n{n++} END{print n}')"
echo "gid: $(getent group  | cut -d: -f3 | sort -n | awk 'BEGIN{n=3000} $1==n{n++} END{print n}')"

# every user ID that is taken from 1000 up
getent passwd | awk -F: '$3>=1000 && $3<65534 {print $3, $1}' | sort -n
```

### Test which user can write

```bash
docker run --rm -v /mnt/pool/dataset/minecraft:/data alpine sh -c 'touch /data/.t && echo ok && rm /data/.t'
# as a specific user:
docker run --rm --user 3000:3000 -v /mnt/pool/dataset/minecraft:/data alpine sh -c 'touch /data/.t && echo ok && rm /data/.t'
```

### TrueNAS SCALE

1. Create a user with that UID under **Credentials → Local Users** (untick *Create New Primary Group* if you already made a group with that GID).
2. Set `CONTAINER_UID` and `CONTAINER_GID` to it.
3. Give it the folder: `chown -R <uid>:<gid> /mnt/<pool>/<dataset>/minecraft-servers`.
4. If the dataset uses an ACL (a `+` in `ls -l`), also allow that user in the dataset's permissions. A plain `chown` is not enough when the ACL denies writes.

> [!TIP]
> Typical TrueNAS app users are 568 (the `apps` user) or your own. If neither 1000 nor 568 can write, the folder's owner and ACL decide: use `getfacl` on the folder, and test with the commands above.

## Folders outside the storage folder

Existing servers or a proxy elsewhere on the host must be listed in `IMPORT_SCAN_PATHS` and mounted into the app container. A folder the app cannot see is not detected. See [Existing servers](/docs/existing-servers).
