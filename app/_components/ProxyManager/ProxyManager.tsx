/**
 * Multi-Proxy Management Component
 * Provides interface for managing multiple proxy types and deploying servers across them
 */

'use client';

import React, { useState, useEffect } from 'react';
import styles from './ProxyManager.module.scss';

// Types
interface ProxyInstanceConfig {
    id: string;
    name: string;
    type: 'velocity' | 'bungeecord' | 'waterfall' | 'rusty-connector';
    host: string;
    port: number;
    enabled: boolean;
    priority: number;
    configPath: string;
    networkName?: string;
    description?: string;
    tags: string[];
    capabilities: ProxyCapability[];
    maxServers?: number;
    currentServers?: number;
    lastHealthCheck?: Date;
    healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}

interface ProxyCapability {
    name: string;
    supported: boolean;
    version?: string;
    notes?: string;
}

interface ProxyStatistics {
    totalProxies: number;
    enabledProxies: number;
    proxyTypes: { [type: string]: number };
    healthStatus: { [status: string]: number };
}

interface MultiProxyManagerProps {
    serverId?: string;
    onProxyDeployment?: (result: {
        success: boolean;
        results: Record<string, { success: boolean; error?: string; details: string[] }>;
        overallDetails: string[];
        primaryProxy?: string;
        fallbackProxies: string[];
    }) => void;
}

