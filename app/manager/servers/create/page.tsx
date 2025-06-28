"use client";
import React, { useState, useRef, useEffect } from 'react';
import styles from './create-main.module.scss';
import { FiTrash2, FiSettings, FiServer, FiGlobe, FiPackage, FiFileText } from 'react-icons/fi';
import { useRouter } from 'next/navigation';
import createBackground from "@/public/dashboard-bg.png";
import Error from '@/app/_components/Error/Error';

// Import components
import {
  RadioGroup,
  CheckboxGroup,
  RangeInput,
  FileUploadSection,
  TabButton,
  PreviewDetail
} from '.';

// Types - Client-side form interface (without Mongoose Document methods)
interface ClientServerConfig {
    // Basic server information
    name: string;
    serverType: string;
    version: string;
    description: string;
    
    // World settings
    seed?: string;
    gameMode: string;
    difficulty: string;
    worldType: string;
    worldGeneration: string;
    worldFile?: File | null;
    
    // Player settings
    maxPlayers: number;
    whitelistEnabled: boolean;
    onlineMode: boolean;
    
    // Game mechanics
    pvpEnabled: boolean;
    commandBlocksEnabled: boolean;
    flightEnabled: boolean;
    spawnAnimalsEnabled: boolean;
    spawnMonstersEnabled: boolean;
    spawnNpcsEnabled: boolean;
    generateStructuresEnabled: boolean;
    
    // Network settings
    port: number;
    
    // Performance settings
    viewDistance: number;
    simulationDistance: number;
    spawnProtection: number;
    
    // Server management
    rconEnabled: boolean;
    rconPassword: string;
    motd: string;
    
    // Resource settings
    resourcePackUrl: string;
    resourcePackSha1: string;
    resourcePackPrompt: string;
    forceResourcePack: boolean;
    
    // Advanced settings
    enableJmxMonitoring: boolean;
    syncChunkWrites: boolean;
    enforceWhitelist: boolean;
    preventProxyConnections: boolean;
    hideOnlinePlayers: boolean;
    broadcastRconToOps: boolean;
    broadcastConsoleToOps: boolean;
    
    // Memory and performance
    serverMemory: number;
    
    // Client-specific properties for form handling
    plugins: File[];
    mods: File[];
    subdomain: string;
    worldFiles?: File | null;
    customOptions?: string;
    [key: string]: unknown;
}

// Tab configuration
const tabs = [
  { id: 'general', label: 'General', icon: FiServer },
  { id: 'world', label: 'World Settings', icon: FiGlobe },
  { id: 'mods', label: 'Plugins & Mods', icon: FiPackage },
  { id: 'advanced', label: 'Advanced', icon: FiSettings }
];

// Interfaces for ServerConfig
interface ServerTypes {
  id: string;
  name: string;
}

interface WorldType {
  id: string;
  name: string;
}

