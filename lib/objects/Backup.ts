import pkg from 'mongoose';

/** One backup zip of a server. The file itself is in the storage, see lib/server/backups/service.ts */
export interface IBackup extends pkg.Document {
    /** uniqueId of the server */
    serverId: string;
    serverName: string;
    /** Email of the server's owner at the time, so a user only lists their own */
    ownerEmail: string;
    /** 'auto' by the schedule, 'manual' made by an administrator */
    kind: 'auto' | 'manual';
    fileName: string;
    /** Storage path of the zip */
    path: string;
    sizeBytes: number;
    createdAt: Date;
}

const BackupSchema = new pkg.Schema({
    serverId: { type: String, required: true, index: true },
    serverName: { type: String, required: true },
    ownerEmail: { type: String, required: true },
    kind: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    fileName: { type: String, required: true },
    path: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } });

const Backup = pkg.models.backup || pkg.model<IBackup>('backup', BackupSchema);
export default Backup;
