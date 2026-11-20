/**
 * Shared types for the itzg/minecraft-server option catalog.
 *
 * The catalog describes every setting the container understands. The create wizard and the server
 * dashboard render their forms from it, and the container setup turns the chosen values back into
 * environment variables.
 */

export type ServerFamily =
    | 'vanilla'   // Mojang's server
    | 'bukkit'    // plugin servers (Spigot and forks)
    | 'modded'    // mod loaders (Forge, Fabric, ...)
    | 'hybrid'    // mods and plugins together
    | 'modpack'   // a whole modpack provides loader and version
    | 'other';    // everything else (Limbo, custom jars, ...)

export interface ServerTypeDefinition {
    /** Lowercase id used in the interface and stored with the server */
    id: string;
    /** Value of the TYPE variable */
    type: string;
    name: string;
    family: ServerFamily;
    description: string;
    supportsPlugins: boolean;
    supportsMods: boolean;
    /** Oldest Minecraft version the platform can run */
    minVersion?: string;
    /** First Minecraft version it can no longer run */
    maxVersion?: string;
    /** The Minecraft version comes from the modpack, so the VERSION variable is not offered */
    versionFromPack?: boolean;
    /** Only a single Minecraft version exists (for example Limbo) */
    fixedVersion?: string;
    /** Where the list of versions comes from, see lib/server/versionProviders.ts */
    versionSource: 'mojang' | 'paper' | 'folia' | 'purpur' | 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'none';
    /** Short note shown under the type picker */
    note?: string;
}

export type OptionKind = 'boolean' | 'text' | 'number' | 'select' | 'list' | 'multiline' | 'secret';

export type OptionTab = 'general' | 'world' | 'mods' | 'advanced';

export interface OptionChoice {
    value: string;
    label: string;
}

/**
 * Which server types an option applies to. Entries are either a type id ("paper") or a family
 * ("family:bukkit"). An option without a selector applies to every type.
 */
export type TypeSelector = string[];

export interface OptionDefinition {
    /** Environment variable name */
    env: string;
    label: string;
    description: string;
    kind: OptionKind;
    /** Value the container uses when the variable is not set. Shown as placeholder or initial state */
    defaultValue?: string | number | boolean;
    choices?: OptionChoice[];
    min?: number;
    max?: number;
    placeholder?: string;
    /** Tab of the wizard and dashboard that shows the option */
    tab: OptionTab;
    /** Heading the option is grouped under inside its tab */
    group: string;
    types?: TypeSelector;
    /** Hide the option for these types even when `types` allows them */
    excludeTypes?: TypeSelector;
    minVersion?: string;
    /** First version that no longer has the option */
    maxVersion?: string;
    /** Set when the platform controls the value. The interface shows it but does not let it change */
    locked?: string;
    /** Matching server.properties key, when there is one */
    property?: string;
    /** The value contains a credential and is hidden in the interface */
    sensitive?: boolean;
    /** Only worth showing once the user opts into extra settings */
    expert?: boolean;
    /**
     * Name of the dedicated field on the stored server settings (for example "maxPlayers") when the
     * wizard already has its own control for this option. The value is read from and written to that
     * field instead of the generic overrides, and the wizard leaves the option out of its generic panel.
     */
    formField?: string;
    /** The stored field keeps the value lowercased (for example world types) */
    formLowercase?: boolean;
}

export type OptionValue = string | number | boolean;
export type OptionValues = Record<string, OptionValue>;
