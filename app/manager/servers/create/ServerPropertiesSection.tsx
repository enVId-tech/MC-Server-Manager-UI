import React, { useState, useEffect, useRef } from 'react';
import { 
  getServerPropertiesByCategory, 
  convertToServerPropertiesFormat 
} from '@/lib/data/serverProperties';
import PropertyInput from './PropertyInput';
import styles from './create-main.module.scss';

interface ServerPropertiesSectionProps {
  version: string;
  onPropertiesChange: (properties: Record<string, string | number | boolean>, propertiesString: string) => void;
  initialProperties?: Record<string, string | number | boolean>;
}

const ServerPropertiesSection: React.FC<ServerPropertiesSectionProps> = ({ 
  version, 
  onPropertiesChange, 
  initialProperties = {} 
}) => {
  const [properties, setProperties] = useState<Record<string, string | number | boolean>>(initialProperties);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    general: true,
    world: false,
    gameplay: false,
    performance: false,
    network: false,
    advanced: false
  });
  const previousVersionRef = useRef<string>('');

  // Update properties when version changes
  useEffect(() => {
    if (version && version !== previousVersionRef.current) {
      // Reset properties when version changes, but keep any existing values that are still valid
      const newPropertiesByCategory = getServerPropertiesByCategory(version);
      const allValidProperties = Object.values(newPropertiesByCategory).flat();
      
      const filteredProperties: Record<string, string | number | boolean> = {};
      allValidProperties.forEach(prop => {
        if (properties[prop.key] !== undefined) {
          filteredProperties[prop.key] = properties[prop.key];
        }
      });
      
      setProperties(filteredProperties);
      setErrors({});
      previousVersionRef.current = version;
    }
  }, [version, properties]);

  // Update parent component when properties change
  useEffect(() => {
    const propertiesString = convertToServerPropertiesFormat(properties);
    onPropertiesChange(properties, propertiesString);
  }, [properties, onPropertiesChange]);

  const handlePropertyChange = (key: string, value: string | number | boolean) => {
    setProperties(prev => ({
      ...prev,
      [key]: value
    }));

    // Clear error for this field
    if (errors[key]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const resetToDefaults = () => {
    setProperties({});
    setErrors({});
  };

  const loadPreset = (presetName: string) => {
    const presets: Record<string, Record<string, string | number | boolean>> = {
      survival: {
        gamemode: 'survival',
        difficulty: 'normal',
        pvp: true,
        'spawn-monsters': true,
        'spawn-animals': true,
        'allow-flight': false
      },
      creative: {
        gamemode: 'creative',
        difficulty: 'peaceful',
        pvp: false,
        'spawn-monsters': false,
        'spawn-animals': true,
        'allow-flight': true
      },
      hardcore: {
        gamemode: 'survival',
        difficulty: 'hard',
        pvp: true,
        'spawn-monsters': true,
        'spawn-animals': true,
        'allow-flight': false,
        hardcore: true
      }
    };

    if (presets[presetName]) {
      setProperties(prev => ({
        ...prev,
        ...presets[presetName]
      }));
    }
  };

  if (!version) {
    return (
      <div className={styles.formSection}>
        <div className={styles.infoBox}>
          <p>Please select a Minecraft version first to configure server properties.</p>
        </div>
      </div>
    );
  }

  const propertiesByCategory = getServerPropertiesByCategory(version);
  const categoryNames = {
    general: 'General Settings',
    world: 'World Generation',
    gameplay: 'Gameplay Rules',
    performance: 'Performance & Limits',
    network: 'Network Settings',
    advanced: 'Advanced Configuration'
  };

  const categoryIcons = {
    general: '⚙️',
    world: '🌍',
    gameplay: '🎮',
    performance: '⚡',
    network: '🌐',
    advanced: '🔧'
  };

  return (
    <div className={styles.formSection}>
      <div className={styles.serverPropertiesHeader}>
        <h2 className={styles.sectionTitle}>Server Properties</h2>
        <p className={styles.sectionDescription}>
          Configure your server settings for Minecraft {version}. 
          All settings are optional and will use sensible defaults if not specified.
        </p>
        
        <div className={styles.presetButtons}>
          <button type="button" onClick={() => loadPreset('survival')} className={styles.presetButton}>
            🗡️ Survival Preset
          </button>
          <button type="button" onClick={() => loadPreset('creative')} className={styles.presetButton}>
            🎨 Creative Preset
          </button>
          <button type="button" onClick={() => loadPreset('hardcore')} className={styles.presetButton}>
            💀 Hardcore Preset
          </button>
          <button type="button" onClick={resetToDefaults} className={styles.resetButton}>
            🔄 Reset All
          </button>
        </div>
      </div>

      {Object.entries(propertiesByCategory).map(([category, categoryProperties]) => (
        <div key={category} className={styles.propertyCategory}>
          <button
            type="button"
            className={`${styles.categoryHeader} ${expandedCategories[category] ? styles.expanded : ''}`}
            onClick={() => toggleCategory(category)}
          >
            <span className={styles.categoryIcon}>{categoryIcons[category as keyof typeof categoryIcons]}</span>
            <span className={styles.categoryTitle}>{categoryNames[category as keyof typeof categoryNames]}</span>
            <span className={styles.categoryCount}>({categoryProperties.length} settings)</span>
            <span className={styles.expandIcon}>{expandedCategories[category] ? '▼' : '▶'}</span>
          </button>

          {expandedCategories[category] && (
            <div className={styles.categoryContent}>
              <div className={styles.propertyGrid}>
                {categoryProperties.map(property => (
                  <PropertyInput
                    key={property.key}
                    property={property}
                    value={properties[property.key]}
                    onChange={handlePropertyChange}
                    error={errors[property.key]}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {Object.keys(errors).length > 0 && (
        <div className={styles.errorSummary}>
          <h4>Please fix the following errors:</h4>
          <ul>
            {Object.entries(errors).map(([key, error]) => (
              <li key={key}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.propertiesPreview}>
        <h3>Generated server.properties Preview</h3>
        <pre className={styles.previewCode}>
          {convertToServerPropertiesFormat(properties) || '# No custom properties set - defaults will be used'}
        </pre>
      </div>
    </div>
  );
};

export default ServerPropertiesSection;
