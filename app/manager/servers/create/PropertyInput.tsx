import React from 'react';
import { PropertyDefinition } from '@/lib/data/serverProperties';
import styles from './create-main.module.scss';

interface PropertyInputProps {
  property: PropertyDefinition;
  value: string | number | boolean | undefined;
  onChange: (key: string, value: string | number | boolean) => void;
  error?: string;
}

const PropertyInput: React.FC<PropertyInputProps> = ({ property, value, onChange, error }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    // Prevent changes if the property is server-managed and not client editable
    if (property.serverManaged && !property.clientEditable) {
      return;
    }

    let newValue: string | number | boolean = e.target.value;
    
    // Convert value based on property type
    switch (property.type) {
      case 'boolean':
        newValue = e.target.value === 'true';
        break;
      case 'number':
        newValue = e.target.value === '' ? '' : Number(e.target.value);
        break;
      default:
        newValue = e.target.value;
    }
    
    onChange(property.key, newValue);
  };

  const isReadOnly = property.serverManaged && !property.clientEditable;

  const renderInput = () => {
    const baseClassName = error ? styles.inputError : '';
    const readOnlyClassName = isReadOnly ? styles.readOnlyInput : '';
    const className = `${baseClassName} ${readOnlyClassName}`.trim();

    switch (property.type) {
      case 'boolean':
        return (
          <select
            value={value === true ? 'true' : value === false ? 'false' : ''}
            onChange={handleChange}
            className={className}
            disabled={isReadOnly}
            title={isReadOnly ? 'This field is managed by the server and cannot be modified' : ''}
          >
            <option value="">Default ({property.defaultValue ? 'true' : 'false'})</option>
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        );

      case 'select':
        return (
          <select
            value={String(value || '')}
            onChange={handleChange}
            className={className}
            disabled={isReadOnly}
            title={isReadOnly ? 'This field is managed by the server and cannot be modified' : ''}
          >
            <option value="">Default ({property.defaultValue})</option>
            {property.validValues?.map(validValue => (
              <option key={validValue} value={validValue}>
                {validValue}
              </option>
            ))}
          </select>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value === undefined || value === null ? '' : String(value)}
            onChange={handleChange}
            min={property.min}
            max={property.max}
            placeholder={`Default: ${property.defaultValue}`}
            className={className}
            disabled={isReadOnly}
            readOnly={isReadOnly}
            title={isReadOnly ? 'This field is managed by the server and cannot be modified' : ''}
          />
        );

      case 'string':
      default:
        // Use textarea for MOTD and other potentially long strings
        if (property.key === 'motd' || (property.placeholder && property.placeholder.length > 50)) {
          return (
            <textarea
              value={String(value || '')}
              onChange={handleChange}
              placeholder={property.placeholder || `Default: ${property.defaultValue}`}
              rows={3}
              className={className}
              disabled={isReadOnly}
              readOnly={isReadOnly}
              title={isReadOnly ? 'This field is managed by the server and cannot be modified' : ''}
            />
          );
        }
        
        return (
          <input
            type="text"
            value={String(value || '')}
            onChange={handleChange}
            placeholder={property.placeholder || `Default: ${property.defaultValue}`}
            className={className}
            disabled={isReadOnly}
            readOnly={isReadOnly}
            title={isReadOnly ? 'This field is managed by the server and cannot be modified' : ''}
          />
        );
    }
  };

  return (
    <div className={styles.formGroup}>
      <label htmlFor={property.key}>
        {property.displayName}
        {property.serverManaged && (
          <span className={styles.serverManagedBadge} title="This field is automatically managed by the server">
            (Server Managed)
          </span>
        )}
        {property.versionIntroduced && (
          <span className={styles.versionBadge} title={`Available since Minecraft ${property.versionIntroduced}`}>
            v{property.versionIntroduced}+
          </span>
        )}
        {property.type === 'number' && property.min !== undefined && property.max !== undefined && (
          <span className={styles.fieldRange}> ({property.min}-{property.max})</span>
        )}
      </label>
      {renderInput()}
      {property.description && (
        <small className={styles.fieldDescription}>
          {property.description}
          {property.serverManaged && (
            <span className={styles.serverManagedNote}>
              {' '}This value will be automatically set by the server during deployment.
            </span>
          )}
        </small>
      )}
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
};

export default PropertyInput;