export default function ServerGenerator() {
  const [activeTab, setActiveTab] = useState('general');
  const [serverConfig, setServerConfig] = useState<ClientServerConfig>({
    name: '',
    serverType: '',
    version: '',
    description: '',
    seed: '',
    gameMode: 'survival',
    difficulty: 'normal',
    worldType: 'default',
    worldGeneration: 'new',
    worldFile: null,
    maxPlayers: 20,
    whitelistEnabled: false,
    onlineMode: true,
    pvpEnabled: true,
    commandBlocksEnabled: false,
    flightEnabled: false,
    spawnAnimalsEnabled: true,
    spawnMonstersEnabled: true,
    spawnNpcsEnabled: true,
    generateStructuresEnabled: true,
    port: 25565,
    viewDistance: 10,
    simulationDistance: 10,
    spawnProtection: 16,
    rconEnabled: false,
    rconPassword: '',
    motd: 'A Minecraft Server',
    resourcePackUrl: '',
    resourcePackSha1: '',
    resourcePackPrompt: '',
    forceResourcePack: false,
    enableJmxMonitoring: false,
    syncChunkWrites: true,
    enforceWhitelist: false,
    preventProxyConnections: false,
    hideOnlinePlayers: false,
    broadcastRconToOps: true,
    broadcastConsoleToOps: true,
    serverMemory: 1024,
    // Client-specific properties
    plugins: [],
    mods: [],
    subdomain: '',
    worldFiles: null,
    customOptions: '',
    // Default values for common world features (will be overridden by API)
    generateStructures: true,
    allowNether: true,
    allowEnd: true,
    pvp: true,
    hardcore: false,
    // Default values for common server options (will be overridden by API)
    via: false,
    'via-legacy': false,
    geyser: false
  });

  const [fullyLoaded, setFullyLoaded] = useState(false);

  const router = useRouter();

  const worldFileRef = useRef<HTMLInputElement>(null);
  const pluginsRef = useRef<HTMLInputElement>(null);
  const modsRef = useRef<HTMLInputElement>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [serverTypes, setServerTypes] = useState<ServerTypes[]>([]);
  const [worldTypes, setWorldTypes] = useState<WorldType[]>([]);
  const [gameModes, setGameModes] = useState<{ value: string; label: string }[]>([]);
  const [difficulties, setDifficulties] = useState<{ value: string; label: string }[]>([]);
  const [worldFeatures, setWorldFeatures] = useState<{ name: string; label: string; enabled?: boolean }[]>([]);
  const [serverOptions, setServerOptions] = useState<{ name: string; label: string }[]>([]);
  const [error, setError] = useState<{
    title?: string;
    message: string;
    details?: string;
    type?: 'error' | 'warning' | 'info';
  } | null>(null);
    
  const fetchServerSettings = async () => {
    try {
      const response = await fetch('/api/server/config', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        if (response.status === 401) {
          setError({
            title: 'Unauthorized',
            message: 'You are not authorized to access this resource.',
            type: 'error'
          });
        } else {
          setError({
            title: 'Error',
            message: 'Failed to fetch server settings.',
            type: 'error'
          });
        }
        return;
      }

      const data = await response.json();

      // Set the fetched data
      setVersions(data.versions || []);
      setServerTypes(data.serverTypes || []);
      setWorldTypes(data.worldTypes || []);
      setGameModes(data.gameModes || []);
      setDifficulties(data.difficulties || []);
      setWorldFeatures(data.worldFeatures || []);
      setServerOptions(data.serverOptions || []);

      // Initialize serverConfig with any missing properties from the fetched options
      setServerConfig(prevConfig => {
        const newConfig = { ...prevConfig };

        // Initialize world features with their default enabled values
        data.worldFeatures?.forEach((feature: { name: string; enabled?: boolean }) => {
          if (!(feature.name in newConfig)) {
            newConfig[feature.name] = feature.enabled !== undefined ? feature.enabled : true;
          }
        });

        // Initialize server options with their default enabled values
        data.serverOptions?.forEach((option: { name: string; enabled?: boolean }) => {
          if (!(option.name in newConfig)) {
            newConfig[option.name] = option.enabled !== undefined ? option.enabled : false;
          }
        });

        // Initialize server type and version if not set
        if (!newConfig.serverType && data.serverTypes && data.serverTypes.length > 0) {
          newConfig.serverType = data.serverTypes[0].id; // Default to first server type
        }

        if (!newConfig.version && data.versions && data.versions.length > 0) {
          newConfig.version = data.versions[0]; // Default to first version
        }

        return newConfig;
      });

    } catch (error) {
      console.error('Error fetching server settings:', error);
    }
  };

  useEffect(() => {
    const checkAuth = () => {
      const res = fetch('/api/auth/check', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      res.then(response => {
        if (!response.ok) {
          router.push('/'); // Redirect to home page if not authenticated
        }
      }).catch(error => {
        console.error('Error checking authentication:', error);
      });

      setFullyLoaded(true);
    }
    // Fetch initial server settings from the API
    fetchServerSettings();

    checkAuth();

    window.addEventListener('storage', checkAuth);

    return () => {
      window.removeEventListener('storage', checkAuth);
    };
  }, [router]);

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setServerConfig({
        ...serverConfig,
        [name]: checked
      });
    } else if (type === 'range' || name === 'maxPlayers') {
      setServerConfig({
        ...serverConfig,
        [name]: parseInt(value)
      });
    } else {
      setServerConfig({
        ...serverConfig,
        [name]: value
      });
    }
  };

  // Handle world file upload
  const handleWorldFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setServerConfig({
        ...serverConfig,
        worldFiles: e.target.files[0]
      });
    }
  };

  // Handle plugins upload
  const handlePluginsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newPlugins = Array.from(e.target.files);
      setServerConfig({
        ...serverConfig,
        plugins: [...serverConfig.plugins, ...newPlugins]
      });
    }
  };

  // Handle mods upload
  const handleModsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newMods = Array.from(e.target.files);
      setServerConfig({
        ...serverConfig,
        mods: [...serverConfig.mods, ...newMods]
      });
    }
  };

  // Remove plugin
  const removePlugin = (index: number) => {
    setServerConfig({
      ...serverConfig,
      plugins: serverConfig.plugins.filter((_, i) => i !== index)
    });
  };

  // Remove mod
  const removeMod = (index: number) => {
    setServerConfig({
      ...serverConfig,
      mods: serverConfig.mods.filter((_, i) => i !== index)
    });
  };

  // Remove world file
  const removeWorldFile = () => {
    setServerConfig({
      ...serverConfig,
      worldFiles: null
    });
    if (worldFileRef.current) {
      worldFileRef.current.value = '';
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); // Clear any previous errors

    console.log('Submitting server configuration:', serverConfig);

    // Send server configuration to the API
    const response = fetch('/api/server/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(serverConfig),
    });

    response.then(async res => {
      if (res.status === 401) {
        setError({
          title: 'Authentication Required',
          message: 'You must be logged in to create a server configuration.',
          type: 'warning'
        });
        router.push('/auth/login');
        return;
      }
      
      if (!res.ok) {
        const errorData = await res.json();
        
        // Handle specific MongoDB duplicate key error
        if (errorData.details && errorData.details.includes('E11000 duplicate key error')) {
          if (errorData.details.includes('email_1')) {
            setError({
              title: 'Multiple Servers Detected',
              message: 'You already have a server with this email address. Our system is being updated to support multiple servers per account.',
              details: 'This is a temporary limitation. Please contact support if you need multiple servers immediately.',
              type: 'info'
            });
          } else if (errorData.details.includes('subdomain')) {
            setError({
              title: 'Subdomain Already Taken',
              message: 'The subdomain you chose is already in use. Please try a different one.',
              type: 'warning'
            });
          } else {
            setError({
              title: 'Duplicate Entry',
              message: 'Some of the information you entered conflicts with an existing server.',
              details: errorData.details,
              type: 'error'
            });
          }
        } else {
          setError({
            title: 'Server Creation Failed',
            message: errorData.error || 'An unexpected error occurred while creating your server.',
            details: errorData.details,
            type: 'error'
          });
        }
        return;
      }
      
      const data = await res.json();

      // Redirect to the server details page or show success message
      console.log('Server created successfully:', data);
      alert('Server creation request submitted! Check console for details.');
    }).catch(err => {
      console.error('Network error:', err);
      setError({
        title: 'Network Error',
        message: 'Unable to connect to the server. Please check your internet connection and try again.',
        details: err.message,
        type: 'error'
      });
    });
  };
  
  return (
    <main className={styles.serverGenerator} style={{ backgroundImage: `url('${createBackground.src}')` }}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.pageTitle}>Create New Server</h1>
        </div>

        {error && (
          <Error
            title={error.title}
            message={error.message}
            details={error.details}
            type={error.type}
            onClose={() => setError(null)}
          />
        )}

        <div className={styles.tabs}>
          {tabs.map(tab => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {/* General Settings Tab */}
          {activeTab === 'general' && (
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Server Configuration</h2>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="name">Server Name</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={serverConfig.name}
                    onChange={handleChange}
                    required
                    placeholder="My Minecraft Server"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="serverType">Server Type</label>
                  <select
                    id="serverType"
                    name="serverType"
                    value={serverTypes.find(type => type.id === serverConfig.serverType)?.id || ''}
                    onChange={handleChange}
                  >
                    {serverTypes.map(type => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="version">Minecraft Version</label>
                  <select
                    id="version"
                    name="version"
                    value={serverConfig.version}
                    onChange={handleChange}
                  >
                    {versions.map(version => (
                      <option key={version} value={version}>{version}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="maxPlayers">Max Players</label>
                  <input
                    type="number"
                    id="maxPlayers"
                    name="maxPlayers"
                    min="1"
                    max="100"
                    value={serverConfig.maxPlayers}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="description">Server Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={serverConfig.description}
                  onChange={handleChange}
                  placeholder="Describe your server..."
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="subdomain">Server IP</label>
                <input
                  type="text"
                  id="subdomain"
                  name="subdomain"
                  value={serverConfig.subdomain}
                  onChange={handleChange}
                  required
                  placeholder="Enter a custom server IP"
                />
              </div>

              <RadioGroup
                name="gameMode"
                options={gameModes}
                selectedValue={serverConfig.gameMode}
                onChange={handleChange}
                label="Game Mode"
              />

              <RadioGroup
                name="difficulty"
                options={difficulties}
                selectedValue={serverConfig.difficulty}
                onChange={handleChange}
                label="Difficulty"
              />

              <CheckboxGroup
                serverConfig={serverConfig}
                onChange={handleChange}
                label="Server Options"
                options={serverOptions}
              />
            </div>
          )}

          {/* World Settings Tab */}
          {activeTab === 'world' && (
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>World Configuration</h2>

              <RadioGroup
                name="worldGeneration"
                options={[
                  { value: 'new', label: 'Generate New World' },
                  { value: 'import', label: 'Import Existing World' }
                ]}
                selectedValue={!serverConfig.worldFiles ? 'new' : 'import'}
                onChange={(e) => {
                  if (e.target.value === 'new') {
                    removeWorldFile();
                  } else if (e.target.value === 'import') {
                    if (worldFileRef.current) {
                      worldFileRef.current.click();
                    }
                  }
                }}
                label="World Generation"
              />

              {!serverConfig.worldFiles ? (
                <>
                  <div className={styles.formGroup}>
                    <label htmlFor="seed">World Seed (optional)</label>
                    <input
                      type="text"
                      id="seed"
                      name="seed"
                      value={serverConfig.seed || ''}
                      onChange={handleChange}
                      placeholder="Leave blank for random seed"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="worldType">World Type</label>
                    <select
                      id="worldType"
                      name="worldType"
                      value={serverConfig.worldType}
                      onChange={handleChange}
                    >
                      {worldTypes.map(type => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div className={styles.formGroup}>
                  <label>Uploaded World File</label>
                  <div className={styles.uploadedFile}>
                    <FiFileText />
                    <span className={styles.fileName}>{serverConfig.worldFiles.name}</span>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={removeWorldFile}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              )}

              <input
                type="file"
                ref={worldFileRef}
                style={{ display: 'none' }}
                accept=".zip,.rar,.7zip,.gz,.tar"
                onChange={handleWorldFileUpload}
              />

              <CheckboxGroup
                serverConfig={serverConfig}
                onChange={handleChange}
                label="World Features"
                options={worldFeatures}
              />

              <RangeInput
                id="spawnProtection"
                name="spawnProtection"
                label="Spawn Protection Radius"
                min={0}
                max={64}
                value={serverConfig.spawnProtection}
                onChange={handleChange}
                unit="blocks"
              />

              <RangeInput
                id="viewDistance"
                name="viewDistance"
                label="View Distance"
                min={3}
                max={32}
                value={serverConfig.viewDistance}
                onChange={handleChange}
                unit="chunks"
              />
            </div>
          )}

          {/* Plugins & Mods Tab */}
          {activeTab === 'mods' && (
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Plugins & Mods</h2>

              {(serverConfig.serverType === 'spigot' || serverConfig.serverType === 'paper' || serverConfig.serverType === 'bukkit' || serverConfig.serverType === 'purpur') && (
                <FileUploadSection
                  label="Plugins"
                  files={serverConfig.plugins}
                  onUpload={handlePluginsUpload}
                  onRemove={removePlugin}
                  fileRef={pluginsRef}
                  fileType=".jar"
                  uploadText="Click to upload plugin files (.jar)"
                />
              )}

              {(serverConfig.serverType === 'forge' || serverConfig.serverType === 'fabric') && (
                <FileUploadSection
                  label="Mods"
                  files={serverConfig.mods}
                  onUpload={handleModsUpload}
                  onRemove={removeMod}
                  fileRef={modsRef}
                  fileType=".jar"
                  uploadText="Click to upload mod files (.jar)"
                />
              )}

              {serverConfig.serverType === 'vanilla' && (
                <p>Vanilla servers do not support plugins or mods. Choose Spigot/Paper for plugins or Forge/Fabric for mods.</p>
              )}
            </div>
          )}

          {/* Advanced Tab */}
          {activeTab === 'advanced' && (
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Advanced Options</h2>

              <div className={styles.formGroup}>
                <label htmlFor="customOptions">Custom Server Properties</label>
                <textarea
                  id="customOptions"
                  name="customOptions"
                  value={serverConfig.customOptions as string}
                  onChange={handleChange}
                  placeholder="Enter additional server.properties options, one per line (e.g., allow-flight=true)"
                  rows={10}
                />
              </div>

              <div className={styles.formGroup}>
                <p><strong>Note:</strong> Advanced options allow you to add custom configurations directly to your server.properties file. Use with caution as improper settings may prevent your server from starting.</p>
              </div>
            </div>
          )}

          <div className={styles.serverPreview}>
            <h2 className={styles.sectionTitle}>Server Preview</h2>
            <div className={styles.previewInfo}>
              <div>
                <PreviewDetail label="Name" value={serverConfig.name || 'Unnamed Server'} />
                <PreviewDetail
                  label="Type"
                  value={serverTypes.find(t => t.id === serverConfig.serverType)?.name || 'Vanilla'}
                />
                <PreviewDetail label="Version" value={serverConfig.version} />
                <PreviewDetail label="Game Mode" value={serverConfig.gameMode} />
                <PreviewDetail label="Difficulty" value={serverConfig.difficulty} />
              </div>
              <div>
                <PreviewDetail
                  label="World"
                  value={serverConfig.worldFiles ? 'Custom World Import' : 'New Generated World'}
                />
                <PreviewDetail label="Plugins" value={`${serverConfig.plugins.length} plugin(s)`} />
                <PreviewDetail label="Mods" value={`${serverConfig.mods.length} mod(s)`} />
                <PreviewDetail label="Max Players" value={serverConfig.maxPlayers} />
              </div>
              <p className={styles.previewNote}>
                <strong>Note:</strong> This is not a permanent server configuration. You can modify these settings later in the server management dashboard (or in Minecraft if it is command based).
              </p>
            </div>
          </div>

          {error && (
          <Error
            title={error.title}
            message={error.message}
            details={error.details}
            type={error.type}
            onClose={() => setError(null)}
          />
        )}

          {fullyLoaded && (
            <div className={styles.actionButtons}>
              <button type="submit" className={`${styles.button} ${styles.primary}`}>
                Create Server
              </button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}