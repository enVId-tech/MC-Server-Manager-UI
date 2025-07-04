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
import { ClientServerConfig } from '@/lib/server/minecraft';

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
  const [isCreating, setIsCreating] = useState(false);
  const [creationSuccess, setCreationSuccess] = useState(false);
  const [creationProgress, setCreationProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [deploymentSteps, setDeploymentSteps] = useState<Array<{
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    message?: string;
    error?: string;
  }>>([]);
  const [serverId, setServerId] = useState<string>('');
  const [serverUniqueId, setServerUniqueId] = useState<string>('');
  const [canRetryDeployment, setCanRetryDeployment] = useState(false);

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

    const interval = setInterval(() => {
      checkAuth();
    }, 60000); // Refresh server settings every minute

    checkAuth();

    window.addEventListener('storage', checkAuth);

    return () => {
      window.removeEventListener('storage', checkAuth);
      clearInterval(interval);
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

  // Handle form submission with real-time deployment tracking
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); // Clear any previous errors
    setIsCreating(true); // Show loading screen
    setCreationProgress(0);
    setCurrentStep('Initializing server creation...');

    console.log('Submitting server configuration:', serverConfig);

    try {
      // Step 1: Create server in database
      setCreationProgress(5);
      setCurrentStep('Creating server record in database...');

      const response = await fetch('/api/server/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(serverConfig),
      });

      if (response.status === 401) {
        setError({
          title: 'Authentication Required',
          message: 'You must be logged in to create a server configuration.',
          type: 'warning'
        });
        setIsCreating(false);
        router.push('/auth/login');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        setIsCreating(false);

        // Handle specific errors
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

      const data = await response.json();
      setServerId(data.serverId);
      setServerUniqueId(data.uniqueId);

      // Step 2: Start deployment process
      setCreationProgress(10);
      setCurrentStep('Starting deployment process...');

      const deployResponse = await fetch('/api/server/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverId: data.serverId }),
      });

      if (!deployResponse.ok) {
        const deployErrorData = await deployResponse.json();
        setIsCreating(false);
        setError({
          title: 'Deployment Failed',
          message: deployErrorData.error || 'Failed to start server deployment.',
          details: deployErrorData.details,
          type: 'error'
        });
        return;
      }

      // Step 3: Poll for deployment status
      await pollDeploymentStatus(data.serverId);

    } catch (err) {
      setIsCreating(false);
      console.error('Network error:', err);
      setError({
        title: 'Network Error',
        message: 'Unable to connect to the server. Please check your internet connection and try again.',
        details: err instanceof globalThis.Error ? err.message : String(err),
        type: 'error'
      });
    }
  };

  // Poll deployment status for real-time updates
  const pollDeploymentStatus = async (serverId: string) => {
    const maxAttempts = 60; // 5 minutes at 5-second intervals
    let attempts = 0;

    const poll = async () => {
      try {
        const statusResponse = await fetch(`/api/server/deploy?serverId=${serverId}`);

        if (!statusResponse.ok) {
          throw new globalThis.Error('Failed to get deployment status');
        }

        const status = await statusResponse.json();

        // Update UI with real deployment status
        setCreationProgress(status.progress);
        setCurrentStep(status.currentStep);
        setDeploymentSteps(status.steps || []);

        if (status.status === 'completed') {
          setCreationSuccess(true);

          // Redirect after 5 seconds
          setTimeout(() => {
            router.push('/manager/dashboard');
          }, 5000);
          return;
        }

        if (status.status === 'failed') {
          setIsCreating(false);
          setCanRetryDeployment(true);
          setError({
            title: 'Deployment Failed',
            message: status.error || 'Server deployment failed.',
            type: 'error'
          });
          return;
        }

        // Continue polling if still running
        if (status.status === 'running' && attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 5000); // Poll every 5 seconds
        } else if (attempts >= maxAttempts) {
          setIsCreating(false);
          setError({
            title: 'Deployment Timeout',
            message: 'Server deployment is taking longer than expected. Please check your server dashboard.',
            type: 'warning'
          });
        }

      } catch (error) {
        console.error('Error polling deployment status:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000); // Retry after 5 seconds
        } else {
          setIsCreating(false);
          setError({
            title: 'Status Check Failed',
            message: 'Unable to check deployment status. Your server may still be deploying.',
            type: 'warning'
          });
        }
      }
    };

    // Start polling
    setTimeout(poll, 2000); // Start after 2 seconds
  };

  // Retry deployment function
  const retryDeployment = async () => {
    if (!serverId) return;

    setError(null);
    setIsCreating(true);
    setCanRetryDeployment(false);
    setCreationProgress(0);
    setCurrentStep('Retrying deployment...');

    try {
      const deployResponse = await fetch('/api/server/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverId: serverId }),
      });

      if (!deployResponse.ok) {
        const deployErrorData = await deployResponse.json();
        setIsCreating(false);
        setCanRetryDeployment(true);
        setError({
          title: 'Retry Failed',
          message: deployErrorData.error || 'Failed to retry server deployment.',
          details: deployErrorData.details,
          type: 'error'
        });
        return;
      }

      // Start polling again
      await pollDeploymentStatus(serverId);

    } catch (err) {
      setIsCreating(false);
      setCanRetryDeployment(true);
      console.error('Retry error:', err);
      setError({
        title: 'Retry Error',
        message: 'Unable to retry deployment. Please check your connection and try again.',
        details: err instanceof globalThis.Error ? err.message : String(err),
        type: 'error'
      });
    }
  };

  return (
    <main className={styles.serverGenerator} style={{ backgroundImage: `url('${createBackground.src}')` }}>
      {/* Loading/Success Overlay */}
      {(isCreating || creationSuccess) && (
        <div className={styles.creationOverlay}>
          <div className={styles.creationModal}>
            {!creationSuccess ? (
              // Loading State
              <>
                <div className={styles.loadingIcon}>
                  <div className={styles.spinner}></div>
                </div>
                <h2 className={styles.creationTitle}>Creating Your Server</h2>
                <p className={styles.creationMessage}>
                  Please wait while we set up your Minecraft server...
                </p>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${creationProgress}%` }}
                  ></div>
                </div>
                <p className={styles.progressText}>{Math.round(creationProgress)}% Complete</p>
                <p className={styles.currentStepText}>{currentStep}</p>
                <div className={styles.creationSteps}>
                  {deploymentSteps.length > 0 ? (
                    deploymentSteps.map((step) => (
                      <div
                        key={step.id}
                        className={`${styles.step} ${step.status === 'completed' ? styles.completed :
                            step.status === 'running' ? styles.running :
                              step.status === 'failed' ? styles.failed : ''
                          }`}
                      >
                        <span className={styles.stepIcon}>
                          {step.status === 'completed' ? '✓' :
                            step.status === 'running' ? '⟳' :
                              step.status === 'failed' ? '✗' : '○'}
                        </span>
                        <span className={styles.stepName}>{step.name}</span>
                        {step.message && step.message !== step.name && (
                          <span className={styles.stepMessage}>- {step.message}</span>
                        )}
                        {step.error && (
                          <span className={styles.stepError}>Error: {step.error}</span>
                        )}
                      </div>
                    ))
                  ) : (
                    // Fallback to static steps if no dynamic steps available
                    <>
                      <div className={`${styles.step} ${creationProgress >= 20 ? styles.completed : ''}`}>
                        <span className={styles.stepIcon}>✓</span>
                        <span className={styles.stepName}>Validating configuration</span>
                      </div>
                      <div className={`${styles.step} ${creationProgress >= 40 ? styles.completed : ''}`}>
                        <span className={styles.stepIcon}>✓</span>
                        <span className={styles.stepName}>Setting up server environment</span>
                      </div>
                      <div className={`${styles.step} ${creationProgress >= 60 ? styles.completed : ''}`}>
                        <span className={styles.stepIcon}>✓</span>
                        <span className={styles.stepName}>Installing Minecraft server</span>
                      </div>
                      <div className={`${styles.step} ${creationProgress >= 80 ? styles.completed : ''}`}>
                        <span className={styles.stepIcon}>✓</span>
                        <span className={styles.stepName}>Configuring server properties</span>
                      </div>
                      <div className={`${styles.step} ${creationProgress >= 100 ? styles.completed : ''}`}>
                        <span className={styles.stepIcon}>✓</span>
                        <span className={styles.stepName}>Finalizing setup</span>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              // Success State
              <>
                <div className={styles.successIcon}>
                  <div className={styles.checkmark}>✓</div>
                </div>
                <h2 className={styles.creationTitle}>Server Created Successfully!</h2>
                <p className={styles.creationMessage}>
                  Your Minecraft server &quot;{serverConfig.name}&quot; has been created and deployed successfully.
                </p>
                {serverUniqueId && (
                  <div className={styles.serverDetails}>
                    <h3>Server Information</h3>
                    <p><strong>Server Name:</strong> {serverConfig.name}</p>
                    <p><strong>Server Type:</strong> {serverConfig.serverType}</p>
                    <p><strong>Minecraft Version:</strong> {serverConfig.version}</p>
                    <p><strong>Server ID:</strong> {serverUniqueId}</p>
                    <p><strong>Connection:</strong> {serverConfig.subdomain}.etran.dev:{serverConfig.port}</p>
                  </div>
                )}
                <p className={styles.redirectMessage}>
                  You will be redirected to your server dashboard in a few seconds where you can manage, start, and monitor your server.
                </p>
                <div className={styles.serverDetails}>
                  <p><strong>Server IP:</strong> {serverConfig.subdomain}</p>
                  <p><strong>Version:</strong> {serverConfig.version}</p>
                  <p><strong>Type:</strong> {serverTypes.find(t => t.id === serverConfig.serverType)?.name}</p>
                </div>
                <p className={styles.redirectMessage}>
                  Redirecting to server dashboard in 5 seconds...
                </p>
              </>
            )}
          </div>
        </div>
      )}

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

        {/* Retry Deployment Button */}
        {canRetryDeployment && (
          <div className={styles.retrySection}>
            <h3>Deployment Failed</h3>
            <p>The server was created but deployment failed. You can retry the deployment process.</p>
            <button
              onClick={retryDeployment}
              className={`${styles.button} ${styles.secondary}`}
              disabled={isCreating}
            >
              {isCreating ? 'Retrying...' : 'Retry Deployment'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}