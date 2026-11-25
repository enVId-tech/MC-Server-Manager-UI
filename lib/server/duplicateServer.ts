import crypto from 'crypto';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dbConnect from '@/lib/db/dbConnect';
import Server, { type IServer } from '@/lib/objects/Server';
import type { IUser } from '@/lib/objects/User';
import type { ServerConfigData } from '@/lib/objects/ServerConfig';
import portainer from '@/lib/server/portainer';
import serverStorage from '@/lib/server/storage';
import MinecraftServerManager from '@/lib/server/serverManager';
import { createMinecraftServerFromRecord } from '@/lib/server/minecraft';
import { getContainerName } from '@/lib/server/containerNames';
import { buildServerHostname, getServerDomain } from '@/lib/config/domain';
import { getFolderNaming, listTakenFolderNames, literalFolderName, pickFolderName } from '@/lib/server/folderNaming';
import { getServerBasePath, getServerFolderPath } from '@/lib/server/serverPaths';
import { publicSubdomain, subdomainLabel } from '@/lib/server/subdomain';
import { findServerForUser } from '@/lib/server/access';
import { setProperties } from '@/lib/server/network/backend';
import { planServerNetwork, syncServerNetwork } from '@/lib/server/network/service';
import { adoptExistingProxies } from '@/lib/server/network/proxyManagement';
import { computeMemoryMb, getPlatformSettings } from '@/lib/server/memory';
import { getServerType } from '@/lib/data/itzg';

const SUBDOMAIN_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKIP_BASENAMES = new Set(['session.lock', '.ds_store', 'thumbs.db']);
const SKIP_EXTENSIONS = ['.lck', '.pid'];
const COPY_CONCURRENCY = 6;

export interface DuplicateServerInput {
    sourceId: string;
    user: IUser;
    name: string;
    subdomain: string;
    startAfterCreate?: boolean;
}

export interface DuplicateSuggestion {
    suggestedName: string;
    suggestedSubdomain: string;
    serverDomain: string;
    sourceName: string;
    sourceAddress: string;
}

export interface DuplicateServerResult {
    uniqueId: string;
    serverName: string;
    subdomainName: string;
    folderPath: string;
    port: number;
    rconPort?: number;
    serverType: string;
    version: string;
    maxPlayers: number;
    isOnline: boolean;
}

export class DuplicateValidationError extends Error {
    public readonly status: number;

    public constructor(message: string, status: number = 400) {
        super(message);
        this.name = 'DuplicateValidationError';
        this.status = status;
    }
}

export function leafFolderName(folderPath: string | null | undefined): string {
    if (!folderPath) return '';
    return folderPath.split(/[\\/]/).filter(Boolean).pop() ?? '';
}

function shouldSkipCopy(basename: string): boolean {
    const lower = basename.toLowerCase();
    if (SKIP_BASENAMES.has(lower)) return true;
    if (SKIP_EXTENSIONS.some(ext => lower.endsWith(ext))) return true;
    if (/^docker-compose.*\.ya?ml$/.test(lower)) return true;
    return false;
}

/**
 * Checks whether a candidate display name would duplicate an existing server's name or folder name.
 */
export function hasNameOrFolderCollision(
    candidateName: string,
    existingServerNames: Iterable<string>,
    existingFolderNames: Iterable<string>
): { conflict: boolean; reason?: string } {
    const trimmed = candidateName.trim();
    const lowerName = trimmed.toLowerCase();
    const folderFromName = literalFolderName(trimmed).toLowerCase();

    const nameSet = new Set([...existingServerNames].map(name => name.trim().toLowerCase()).filter(Boolean));
    if (nameSet.has(lowerName)) {
        return { conflict: true, reason: `A server named "${trimmed}" already exists.` };
    }

    const folderSet = new Set([...existingFolderNames].map(folder => folder.trim().toLowerCase()).filter(Boolean));
    if (folderSet.has(lowerName) || folderSet.has(folderFromName)) {
        return { conflict: true, reason: `The name "${trimmed}" conflicts with an existing server folder name.` };
    }

    return { conflict: false };
}

