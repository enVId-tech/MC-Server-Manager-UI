// If changes are detected in the objects, update all documents in the database
// to ensure they have the new fields.
import dbConnect from './dbConnect.ts';
import User from '../objects/User.ts';
import Server from '../objects/Server.ts';
import { Schema, Model } from 'mongoose';

interface SchemaUpdateResult {
    modelName: string;
    documentsUpdated: number;
    fieldsAdded: string[];
    fieldsUpdated: string[];
}

interface DatabaseDocument {
    _id: string;
    [key: string]: unknown;
}

interface UpdateObject {
    [key: string]: unknown;
}

interface SchemaType {
    constructor: {
        name: string;
    };
    options?: {
        default?: unknown;
    };
    path?: string;
}

export async function updateDatabaseSchema(): Promise<SchemaUpdateResult[]> {
    await dbConnect();
    
    const results: SchemaUpdateResult[] = [];
    
    // Define models to update
    const modelsToUpdate = [
        { model: User, name: 'User' },
        { model: Server, name: 'Server' }
    ];
    
    for (const { model, name } of modelsToUpdate) {
        const result = await updateModelDocuments(model, name);
        results.push(result);
    }
    
    return results;
}

async function updateModelDocuments(model: Model<DatabaseDocument>, modelName: string): Promise<SchemaUpdateResult> {
    const schema = model.schema;
    const schemaDefaults = extractSchemaDefaults(schema);
    const schemaFields = Object.keys(schema.paths);
    
    console.log(`Updating ${modelName} documents...`);
    console.log(`Schema fields:`, schemaFields);
    console.log(`Schema defaults:`, schemaDefaults);
    
    // Get all documents for this model
    const documents = await model.find({}).lean();
    
    let documentsUpdated = 0;
    const fieldsAdded: string[] = [];
    const fieldsUpdated: string[] = [];
    
    for (const doc of documents) {
        const updates: UpdateObject = {};
        let hasUpdates = false;
        
        // Check each schema field
        for (const fieldPath of schemaFields) {
            // Skip internal mongoose fields
            if (fieldPath.startsWith('_') || fieldPath === '__v') continue;
            
            const fieldValue = getNestedValue(doc, fieldPath);
            const schemaPath = schema.paths[fieldPath] as SchemaType;
            
            // Handle missing fields
            if (fieldValue === undefined || fieldValue === null) {
                const defaultValue = getFieldDefault(schemaPath, schemaDefaults[fieldPath]);
                
                if (defaultValue !== undefined) {
                    setNestedValue(updates, fieldPath, defaultValue);
                    hasUpdates = true;
                    
                    if (!fieldsAdded.includes(fieldPath)) {
                        fieldsAdded.push(fieldPath);
                    }
                }
            }
            // Handle fields that need type conversion or validation
            else {
                const convertedValue = convertFieldType(fieldValue, schemaPath);
                if (convertedValue !== fieldValue) {
                    setNestedValue(updates, fieldPath, convertedValue);
                    hasUpdates = true;
                    
                    if (!fieldsUpdated.includes(fieldPath)) {
                        fieldsUpdated.push(fieldPath);
                    }
                }
            }
        }
        
        // Apply updates if any
        if (hasUpdates) {
            await model.updateOne({ _id: doc._id }, { $set: updates });
            documentsUpdated++;
            console.log(`Updated ${modelName} document ${doc._id}:`, updates);
        }
    }
    
    console.log(`${modelName} update complete: ${documentsUpdated} documents updated`);
    
    return {
        modelName,
        documentsUpdated,
        fieldsAdded,
        fieldsUpdated
    };
}

function extractSchemaDefaults(schema: Schema): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    
    for (const [path, schemaType] of Object.entries(schema.paths)) {
        const typedSchemaType = schemaType as SchemaType;
        if (typedSchemaType.options && typedSchemaType.options.default !== undefined) {
            defaults[path] = typedSchemaType.options.default;
        }
    }
    
    return defaults;
}

function getFieldDefault(schemaPath: SchemaType, explicitDefault?: unknown): unknown {
    // Use explicit default if provided
    if (explicitDefault !== undefined) {
        return typeof explicitDefault === 'function' ? (explicitDefault as () => unknown)() : explicitDefault;
    }
    
    // Use schema default if available
    if (schemaPath.options && schemaPath.options.default !== undefined) {
        const defaultValue = schemaPath.options.default;
        return typeof defaultValue === 'function' ? (defaultValue as () => unknown)() : defaultValue;
    }
    
    // Infer default based on type
    const schemaTypeName = schemaPath.constructor.name;
    
    switch (schemaTypeName) {
        case 'SchemaString':
            return '';
        case 'SchemaNumber':
            return 0;
        case 'SchemaBoolean':
            return false;
        case 'SchemaDate':
            return new Date();
        case 'SchemaArray':
            return [];
        case 'SchemaObjectId':
            return null;
        case 'Mixed':
            return {};
        default:
            return null;
    }
}

function convertFieldType(value: unknown, schemaPath: SchemaType): unknown {
    const schemaTypeName = schemaPath.constructor.name;
    
    try {
        switch (schemaTypeName) {
            case 'SchemaString':
                return typeof value === 'string' ? value : String(value);
            case 'SchemaNumber':
                return typeof value === 'number' ? value : Number(value);
            case 'SchemaBoolean':
                return typeof value === 'boolean' ? value : Boolean(value);
            case 'SchemaDate':
                return value instanceof Date ? value : new Date(value as string | number);
            case 'SchemaArray':
                return Array.isArray(value) ? value : [value];
            default:
                return value;
        }
    } catch (error) {
        console.warn(`Failed to convert field type for ${schemaPath.path}:`, error);
        return value;
    }
}

function getNestedValue(obj: DatabaseDocument, path: string): unknown {
    return path.split('.').reduce((current, key) => {
        if (current && typeof current === 'object' && key in current) {
            return (current as Record<string, unknown>)[key];
        }
        return undefined;
    }, obj as unknown);
}

function setNestedValue(obj: UpdateObject, path: string, value: unknown): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    
    const target = keys.reduce((current, key) => {
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        return current[key] as UpdateObject;
    }, obj);
    
    target[lastKey] = value;
}

// Utility function to run schema updates manually
export async function runSchemaUpdate(): Promise<void> {
    try {
        console.log('Starting database schema update...');
        const results = await updateDatabaseSchema();
        
        console.log('\n=== Schema Update Results ===');
        for (const result of results) {
            console.log(`\n${result.modelName}:`);
            console.log(`  Documents updated: ${result.documentsUpdated}`);
            console.log(`  Fields added: ${result.fieldsAdded.join(', ') || 'None'}`);
            console.log(`  Fields updated: ${result.fieldsUpdated.join(', ') || 'None'}`);
        }
        
        console.log('\nDatabase schema update completed successfully!');
    } catch (error) {
        console.error('Error updating database schema:', error);
        throw error;
    }
}

// Auto-update function that can be called on app startup
export async function autoUpdateSchemaOnStartup(): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
        try {
            await runSchemaUpdate();
        } catch (error) {
            console.warn('Schema auto-update failed:', error);
            // Don't throw in development to avoid breaking the app
        }
    }
}