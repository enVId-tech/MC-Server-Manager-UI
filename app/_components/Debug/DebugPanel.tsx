import React from 'react';

interface DebugPanelProps {
  // World features from the create page state
  worldFeatures: Record<string, boolean | number>;
  serverProperties: Record<string, string | number | boolean>;
}

/**
 * Debug panel to visualize world features and advanced properties synchronization
 * This component helps verify that bidirectional sync is working correctly
 */
export const DebugPanel: React.FC<DebugPanelProps> = ({ worldFeatures, serverProperties }) => {
  // Property mapping for reference
  const propertyMapping: Record<string, string> = {
    allowNether: 'allow-nether',
    allowEnd: 'allow-the-end',
    hardcore: 'hardcore',
    enablePlayerList: 'enable-status',
    netherPortals: 'allow-nether',
    endPortals: 'allow-the-end',
    weatherCycle: 'do-weather-cycle',
    daylightCycle: 'do-daylight-cycle',
    mobSpawning: 'spawn-monsters',
    animalSpawning: 'spawn-animals',
    villagerSpawning: 'spawn-npcs',
    structureGeneration: 'generate-structures',
    fireDamage: 'do-fire-tick',
    mobGriefing: 'do-mob-griefing',
    keepInventory: 'keep-inventory',
    naturalRegeneration: 'natural-regeneration',
    showDeathMessages: 'show-death-messages',
    reducedDebugInfo: 'reduced-debug-info',
    spectateOtherTeams: 'spectators-generate-chunks',
    announceAdvancements: 'announce-player-achievements',
    commandBlockOutput: 'command-block-output',
    sendCommandFeedback: 'send-command-feedback',
    doLimitedCrafting: 'do-limited-crafting',
    maxEntityCramming: 'max-entity-cramming',
    randomTickSpeed: 'random-tick-speed',
    maxWorldSize: 'max-world-size',
    worldBorder: 'max-world-size',
    spawnRadius: 'spawn-protection',
  };

  return (
    <div style={{ 
      position: 'fixed', 
      bottom: '20px', 
      right: '20px', 
      background: '#1a1a1a', 
      color: '#fff', 
      padding: '20px', 
      borderRadius: '8px',
      border: '1px solid #333',
      maxWidth: '500px',
      maxHeight: '500px',
      overflow: 'auto',
      fontSize: '12px',
      fontFamily: 'monospace',
      zIndex: 1000
    }}>
      <h3 style={{ margin: '0 0 10px 0', color: '#00ff00' }}>
        World Features ↔ Advanced Properties Debug
      </h3>
      
      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 5px 0', color: '#ffff00' }}>World Features:</h4>
        {Object.entries(worldFeatures).map(([key, value]) => {
          const mappedProperty = propertyMapping[key];
          const syncedValue = serverProperties[mappedProperty];
          const isInSync = String(value) === String(syncedValue);
          
          return (
            <div key={key} style={{ 
              marginBottom: '2px',
              color: isInSync ? '#00ff00' : '#ff4444'
            }}>
              <span style={{ color: '#00ffff' }}>{key}:</span> {String(value)}
              {mappedProperty && (
                <span style={{ color: '#888', fontSize: '10px' }}>
                  {' → '}{mappedProperty}: {String(syncedValue)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 5px 0', color: '#ffff00' }}>Advanced Properties:</h4>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: '5px' }}>
          (Green = synced with world features, White = standalone)
        </div>
        {Object.entries(serverProperties).map(([key, value]) => {
          const isMapped = Object.values(propertyMapping).includes(key);
          
          return (
            <div key={key} style={{ 
              marginBottom: '2px',
              color: isMapped ? '#00ff00' : '#ffffff'
            }}>
              <span style={{ color: '#ff00ff' }}>{key}:</span> {String(value)}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: '10px', color: '#888' }}>
        💡 Green = synchronized, Red = out of sync
      </div>
    </div>
  );
};

export default DebugPanel;
