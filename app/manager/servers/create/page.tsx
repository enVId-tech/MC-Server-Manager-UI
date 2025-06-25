"use client";
import React, { useState, useRef, useEffect } from 'react';
import styles from './create.module.scss';
import { FiUpload, FiTrash2, FiSettings, FiServer, FiGlobe, FiPackage, FiFileText } from 'react-icons/fi';

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
}

// Minecraft version options
const versions = [
  '1.20.1', '1.19.4', '1.19.3', '1.19.2', '1.18.2',
  '1.17.1', '1.16.5', '1.15.2', '1.14.4', '1.12.2'
];

// Server type options
const serverTypes = [
  { id: 'vanilla', name: 'Vanilla' },
  { id: 'spigot', name: 'Spigot' },
  { id: 'paper', name: 'Paper' },
  { id: 'forge', name: 'Forge' },
  { id: 'fabric', name: 'Fabric' }
];

// World type options
const worldTypes = [
  { id: 'default', name: 'Default' },
  { id: 'flat', name: 'Superflat' },
  { id: 'largeBiomes', name: 'Large Biomes' },
  { id: 'amplified', name: 'Amplified' },
  { id: 'buffet', name: 'Buffet' }
];

export default function ServerGenerator() {
  const [activeTab, setActiveTab] = useState('general');
  const [serverConfig, setServerConfig] = useState<ServerConfig>({
    name: '',
    serverType: 'vanilla',
    version: '1.19.4',
    seed: '',
    maxPlayers: 20,
    description: '',
    gameMode: 'survival',
    difficulty: 'normal',
    worldType: 'default',
    generateStructures: true,
    allowNether: true,
    allowEnd: true,
    pvp: true,
    spawnProtection: 16,
    viewDistance: 10,
    worldFiles: null,
    plugins: [],
    mods: [],
    customOptions: ''
  });

  const worldFileRef = useRef<HTMLInputElement>(null);
  const pluginsRef = useRef<HTMLInputElement>(null);
  const modsRef = useRef<HTMLInputElement>(null);

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
    <main className={styles.serverGenerator}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.pageTitle}>Create New Server</h1>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tabButton} ${activeTab === 'general' ? styles.active : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <FiServer className={styles.tabIcon} /> General
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === 'world' ? styles.active : ''}`}
            onClick={() => setActiveTab('world')}
          >
            <FiGlobe className={styles.tabIcon} /> World Settings
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === 'mods' ? styles.active : ''}`}
            onClick={() => setActiveTab('mods')}
          >
            <FiPackage className={styles.tabIcon} /> Plugins & Mods
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === 'advanced' ? styles.active : ''}`}
            onClick={() => setActiveTab('advanced')}
          >
            <FiSettings className={styles.tabIcon} /> Advanced
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* General Settings Tab */}
          {activeTab === 'general' && (
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Server Configuration</h2>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="name">Server Name *</label>
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
                    value={serverConfig.serverType}
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
                <label>Game Mode</label>
                <div className={styles.radioGroup}>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="gameMode"
                      value="survival"
                      checked={serverConfig.gameMode === 'survival'}
                      onChange={handleChange}
                    />
                    Survival
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="gameMode"
                      value="creative"
                      checked={serverConfig.gameMode === 'creative'}
                      onChange={handleChange}
                    />
                    Creative
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="gameMode"
                      value="adventure"
                      checked={serverConfig.gameMode === 'adventure'}
                      onChange={handleChange}
                    />
                    Adventure
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="gameMode"
                      value="spectator"
                      checked={serverConfig.gameMode === 'spectator'}
                      onChange={handleChange}
                    />
                    Spectator
                  </label>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Difficulty</label>
                <div className={styles.radioGroup}>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="difficulty"
                      value="peaceful"
                      checked={serverConfig.difficulty === 'peaceful'}
                      onChange={handleChange}
                    />
                    Peaceful
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="difficulty"
                      value="easy"
                      checked={serverConfig.difficulty === 'easy'}
                      onChange={handleChange}
                    />
                    Easy
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="difficulty"
                      value="normal"
                      checked={serverConfig.difficulty === 'normal'}
                      onChange={handleChange}
                    />
                    Normal
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="difficulty"
                      value="hard"
                      checked={serverConfig.difficulty === 'hard'}
                      onChange={handleChange}
                    />
                    Hard
                  </label>
                </div>
              </div>
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

              <div className={styles.formGroup}>
                <label>World Features</label>
                <div className={styles.checkboxGroup}>
                  <label className={styles.checkboxOption}>
                    <input
                      type="checkbox"
                      name="generateStructures"
                      checked={serverConfig.generateStructures}
                      onChange={handleChange}
                    />
                    Generate Structures (villages, temples, etc.)
                  </label>
                  <label className={styles.checkboxOption}>
                    <input
                      type="checkbox"
                      name="allowNether"
                      checked={serverConfig.allowNether}
                      onChange={handleChange}
                    />
                    Enable Nether
                  </label>
                  <label className={styles.checkboxOption}>
                    <input
                      type="checkbox"
                      name="allowEnd"
                      checked={serverConfig.allowEnd}
                      onChange={handleChange}
                    />
                    Enable The End
                  </label>
                  <label className={styles.checkboxOption}>
                    <input
                      type="checkbox"
                      name="pvp"
                      checked={serverConfig.pvp}
                      onChange={handleChange}
                    />
                    Enable PvP
                  </label>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="spawnProtection">Spawn Protection Radius</label>
                <div className={styles.rangeWrapper}>
                  <input
                    type="range"
                    id="spawnProtection"
                    name="spawnProtection"
                    min="0"
                    max="64"
                    value={serverConfig.spawnProtection}
                    onChange={handleChange}
                  />
                  <span className={styles.rangeValue}>{serverConfig.spawnProtection} blocks</span>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="viewDistance">View Distance</label>
                <div className={styles.rangeWrapper}>
                  <input
                    type="range"
                    id="viewDistance"
                    name="viewDistance"
                    min="3"
                    max="32"
                    value={serverConfig.viewDistance}
                    onChange={handleChange}
                  />
                  <span className={styles.rangeValue}>{serverConfig.viewDistance} chunks</span>
                </div>
              </div>
            </div>
          )}

          {/* Plugins & Mods Tab */}
          {activeTab === 'mods' && (
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Plugins & Mods</h2>

              {(serverConfig.serverType === 'spigot' || serverConfig.serverType === 'paper') && (
                <div className={styles.formGroup}>
                  <label>Plugins</label>
                  <div className={styles.fileUpload}>
                    <div
                      className={styles.uploadBox}
                      onClick={() => pluginsRef.current?.click()}
                    >
                      <FiUpload size={32} />
                      <p>Click to upload plugin files (.jar)</p>
                    </div>
                    <input
                      type="file"
                      ref={pluginsRef}
                      style={{ display: 'none' }}
                      accept=".jar"
                      multiple
                      onChange={handlePluginsUpload}
                    />

                    {serverConfig.plugins.length > 0 && (
                      <div>
                        <p>Uploaded Plugins:</p>
                        {serverConfig.plugins.map((plugin, index) => (
                          <div key={index} className={styles.uploadedFile}>
                            <FiFileText />
                            <span className={styles.fileName}>{plugin.name}</span>
                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => removePlugin(index)}
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(serverConfig.serverType === 'forge' || serverConfig.serverType === 'fabric') && (
                <div className={styles.formGroup}>
                  <label>Mods</label>
                  <div className={styles.fileUpload}>
                    <div
                      className={styles.uploadBox}
                      onClick={() => modsRef.current?.click()}
                    >
                      <FiUpload size={32} />
                      <p>Click to upload mod files (.jar)</p>
                    </div>
                    <input
                      type="file"
                      ref={modsRef}
                      style={{ display: 'none' }}
                      accept=".jar"
                      multiple
                      onChange={handleModsUpload}
                    />

                    {serverConfig.mods.length > 0 && (
                      <div>
                        <p>Uploaded Mods:</p>
                        {serverConfig.mods.map((mod, index) => (
                          <div key={index} className={styles.uploadedFile}>
                            <FiFileText />
                            <span className={styles.fileName}>{mod.name}</span>
                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => removeMod(index)}
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
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
                <p className={styles.previewDetail}><span>Name:</span> {serverConfig.name || 'Unnamed Server'}</p>
                <p className={styles.previewDetail}>
                  <span>Type:</span>
                  {serverTypes.find(t => t.id === serverConfig.serverType)?.name || 'Vanilla'}
                </p>
                <p className={styles.previewDetail}><span>Version:</span> {serverConfig.version}</p>
                <p className={styles.previewDetail}><span>Game Mode:</span> {serverConfig.gameMode}</p>
                <p className={styles.previewDetail}><span>Difficulty:</span> {serverConfig.difficulty}</p>
              </div>
              <div>
                <p className={styles.previewDetail}>
                  <span>World:</span>
                  {serverConfig.worldFiles ? 'Custom World Import' : 'New Generated World'}
                </p>
                <p className={styles.previewDetail}>
                  <span>Plugins:</span>
                  {serverConfig.plugins.length} plugin(s)
                </p>
                <p className={styles.previewDetail}>
                  <span>Mods:</span>
                  {serverConfig.mods.length} mod(s)
                </p>
                <p className={styles.previewDetail}><span>Max Players:</span> {serverConfig.maxPlayers}</p>
              </div>
            </div>
          </div>

          <div className={styles.actionButtons}>
            <button type="button" className={`${styles.button} ${styles.secondary}`}>
              Save as Template
            </button>
            <button type="submit" className={`${styles.button} ${styles.primary}`}>
              Create Server
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}