/** Suggests a unique display name (and non-colliding folder name) for a duplicated server. */
export function suggestDuplicateName(
    sourceName: string,
    existingServerNames: Iterable<string>,
    existingFolderNames: Iterable<string>
): string {
    const base = sourceName.trim() || 'Server';
    const nameList = [...existingServerNames];
    const folderList = [...existingFolderNames];

    const candidates = [
        `${base.slice(0, 43).trimEnd()} (Copy)`,
        ...Array.from({ length: 99 }, (_, index) => {
            const suffix = ` (Copy ${index + 2})`;
            return `${base.slice(0, Math.max(1, 50 - suffix.length)).trimEnd()}${suffix}`;
        }),
    ];

    for (const candidate of candidates) {
        if (!hasNameOrFolderCollision(candidate, nameList, folderList).conflict) {
            return candidate;
        }
    }

    return `Server Copy ${crypto.randomBytes(2).toString('hex')}`;
}

/** Suggests a valid, unused subdomain label different from the original server's address. */
export function suggestDuplicateSubdomain(
    sourceLabelOrName: string,
    takenSubdomainLabels: Iterable<string>
): string {
    const taken = new Set([...takenSubdomainLabels].map(item => item.trim().toLowerCase()).filter(Boolean));
    const rawSlug = sourceLabelOrName
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32)
        .replace(/-+$/g, '');
    const base = rawSlug || 'server';

    const first = `${base}-copy`;
    if (SUBDOMAIN_REGEX.test(first) && !taken.has(first)) return first;

    for (let i = 2; i <= 200; i++) {
        const candidate = `${base}-copy-${i}`;
        if (SUBDOMAIN_REGEX.test(candidate) && !taken.has(candidate)) return candidate;
    }

    return `${base}-${crypto.randomBytes(2).toString('hex')}`;
}

/** Updates copied server.properties so the cloned container uses internal port 25565 and clears bound IP overrides. */
export function prepareDuplicateServerProperties(rawContent: string, options: { rconEnabled: boolean }): string {
    const updates: Record<string, string> = {
        'server-port': '25565',
        'server-ip': '',
    };
    if (options.rconEnabled) {
        updates['rcon.port'] = '25575';
    }
    return setProperties(rawContent, updates);
}

/** Recursively copies a server directory through the active storage backend, skipping runtime lock/compose files. */
export async function copyServerDirectory(sourceFolder: string, targetFolder: string): Promise<number> {
    await serverStorage.createDirectory(targetFolder);

    const filesToCopy: Array<{ source: string; target: string }> = [];
    const queue: Array<{ srcDir: string; dstDir: string }> = [{ srcDir: sourceFolder, dstDir: targetFolder }];

    while (queue.length > 0) {
        const current = queue.shift()!;
        const entries = await serverStorage.getDirectoryContents(current.srcDir);

        for (const entry of entries) {
            if (shouldSkipCopy(entry.basename)) continue;

            const srcChild = entry.filename || path.posix.join(current.srcDir, entry.basename);
            const dstChild = path.posix.join(current.dstDir, entry.basename);

            if (entry.type === 'directory') {
                await serverStorage.createDirectory(dstChild);
                queue.push({ srcDir: srcChild, dstDir: dstChild });
            } else {
                filesToCopy.push({ source: srcChild, target: dstChild });
            }
        }
    }

    let copied = 0;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(COPY_CONCURRENCY, Math.max(1, filesToCopy.length)) }, async () => {
        while (cursor < filesToCopy.length) {
            const item = filesToCopy[cursor++];
            const data = await serverStorage.getFileContents(item.source);
            await serverStorage.uploadFile(item.target, data, true);
            copied++;
        }
    });

    await Promise.all(workers);
    return copied;
}

async function pauseSourceSaving(server: IServer, environmentId: number): Promise<() => Promise<void>> {
    const noop = async () => undefined;
    try {
        const container = await portainer.getContainerByIdentifier(getContainerName(server), environmentId);
        if (!container || container.State !== 'running') return noop;
        const rcon = (command: string) => portainer.executeCommand(container.Id, `rcon-cli ${command}`, environmentId);
        const off = await rcon('save-off');
        if (off.exitCode !== 0) return noop;
        await rcon('save-all flush').catch(() => undefined);
        return async () => {
            await rcon('save-on').catch(() => undefined);
        };
    } catch {
        return noop;
    }
}