export const MultiProxyManager: React.FC<MultiProxyManagerProps> = ({
    serverId,
    onProxyDeployment
}) => {
    const [proxies, setProxies] = useState<ProxyInstanceConfig[]>([]);
    const [statistics, setStatistics] = useState<ProxyStatistics | null>(null);
    const [selectedProxies, setSelectedProxies] = useState<string[]>([]);
    const [deploymentStrategy, setDeploymentStrategy] = useState<string>('priority');
    const [isLoading, setIsLoading] = useState(false);
    const [healthStatus, setHealthStatus] = useState<{
        overall: 'healthy' | 'degraded' | 'unhealthy';
        proxies: Record<string, { status: string; details: string[] }>;
    } | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'deploy' | 'health' | 'config'>('overview');

    // Load initial data
    useEffect(() => {
        loadProxies();
        loadStatistics();
        loadHealthStatus();
    }, []);

    const loadProxies = async () => {
        try {
            const response = await fetch('/api/server/multi-proxy?action=list-proxies');
            const data = await response.json();
            
            if (data.success) {
                setProxies(data.proxies);
            } else {
                console.error('Failed to load proxies:', data.error);
            }
        } catch (error) {
            console.error('Error loading proxies:', error);
        }
    };

    const loadStatistics = async () => {
        try {
            const response = await fetch('/api/server/multi-proxy?action=proxy-statistics');
            const data = await response.json();
            
            if (data.success) {
                setStatistics(data.statistics);
            } else {
                console.error('Failed to load statistics:', data.error);
            }
        } catch (error) {
            console.error('Error loading statistics:', error);
        }
    };

    const loadHealthStatus = async () => {
        try {
            const response = await fetch('/api/server/multi-proxy?action=health-check');
            const data = await response.json();
            
            if (data.success) {
                setHealthStatus(data.health);
            } else {
                console.error('Failed to load health status:', data.error);
            }
        } catch (error) {
            console.error('Error loading health status:', error);
        }
    };

    const deployToProxies = async () => {
        if (!serverId || selectedProxies.length === 0) {
            alert('Please select at least one proxy for deployment');
            return;
        }

        setIsLoading(true);
        
        try {
            const response = await fetch('/api/server/multi-proxy?action=deploy-multi', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    serverId,
                    targetProxies: selectedProxies,
                    loadBalancingStrategy: deploymentStrategy,
                }),
            });

            const data = await response.json();
            
            if (data.success) {
                alert('Successfully deployed to proxies!');
                if (onProxyDeployment) {
                    onProxyDeployment(data.deployment);
                }
            } else {
                alert(`Deployment failed: ${data.error}`);
            }
        } catch (error) {
            console.error('Deployment error:', error);
            alert('An error occurred during deployment');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleProxySelection = (proxyId: string) => {
        setSelectedProxies(prev => 
            prev.includes(proxyId) 
                ? prev.filter(id => id !== proxyId)
                : [...prev, proxyId]
        );
    };

    const getProxyTypeColor = (type: string): string => {
        switch (type) {
            case 'velocity': return '#4CAF50';
            case 'bungeecord': return '#FF9800';
            case 'waterfall': return '#2196F3';
            case 'rusty-connector': return '#9C27B0';
            default: return '#757575';
        }
    };

    const getHealthStatusColor = (status: string): string => {
        switch (status) {
            case 'healthy': return '#4CAF50';
            case 'degraded': return '#FF9800';
            case 'unhealthy': return '#F44336';
            default: return '#757575';
        }
    };

    const renderOverviewTab = () => (
        <div className={styles.overviewTab}>
            <div className={styles.statisticsGrid}>
                {statistics && (
                    <>
                        <div className={styles.statCard}>
                            <h3>Total Proxies</h3>
                            <div className={styles.statValue}>{statistics.totalProxies}</div>
                        </div>
                        <div className={styles.statCard}>
                            <h3>Enabled Proxies</h3>
                            <div className={styles.statValue}>{statistics.enabledProxies}</div>
                        </div>
                        <div className={styles.statCard}>
                            <h3>Proxy Types</h3>
                            <div className={styles.proxyTypeList}>
                                {Object.entries(statistics.proxyTypes).map(([type, count]) => (
                                    <div key={type} className={styles.proxyTypeItem}>
                                        <span 
                                            className={styles.proxyTypeDot}
                                            style={{ backgroundColor: getProxyTypeColor(type) }}
                                        />
                                        {type}: {count}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className={styles.statCard}>
                            <h3>Health Status</h3>
                            <div className={styles.healthStatusList}>
                                {Object.entries(statistics.healthStatus).map(([status, count]) => (
                                    <div key={status} className={styles.healthStatusItem}>
                                        <span 
                                            className={styles.healthStatusDot}
                                            style={{ backgroundColor: getHealthStatusColor(status) }}
                                        />
                                        {status}: {count}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className={styles.proxyList}>
                <h3>Available Proxies</h3>
                {proxies.map(proxy => (
                    <div key={proxy.id} className={styles.proxyCard}>
                        <div className={styles.proxyHeader}>
                            <div className={styles.proxyInfo}>
                                <h4>{proxy.name}</h4>
                                <span className={styles.proxyType} style={{ color: getProxyTypeColor(proxy.type) }}>
                                    {proxy.type}
                                </span>
                            </div>
                            <div className={styles.proxyStatus}>
                                <span 
                                    className={styles.statusIndicator}
                                    style={{ backgroundColor: getHealthStatusColor(proxy.healthStatus) }}
                                />
                                {proxy.enabled ? 'Enabled' : 'Disabled'}
                            </div>
                        </div>
                        <div className={styles.proxyDetails}>
                            <p><strong>Host:</strong> {proxy.host}:{proxy.port}</p>
                            <p><strong>Priority:</strong> {proxy.priority}</p>
                            {proxy.description && <p><strong>Description:</strong> {proxy.description}</p>}
                            <div className={styles.proxyTags}>
                                {proxy.tags.map(tag => (
                                    <span key={tag} className={styles.tag}>{tag}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderDeployTab = () => (
        <div className={styles.deployTab}>
            <div className={styles.deploymentConfig}>
                <h3>Multi-Proxy Deployment</h3>
                
                <div className={styles.strategySelection}>
                    <label>Deployment Strategy:</label>
                    <select 
                        value={deploymentStrategy} 
                        onChange={(e) => setDeploymentStrategy(e.target.value)}
                        className={styles.strategySelect}
                    >
                        <option value="priority">Priority Based</option>
                        <option value="round-robin">Round Robin</option>
                        <option value="least-connections">Least Connections</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>

                <div className={styles.proxySelection}>
                    <h4>Select Target Proxies:</h4>
                    {proxies.filter(p => p.enabled).map(proxy => (
                        <div key={proxy.id} className={styles.proxySelectionItem}>
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={selectedProxies.includes(proxy.id)}
                                    onChange={() => toggleProxySelection(proxy.id)}
                                />
                                <span className={styles.checkboxCustom}></span>
                                {proxy.name} ({proxy.type})
                            </label>
                            <div className={styles.proxySelectionDetails}>
                                <span>Priority: {proxy.priority}</span>
                                <span 
                                    className={styles.healthIndicator}
                                    style={{ color: getHealthStatusColor(proxy.healthStatus) }}
                                >
                                    {proxy.healthStatus}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                <button 
                    onClick={deployToProxies}
                    disabled={isLoading || selectedProxies.length === 0 || !serverId}
                    className={styles.deployButton}
                >
                    {isLoading ? 'Deploying...' : 'Deploy to Selected Proxies'}
                </button>
            </div>
        </div>
    );

    const renderHealthTab = () => (
        <div className={styles.healthTab}>
            <div className={styles.healthHeader}>
                <h3>Proxy Health Status</h3>
                <button onClick={loadHealthStatus} className={styles.refreshButton}>
                    Refresh Health Checks
                </button>
            </div>
            
            {healthStatus && (
                <div className={styles.healthOverview}>
                    <div className={styles.overallHealth}>
                        <h4>Overall Status: 
                            <span 
                                style={{ color: getHealthStatusColor(healthStatus.overall) }}
                                className={styles.overallStatus}
                            >
                                {healthStatus.overall}
                            </span>
                        </h4>
                    </div>
                    
                    <div className={styles.healthDetails}>
                        {Object.entries(healthStatus.proxies || {}).map(([proxyId, health]: [string, { status: string; details: string[] }]) => {
                            const proxy = proxies.find(p => p.id === proxyId);
                            return (
                                <div key={proxyId} className={styles.healthCard}>
                                    <div className={styles.healthCardHeader}>
                                        <h5>{proxy?.name || proxyId}</h5>
                                        <span 
                                            className={styles.healthStatus}
                                            style={{ color: getHealthStatusColor(health.status) }}
                                        >
                                            {health.status}
                                        </span>
                                    </div>
                                    <div className={styles.healthCardDetails}>
                                        {health.details.map((detail: string, index: number) => (
                                            <p key={index}>{detail}</p>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );

    const renderConfigTab = () => (
        <div className={styles.configTab}>
            <h3>Proxy Configuration</h3>
            <p>Proxy configuration management will be available in a future update.</p>
            <div className={styles.configGrid}>
                {proxies.map(proxy => (
                    <div key={proxy.id} className={styles.configCard}>
                        <h4>{proxy.name}</h4>
                        <p><strong>Type:</strong> {proxy.type}</p>
                        <p><strong>Config Path:</strong> {proxy.configPath}</p>
                        <p><strong>Network:</strong> {proxy.networkName}</p>
                        <div className={styles.capabilities}>
                            <h5>Capabilities:</h5>
                            {proxy.capabilities.map((cap, index) => (
                                <div key={index} className={styles.capability}>
                                    <span className={cap.supported ? styles.supported : styles.unsupported}>
                                        {cap.name}: {cap.supported ? '✓' : '✗'}
                                    </span>
                                    {cap.notes && <span className={styles.capabilityNotes}>{cap.notes}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className={styles.multiProxyManager}>
            <div className={styles.header}>
                <h2>Multi-Proxy Management</h2>
                <p>Manage and deploy to multiple proxy types for enhanced network reliability</p>
            </div>

            <div className={styles.tabNavigation}>
                <button 
                    className={`${styles.tabButton} ${activeTab === 'overview' ? styles.active : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    Overview
                </button>
                <button 
                    className={`${styles.tabButton} ${activeTab === 'deploy' ? styles.active : ''}`}
                    onClick={() => setActiveTab('deploy')}
                    disabled={!serverId}
                >
                    Deploy
                </button>
                <button 
                    className={`${styles.tabButton} ${activeTab === 'health' ? styles.active : ''}`}
                    onClick={() => setActiveTab('health')}
                >
                    Health
                </button>
                <button 
                    className={`${styles.tabButton} ${activeTab === 'config' ? styles.active : ''}`}
                    onClick={() => setActiveTab('config')}
                >
                    Config
                </button>
            </div>

            <div className={styles.tabContent}>
                {activeTab === 'overview' && renderOverviewTab()}
                {activeTab === 'deploy' && renderDeployTab()}
                {activeTab === 'health' && renderHealthTab()}
                {activeTab === 'config' && renderConfigTab()}
            </div>
        </div>
    );
};

export default MultiProxyManager;
