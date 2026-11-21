import pkg from 'mongoose';
import type { BalancingStrategy } from '@/lib/server/network/versions';

export interface INetworkSettings extends pkg.Document {
    key: string;
    /** How servers are spread over proxies that can all serve them */
    strategy: BalancingStrategy;
    /** Players are never moved to another server when theirs stops. Turning this off keeps the proxy's `try` list as it is */
    noFallback: boolean;
    /** Install ViaVersion, ViaBackwards and ViaRewind on servers when the proxy has them */
    mirrorViaPlugins: boolean;
}

const NetworkSettingsSchema = new pkg.Schema({
    key: { type: String, required: true, unique: true, default: 'network' },
    strategy: { type: String, enum: ['all', 'balanced', 'priority'], default: 'all' },
    noFallback: { type: Boolean, default: true },
    mirrorViaPlugins: { type: Boolean, default: true },
}, { timestamps: true });

const NetworkSettings = pkg.models.networksettings || pkg.model<INetworkSettings>('networksettings', NetworkSettingsSchema);
export default NetworkSettings;
