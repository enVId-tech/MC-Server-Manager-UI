/**
 * Looks inside a plugin or mod jar to tell what it is, before it is put into a server.
 */
import AdmZip from 'adm-zip';
import YAML from 'yaml';

export type AddonKind = 'plugin' | 'mod';

export interface JarInfo {
    kind: AddonKind;
    /** plugin: Bukkit family, velocity/bungee: proxy plugins, fabric/quilt/forge/neoforge: mods */
    platform: 'bukkit' | 'velocity' | 'bungee' | 'sponge' | 'fabric' | 'quilt' | 'forge' | 'neoforge';
    name?: string;
    id?: string;
    version?: string;
}

/** Reads the descriptor of a jar. Returns null when it is not a plugin or mod jar */
export function inspectJar(data: Buffer): JarInfo | null {
    if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) return null; // not a zip
    let zip: AdmZip;
    try {
        zip = new AdmZip(data);
    } catch {
        return null;
    }
    const text = (name: string) => zip.getEntry(name)?.getData().toString('utf8');
    const yaml = (name: string) => {
        const raw = text(name);
        if (!raw) return null;
        try { return YAML.parse(raw) as Record<string, unknown>; } catch { return {}; }
    };

    const bukkit = yaml('paper-plugin.yml') ?? yaml('plugin.yml');
    if (bukkit) return { kind: 'plugin', platform: 'bukkit', name: String(bukkit.name ?? ''), id: String(bukkit.name ?? ''), version: bukkit.version === undefined ? undefined : String(bukkit.version) };

    const fabric = text('fabric.mod.json');
    if (fabric) {
        try {
            const json = JSON.parse(fabric) as { id?: string; name?: string; version?: string };
            return { kind: 'mod', platform: 'fabric', name: json.name ?? json.id, id: json.id, version: json.version };
        } catch {
            return { kind: 'mod', platform: 'fabric' };
        }
    }
    const quilt = text('quilt.mod.json');
    if (quilt) {
        try {
            const json = JSON.parse(quilt) as { quilt_loader?: { id?: string; version?: string; metadata?: { name?: string } } };
            return { kind: 'mod', platform: 'quilt', name: json.quilt_loader?.metadata?.name ?? json.quilt_loader?.id, id: json.quilt_loader?.id, version: json.quilt_loader?.version };
        } catch {
            return { kind: 'mod', platform: 'quilt' };
        }
    }
    const modId = (raw: string) => raw.match(/modId\s*=\s*"([^"]+)"/)?.[1];
    const neoforge = text('META-INF/neoforge.mods.toml');
    if (neoforge) return { kind: 'mod', platform: 'neoforge', id: modId(neoforge), name: neoforge.match(/displayName\s*=\s*"([^"]+)"/)?.[1] ?? modId(neoforge), version: neoforge.match(/^\s*version\s*=\s*"([^"$]+)"/m)?.[1] };
    const forge = text('META-INF/mods.toml');
    if (forge) return { kind: 'mod', platform: 'forge', id: modId(forge), name: forge.match(/displayName\s*=\s*"([^"]+)"/)?.[1] ?? modId(forge), version: forge.match(/^\s*version\s*=\s*"([^"$]+)"/m)?.[1] };
    if (zip.getEntry('mcmod.info')) return { kind: 'mod', platform: 'forge' };

    if (zip.getEntry('velocity-plugin.json')) return { kind: 'plugin', platform: 'velocity' };
    if (zip.getEntry('bungee.yml')) return { kind: 'plugin', platform: 'bungee' };
    if (zip.getEntry('META-INF/sponge_plugins.json')) return { kind: 'plugin', platform: 'sponge' };
    return null;
}
