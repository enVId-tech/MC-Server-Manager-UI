'use client';

import React, { useEffect, useState } from 'react';
import styles from './create-main.module.scss';

export interface NetworkPlan {
    isAdmin: boolean;
    hasProxy: boolean;
    minVersion: string | null;
    allowed: boolean;
    wouldBeAllowed: boolean;
    reason?: string;
    forwarding?: 'modern' | 'bungeeguard' | 'legacy' | 'none' | null;
    proxyCount?: number;
    viaPlugins?: boolean;
    bedrock: boolean;
}

const FORWARDING: Record<string, string> = {
    modern: 'modern forwarding',
    bungeeguard: 'BungeeGuard forwarding',
    legacy: 'legacy forwarding',
};

interface Props {
    version: string;
    onPlan: (plan: NetworkPlan | null) => void;
}

/** What the proxy network means for the server being created: where it will join, and what will not work */
export default function NetworkPanel({ version, onPlan }: Props) {
    const [plan, setPlan] = useState<NetworkPlan | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            fetch(`/api/network?version=${encodeURIComponent(version || 'LATEST')}`, { signal: controller.signal })
                .then(response => (response.ok ? response.json() : null))
                .then((data: NetworkPlan | null) => {
                    setPlan(data);
                    onPlan(data);
                })
                .catch(() => undefined);
        }, 250);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [version, onPlan]);

    if (!plan) return null;

    const exposure = 'It will most likely not be joinable unless its port is forwarded or exposed to the internet.';
    return (
        <div className={styles.networkPanel}>
            <h3>Network</h3>
            {!plan.hasProxy && (
                <p className={styles.networkWarning}>
                    No proxy is set up yet. {exposure}
                    {plan.isAdmin ? ' Create one in the admin panel under Proxies.' : ' Ask an administrator to add one.'}
                </p>
            )}
            {plan.hasProxy && !plan.isAdmin && plan.allowed && (
                <p>This server joins the network automatically. Players connect through the address shown on the server dashboard.</p>
            )}
            {plan.hasProxy && plan.isAdmin && plan.forwarding && (
                <p>
                    Joins {plan.proxyCount === 1 ? 'the proxy' : `${plan.proxyCount} proxies`} with {FORWARDING[plan.forwarding] ?? plan.forwarding}. Players connect through the proxy address of this server, online mode is handled by the proxy and cannot be changed.
                </p>
            )}
            {plan.hasProxy && (plan.isAdmin ? (!plan.forwarding && plan.allowed) : !plan.allowed) && (
                <p className={styles.networkWarning}>
                    {plan.reason ?? 'No proxy supports this version.'} {plan.isAdmin ? `You can still create it as an administrator. ${exposure}` : ''}
                </p>
            )}
            {plan.hasProxy && !plan.allowed && plan.isAdmin && (
                <p className={styles.networkWarning}>
                    {plan.reason ?? 'This version is not supported by the single Velocity modern proxy.'}
                </p>
            )}
            {plan.minVersion && plan.hasProxy && (
                <p className={styles.networkHint}>Only Minecraft {plan.minVersion} and newer can be chosen.</p>
            )}
            {plan.isAdmin && plan.forwarding && plan.viaPlugins && (
                <p className={styles.networkHint}>The proxy runs ViaVersion, ViaBackwards or ViaRewind. A copy is installed on this server too, so you can use it if you like.</p>
            )}
            {plan.bedrock && plan.allowed && (
                <p className={styles.networkHint}>Bedrock players can join through Geyser. The addresses appear on the server dashboard.</p>
            )}
        </div>
    );
}