async function collectExistingIdentifiers(ownerFolder: string) {
    const records = await Server.find({}, 'serverName folderPath subdomainName extraHostnames').lean<Array<{
        serverName?: string;
        folderPath?: string;
        subdomainName?: string;
        extraHostnames?: string[];
    }>>();

    const existingServerNames: string[] = [];
    const existingFolderNames = new Set<string>(await listTakenFolderNames(ownerFolder));
    const takenSubdomains = new Set<string>();

    for (const record of records) {
        if (record.serverName) existingServerNames.push(record.serverName);
        const leaf = leafFolderName(record.folderPath);
        if (leaf) existingFolderNames.add(leaf);
        if (record.subdomainName) {
            const label = subdomainLabel(record.subdomainName);
            if (label) takenSubdomains.add(label);
        }
        for (const extra of record.extraHostnames ?? []) {
            const label = subdomainLabel(extra);
            if (label) takenSubdomains.add(label);
        }
    }

    return {
        existingServerNames,
        existingFolderNames: [...existingFolderNames],
        takenSubdomains: [...takenSubdomains],
    };
}

/** Returns pre-filled, collision-free name and address suggestions for duplicating a server. */
export async function getDuplicateSuggestions(sourceId: string, user: IUser): Promise<DuplicateSuggestion> {
    await dbConnect();
    const source = await findServerForUser(user, sourceId);
    if (!source) {
        throw new DuplicateValidationError('Server not found or access denied.', 404);
    }
    if (source.kind === 'proxy') {
        throw new DuplicateValidationError('Proxies cannot be duplicated.', 400);
    }

    const baseServerPath = getServerBasePath();
    const userFolder = user.email.split('@')[0] || 'default-user';
    const ownerFolder = `${baseServerPath}/${userFolder}`;
    const { existingServerNames, existingFolderNames, takenSubdomains } = await collectExistingIdentifiers(ownerFolder);

    const sourceLabel = subdomainLabel(source.subdomainName) || source.serverName;

    return {
        suggestedName: suggestDuplicateName(source.serverName, existingServerNames, existingFolderNames),
        suggestedSubdomain: suggestDuplicateSubdomain(sourceLabel, takenSubdomains),
        serverDomain: getServerDomain(),
        sourceName: source.serverName,
        sourceAddress: publicSubdomain(source.subdomainName),
    };
}

/**
 * Duplicates a game server: creates a unique name/folder, allocates a distinct IP/subdomain and ports,
 * copies server files (worlds, configs, plugins, mods), deploys a new container stack, and links proxies.
 */
