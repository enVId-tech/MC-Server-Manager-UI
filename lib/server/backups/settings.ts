import dbConnect from '@/lib/db/dbConnect';
import PlatformSettings from '@/lib/objects/PlatformSettings';
import type { IServer } from '@/lib/objects/Server';

export interface BackupDefaults {
    enabled: boolean;
    intervalHours: number;
    keep: number;
}

export const BACKUP_LIMITS = { intervalHours: { min: 1, max: 720 }, keep: { min: 1, max: 100 } } as const;

const FALLBACK: BackupDefaults = { enabled: true, intervalHours: 24, keep: 7 };

function clamp(value: unknown, min: number, max: number, fallback: number): number {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/** The backup rules every server follows unless an administrator gave it its own */
export async function getBackupDefaults(): Promise<BackupDefaults> {
    await dbConnect();
    const settings = await PlatformSettings.findOne({ key: 'platform' }, 'backupEnabled backupIntervalHours backupKeep')
        .lean<{ backupEnabled?: boolean; backupIntervalHours?: number; backupKeep?: number }>();
    return {
        enabled: settings?.backupEnabled ?? FALLBACK.enabled,
        intervalHours: settings?.backupIntervalHours ?? FALLBACK.intervalHours,
        keep: settings?.backupKeep ?? FALLBACK.keep,
    };
}

export async function setBackupDefaults(update: Partial<{ enabled: unknown; intervalHours: unknown; keep: unknown }>): Promise<void> {
    await dbConnect();
    const set: Record<string, unknown> = {};
    if (update.enabled !== undefined) set.backupEnabled = update.enabled === true || update.enabled === 'true' || update.enabled === 1 || update.enabled === '1';
    if (update.intervalHours !== undefined) set.backupIntervalHours = clamp(update.intervalHours, BACKUP_LIMITS.intervalHours.min, BACKUP_LIMITS.intervalHours.max, FALLBACK.intervalHours);
    if (update.keep !== undefined) set.backupKeep = clamp(update.keep, BACKUP_LIMITS.keep.min, BACKUP_LIMITS.keep.max, FALLBACK.keep);
    if (Object.keys(set).length > 0) await PlatformSettings.updateOne({ key: 'platform' }, { $set: set }, { upsert: true });
}

export interface EffectiveBackupPolicy extends BackupDefaults {
    /** Where the rule comes from */
    source: 'default' | 'custom' | 'off';
}

/** What applies to one server: its own policy when it has one, otherwise the platform default */
export function effectivePolicy(server: Pick<IServer, 'backupPolicy'>, defaults: BackupDefaults): EffectiveBackupPolicy {
    const policy = server.backupPolicy;
    if (policy?.mode === 'off') return { enabled: false, intervalHours: defaults.intervalHours, keep: defaults.keep, source: 'off' };
    if (policy?.mode === 'custom') {
        return {
            enabled: true,
            intervalHours: clamp(policy.intervalHours, BACKUP_LIMITS.intervalHours.min, BACKUP_LIMITS.intervalHours.max, defaults.intervalHours),
            keep: clamp(policy.keep, BACKUP_LIMITS.keep.min, BACKUP_LIMITS.keep.max, defaults.keep),
            source: 'custom',
        };
    }
    return { ...defaults, source: 'default' };
}

/** Normalises a policy sent by an administrator */
export function cleanPolicy(input: { mode?: unknown; intervalHours?: unknown; keep?: unknown }): NonNullable<IServer['backupPolicy']> | null {
    if (input.mode === 'default' || input.mode === 'off') return { mode: input.mode };
    if (input.mode !== 'custom') return null;
    return {
        mode: 'custom',
        intervalHours: clamp(input.intervalHours, BACKUP_LIMITS.intervalHours.min, BACKUP_LIMITS.intervalHours.max, 24),
        keep: clamp(input.keep, BACKUP_LIMITS.keep.min, BACKUP_LIMITS.keep.max, 7),
    };
}
