"use client";
import React, { useState, useRef, useEffect } from 'react';
import styles from './create.module.scss';
import { FiUpload, FiTrash2, FiSettings, FiServer, FiGlobe, FiPackage, FiFileText } from 'react-icons/fi';
import { useRouter } from 'next/navigation';
import createBackground from "@/public/dashboard-bg.png";

// Types
interface ServerConfig {
  name: string;
  serverType: string;
  version: string;
  seed?: string;
  maxPlayers: number;
  description: string;
  gameMode: string;
  difficulty: string;
  worldType: string;
  generateStructures: boolean;
  allowNether: boolean;
  allowEnd: boolean;
  pvp: boolean;
  spawnProtection: number;
  viewDistance: number;
  worldFiles: File | null;
  plugins: File[];
  mods: File[];
  customOptions: string;
  [key: string]: unknown;
}

// Reusable Components
interface RadioGroupProps {
  name: string;
  options: { value: string; label: string }[];
  selectedValue: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
}

const RadioGroup: React.FC<RadioGroupProps> = ({ name, options, selectedValue, onChange, label }) => (
  <div className={styles.formGroup}>
    <label>{label}</label>
    <div className={styles.radioGroup}>
      {options.map(option => (
        <label key={option.value} className={styles.radioOption}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={selectedValue === option.value}
            onChange={onChange}
          />
          {option.label}
        </label>
      ))}
    </div>
  </div>
);

interface CheckboxGroupProps {
  serverConfig: ServerConfig;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
  options: { name: string; label: string }[];
}

const CheckboxGroup: React.FC<CheckboxGroupProps> = ({ serverConfig, onChange, label, options }) => (
  <div className={styles.formGroup}>
    <label>{label}</label>
    <div className={styles.checkboxGroup}>
      {options.map(option => (
        <label key={option.name} className={styles.checkboxOption}>
          <input
            type="checkbox"
            name={option.name}
            checked={serverConfig[option.name as keyof ServerConfig] as boolean}
            onChange={onChange}
          />
          {option.label}
        </label>
      ))}
    </div>
  </div>
);

interface RangeInputProps {
  id: string;
  name: string;
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  unit: string;
}

const RangeInput: React.FC<RangeInputProps> = ({ id, name, label, min, max, value, onChange, unit }) => (
  <div className={styles.formGroup}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.rangeWrapper}>
      <input
        type="range"
        id={id}
        name={name}
        min={min}
        max={max}
        value={value}
        onChange={onChange}
      />
      <span className={styles.rangeValue}>{value} {unit}</span>
    </div>
  </div>
);

interface FileUploadSectionProps {
  label: string;
  files: File[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  fileType: string;
  uploadText: string;
}

const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  label, files, onUpload, onRemove, fileRef, fileType, uploadText
}) => (
  <div className={styles.formGroup}>
    <label>{label}</label>
    <div className={styles.fileUpload}>
      <div
        className={styles.uploadBox}
        onClick={() => fileRef.current?.click()}
      >
        <FiUpload size={32} />
        <p>{uploadText}</p>
      </div>
      <input
        type="file"
        ref={fileRef}
        style={{ display: 'none' }}
        accept={fileType}
        multiple
        onChange={onUpload}
      />

      {files.length > 0 && (
        <div>
          <p>Uploaded {label}:</p>
          {files.map((file, index) => (
            <div key={index} className={styles.uploadedFile}>
              <FiFileText />
              <span className={styles.fileName}>{file.name}</span>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => onRemove(index)}
              >
                <FiTrash2 />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

interface PreviewDetailProps {
  label: string;
  value: string | number;
}

const PreviewDetail: React.FC<PreviewDetailProps> = ({ label, value }) => (
  <p className={styles.previewDetail}>
    <span>{label}:</span> {value}
  </p>
);

// Tab configuration
const tabs = [
  { id: 'general', label: 'General', icon: FiServer },
  { id: 'world', label: 'World Settings', icon: FiGlobe },
  { id: 'mods', label: 'Plugins & Mods', icon: FiPackage },
  { id: 'advanced', label: 'Advanced', icon: FiSettings }
];

interface TabButtonProps {
  tab: typeof tabs[0];
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ tab, isActive, onClick }) => (
  <button
    className={`${styles.tabButton} ${isActive ? styles.active : ''}`}
    onClick={onClick}
  >
    <tab.icon className={styles.tabIcon} /> {tab.label}
  </button>
);

// Main Component

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
  const [serverConfig, setServerConfig] = useState<ServerConfig>({
    name: '',
    serverType: '',
    version: '',
    seed: '',
    maxPlayers: 20,
    description: '',
    gameMode: 'survival',
    difficulty: 'normal',
    worldType: 'default',
    // Initialize all checkbox properties with default values
    generateStructures: true,
    allowNether: true,
    allowEnd: true,
    pvp: true,
    // Add any other checkbox properties that might come from your API
    allowFlight: false,
    enableCommandBlocks: false,
    forceGamemode: false,
    hardcore: false,
    onlineMode: true,
    whiteList: false,
    // Range inputs
    spawnProtection: 16,
    viewDistance: 10,
    // File inputs
    worldFiles: null,
    plugins: [],
    mods: [],
    customOptions: ''
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
  const [worldFeatures, setWorldFeatures] = useState<{ name: string; label: string }[]>([]);
  const [serverOptions, setServerOptions] = useState<{ name: string; label: string }[]>([]);

  const fetchServerSettings = async () => {
    try {
      const response = await fetch('/api/server/config', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch server settings');
      }

      const data = await response.json();
      console.log('Fetched server settings:', data);

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

        // Initialize world features
        data.worldFeatures?.forEach((feature: { name: string }) => {
          if (!(feature.name in newConfig)) {
            newConfig[feature.name] = true; // Default to true for world features
          }
        });

        // Initialize server options
        data.serverOptions?.forEach((option: { name: string }) => {
          if (!(option.name in newConfig)) {
            newConfig[option.name] = false; // Default to false for server options
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
    // Here you would implement the servers creation logic
    console.log('Server configuration:', serverConfig);
    alert('Server creation request submitted! Check console for details.');
  };

  return (
    <main className={styles.serverGenerator} style={{ backgroundImage: `url('${createBackground.src}')` }}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.pageTitle}>Create New Server</h1>
        </div>

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
                <label htmlFor="customOptions">Server IP</label>
                <div className={styles.customOptions}>
                  <input
                    type="text"
                    id="customOptions"
                    name="customOptions"
                    value={serverConfig.customOptions}
                    onChange={handleChange}
                    placeholder="Enter a custom server IP"
                  />
                  .etran.dev
                </div>
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

              <div className={styles.formGroup}>
                <label>World Generation</label>
                <div className={styles.radioGroup}>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="worldGeneration"
                      value="new"
                      checked={!serverConfig.worldFiles}
                      onChange={() => {
                        removeWorldFile();
                      }}
                    />
                    Generate New World
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="worldGeneration"
                      value="import"
                      checked={!!serverConfig.worldFiles}
                      onChange={() => {
                        if (worldFileRef.current) {
                          worldFileRef.current.click();
                        }
                      }}
                    />
                    Import Existing World
                  </label>
                </div>
              </div>

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
                  value={serverConfig.customOptions}
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
            </div>
          </div>

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