export async function duplicateServer(input: DuplicateServerInput): Promise<DuplicateServerResult> {
    await dbConnect();
    const { user, sourceId } = input;
    const rollbackActions: Array<() => Promise<void>> = [];

    try {
        if (!user.isAdmin) {
            const ownedCount = await Server.countDocuments({ email: user.email, kind: { $ne: 'proxy' } });
            if (ownedCount >= user.maxServers) {
                throw new DuplicateValidationError(
                    `You have reached your limit of ${user.maxServers} server${user.maxServers === 1 ? '' : 's'}. Delete a server or ask an administrator to raise your limit.`,
                    403
                );
            }
        }

        const source = await findServerForUser(user, sourceId);
        if (!source) {
            throw new DuplicateValidationError('Server not found or access denied.', 404);
        }
        if (source.kind === 'proxy') {
            throw new DuplicateValidationError('Proxies cannot be duplicated.', 400);
        }

        const trimmedName = input.name.trim();
        if (!trimmedName) {
            throw new DuplicateValidationError('Server name is required.', 400);
        }
        if (trimmedName.length > 50) {
            throw new DuplicateValidationError('Server name cannot exceed 50 characters.', 400);
        }
        if (/[\r\n\0]/.test(trimmedName)) {
            throw new DuplicateValidationError('Server name contains invalid characters.', 400);
        }

        const normalizedSubdomain = input.subdomain.trim().toLowerCase();
        if (!normalizedSubdomain || !SUBDOMAIN_REGEX.test(normalizedSubdomain)) {
            throw new DuplicateValidationError('Invalid subdomain format. Only lowercase letters, numbers, and hyphens are allowed.', 400);
        }

        const fullSubdomain = buildServerHostname(normalizedSubdomain);
        if (fullSubdomain === source.subdomainName?.toLowerCase()) {
            throw new DuplicateValidationError('The duplicated server must use a different IP/address than the original server.', 400);
        }

        const subdomainValidation = await MinecraftServerManager.validateSubdomain(normalizedSubdomain, user.email);
        if (!subdomainValidation.isValid) {
            throw new DuplicateValidationError(subdomainValidation.error || 'Subdomain is not available.', 400);
        }

        const baseServerPath = getServerBasePath();
        const userFolder = user.email.split('@')[0] || 'default-user';
        const ownerFolder = `${baseServerPath}/${userFolder}`;
        const { existingServerNames, existingFolderNames } = await collectExistingIdentifiers(ownerFolder);

        const nameCheck = hasNameOrFolderCollision(trimmedName, existingServerNames, existingFolderNames);
        if (nameCheck.conflict) {
            throw new DuplicateValidationError(nameCheck.reason!, 400);
        }

        // Resolve Portainer environment
        let environmentId: number;
        try {
            const environments = await portainer.getEnvironments();
            if (environments.length === 0) {
                throw new DuplicateValidationError('No Portainer environments found. Duplication requires Portainer.', 503);
            }
            const envId = source.environmentId && environments.some(e => e.Id === source.environmentId)
                ? source.environmentId
                : environments[0].Id;
            environmentId = envId;
            portainer.DefaultEnvironmentId = envId;
        } catch (error) {
            if (error instanceof DuplicateValidationError) throw error;
            throw new DuplicateValidationError(
                `Unable to connect to Portainer: ${error instanceof Error ? error.message : 'Unknown error'}`,
                503
            );
        }

        const sourceConfig = ((source.serverConfig ?? {}) as unknown as Record<string, unknown>);
        const needsRcon = Boolean(sourceConfig.rconEnabled);
        const portAllocation = await MinecraftServerManager.allocatePort(user.email, needsRcon, environmentId);
        if (!portAllocation.success || !portAllocation.port) {
            throw new Error(portAllocation.error || 'Failed to allocate a free port for the duplicated server.');
        }

        const allocatedPort = portAllocation.port;
        const allocatedRconPort = portAllocation.rconPort;

        const uniqueId = uuidv4();
        const folderNaming = await getFolderNaming();
        const folderName = pickFolderName({
            mode: folderNaming,
            uniqueId,
            serverName: trimmedName,
            taken: existingFolderNames,
        });

        const existingFolderSet = new Set(existingFolderNames.map(item => item.toLowerCase()));
        if (existingFolderSet.has(folderName.toLowerCase())) {
            throw new DuplicateValidationError(`The folder name "${folderName}" already exists.`, 400);
        }

        const targetFolderPath = `${ownerFolder}/${folderName}`;
        const sourceFolderPath = getServerFolderPath(source, source.email);

        if (targetFolderPath.toLowerCase() === sourceFolderPath.toLowerCase()) {
            throw new DuplicateValidationError('Duplicated server folder cannot match the source server folder.', 400);
        }

        // Copy files safely (pausing world writes briefly if source is running)
        const sourceExists = await serverStorage.exists(sourceFolderPath);
        if (!sourceExists) {
            throw new DuplicateValidationError('Source server folder could not be found in storage.', 404);
        }

        const resumeSourceSaving = await pauseSourceSaving(source, environmentId);
        try {
            await copyServerDirectory(sourceFolderPath, targetFolderPath);
        } finally {
            await resumeSourceSaving();
        }

        rollbackActions.push(async () => {
            await serverStorage.deleteDirectoryRecursively(targetFolderPath).catch(() => undefined);
        });

        // Normalize server.properties in the copied directory so internal container port is 25565 and IP is unbound
        const propsPath = `${targetFolderPath}/server.properties`;
        if (await serverStorage.exists(propsPath)) {
            const currentProps = (await serverStorage.getFileContents(propsPath)).toString('utf-8');
            const updatedProps = prepareDuplicateServerProperties(currentProps, { rconEnabled: needsRcon });
            await serverStorage.uploadFile(propsPath, updatedProps, true);
        } else {
            await serverStorage.uploadFile(propsPath, '# Minecraft server properties\nserver-port=25565\n', true);
        }

        const eulaPath = `${targetFolderPath}/eula.txt`;
        if (!(await serverStorage.exists(eulaPath))) {
            await serverStorage.uploadFile(eulaPath, 'eula=true\n', true);
        }

        // Build clean configuration for the duplicated server
        const rawProps = (sourceConfig.serverProperties && typeof sourceConfig.serverProperties === 'object')
            ? { ...(sourceConfig.serverProperties as Record<string, string | number | boolean>) }
            : {};
        delete rawProps['server-port'];
        delete rawProps['server-ip'];
        delete rawProps['rcon.port'];
        delete rawProps['query.port'];

        const serverTypeDef = getServerType(String(sourceConfig.serverType ?? 'vanilla')) ?? getServerType('vanilla')!;
        const memorySettings = await getPlatformSettings();
        const memoryMb = Number(sourceConfig.serverMemory) >= 512
            ? Math.round(Number(sourceConfig.serverMemory))
            : computeMemoryMb({
                serverType: serverTypeDef.id,
                plugins: 0,
                mods: 0,
                players: Number(sourceConfig.maxPlayers) || 20,
            }, memorySettings);

        const duplicatedConfig: ServerConfigData = {
            name: trimmedName,
            serverType: String(sourceConfig.serverType || serverTypeDef.id),
            version: String(sourceConfig.version || 'LATEST'),
            description: String(sourceConfig.description || ''),
            seed: String(sourceConfig.seed || ''),
            gameMode: String(sourceConfig.gameMode || 'survival'),
            difficulty: String(sourceConfig.difficulty || 'normal'),
            worldType: String(sourceConfig.worldType || 'default'),
            worldGeneration: String(sourceConfig.worldGeneration || 'new'),
            worldFile: null,
            maxPlayers: Number(sourceConfig.maxPlayers) || 20,
            whitelistEnabled: Boolean(sourceConfig.whitelistEnabled),
            onlineMode: sourceConfig.onlineMode !== undefined ? Boolean(sourceConfig.onlineMode) : true,
            pvpEnabled: sourceConfig.pvpEnabled !== undefined ? Boolean(sourceConfig.pvpEnabled) : true,
            commandBlocksEnabled: Boolean(sourceConfig.commandBlocksEnabled),
            flightEnabled: Boolean(sourceConfig.flightEnabled),
            spawnAnimalsEnabled: sourceConfig.spawnAnimalsEnabled !== undefined ? Boolean(sourceConfig.spawnAnimalsEnabled) : true,
            spawnMonstersEnabled: sourceConfig.spawnMonstersEnabled !== undefined ? Boolean(sourceConfig.spawnMonstersEnabled) : true,
            spawnNpcsEnabled: sourceConfig.spawnNpcsEnabled !== undefined ? Boolean(sourceConfig.spawnNpcsEnabled) : true,
            generateStructuresEnabled: sourceConfig.generateStructuresEnabled !== undefined ? Boolean(sourceConfig.generateStructuresEnabled) : true,
            port: allocatedPort,
            viewDistance: Number(sourceConfig.viewDistance) || 10,
            simulationDistance: Number(sourceConfig.simulationDistance) || 10,
            spawnProtection: sourceConfig.spawnProtection !== undefined ? Number(sourceConfig.spawnProtection) : 16,
            rconEnabled: needsRcon,
            rconPassword: needsRcon ? crypto.randomBytes(12).toString('hex') : '',
            motd: String(sourceConfig.motd || 'A Minecraft Server'),
            resourcePackUrl: String(sourceConfig.resourcePackUrl || ''),
            resourcePackSha1: String(sourceConfig.resourcePackSha1 || ''),
            resourcePackPrompt: String(sourceConfig.resourcePackPrompt || ''),
            forceResourcePack: Boolean(sourceConfig.forceResourcePack),
            enableJmxMonitoring: Boolean(sourceConfig.enableJmxMonitoring),
            syncChunkWrites: sourceConfig.syncChunkWrites !== undefined ? Boolean(sourceConfig.syncChunkWrites) : true,
            enforceWhitelist: Boolean(sourceConfig.enforceWhitelist),
            preventProxyConnections: Boolean(sourceConfig.preventProxyConnections),
            hideOnlinePlayers: Boolean(sourceConfig.hideOnlinePlayers),
            broadcastRconToOps: sourceConfig.broadcastRconToOps !== undefined ? Boolean(sourceConfig.broadcastRconToOps) : true,
            broadcastConsoleToOps: sourceConfig.broadcastConsoleToOps !== undefined ? Boolean(sourceConfig.broadcastConsoleToOps) : true,
            serverMemory: memoryMb,
            memoryMode: sourceConfig.memoryMode === 'manual' ? 'manual' : 'auto',
            folderNaming,
            subdomain: normalizedSubdomain,
            serverProperties: rawProps,
            itzgEnv: (sourceConfig.itzgEnv && typeof sourceConfig.itzgEnv === 'object')
                ? { ...(sourceConfig.itzgEnv as Record<string, string | number | boolean>) }
                : {},
            plugins: [],
            mods: [],
            addons: [],
            fileAccess: { uploads: false, editing: false },
        };

        const networkPlan = await planServerNetwork({
            serverConfig: duplicatedConfig,
            port: allocatedPort,
        });

        const newServer = new Server({
            email: user.email,
            uniqueId,
            subdomainName: fullSubdomain,
            subdomainSource: 'chosen',
            isOnline: false,
            folderPath: targetFolderPath,
            serverName: trimmedName,
            port: allocatedPort,
            rconPort: allocatedRconPort,
            environmentId,
            proxyIds: source.proxyIds ?? [],
            imported: false,
            managedFiles: source.managedFiles,
            network: {
                links: [],
                warnings: [],
                forwarding: networkPlan.forwarding ?? 'none',
            },
            createdAt: new Date(),
            lastDeploymentStatus: 'running',
            serverConfig: duplicatedConfig,
        });

        await newServer.save();
        rollbackActions.push(async () => {
            await Server.deleteOne({ uniqueId }).catch(() => undefined);
        });

        // Deploy dedicated stack + container (`mc-${uniqueId}`)
        const mcServer = createMinecraftServerFromRecord(newServer, environmentId, user.email);
        const deployResult = await mcServer.deployToPortainer();
        if (!deployResult.success) {
            throw new Error(deployResult.error || 'Failed to deploy duplicated server container.');
        }

        rollbackActions.push(async () => {
            const stacks = await portainer.getStacks().catch(() => []);
            const stack = stacks.find(item => item.Name === `minecraft-${uniqueId}`);
            if (stack) await portainer.deleteStack(stack.Id, environmentId).catch(() => undefined);
        });

        // Link to proxies and reload proxies safely without kicking existing players
        try {
            await adoptExistingProxies(user.email).catch(() => []);
            await syncServerNetwork(newServer, {
                reload: true,
                restart: false,
                environmentId,
            });
        } catch (networkError) {
            console.warn(`[Duplicate] Proxy network sync warning for ${uniqueId}:`, networkError);
        }

        const shouldStart = input.startAfterCreate === true;
        if (!shouldStart) {
            try {
                const container = await portainer.getContainerByIdentifier(getContainerName(newServer), environmentId);
                if (container && ['running', 'restarting'].includes(container.State)) {
                    await portainer.stopContainer(container.Id, environmentId, 15);
                }
            } catch (stopError) {
                console.warn(`[Duplicate] Could not stop new container ${uniqueId} after creation:`, stopError);
            }
        }

        await Server.updateOne(
            { uniqueId },
            {
                $set: {
                    isOnline: shouldStart,
                    lastDeploymentStatus: 'success',
                    deployedAt: new Date(),
                },
            }
        );

        return {
            uniqueId,
            serverName: trimmedName,
            subdomainName: fullSubdomain,
            folderPath: targetFolderPath,
            port: allocatedPort,
            rconPort: allocatedRconPort,
            serverType: duplicatedConfig.serverType,
            version: duplicatedConfig.version,
            maxPlayers: duplicatedConfig.maxPlayers,
            isOnline: shouldStart,
        };
    } catch (error) {
        for (const rollback of rollbackActions.reverse()) {
            await rollback().catch(() => undefined);
        }
        throw error;
    }
}
