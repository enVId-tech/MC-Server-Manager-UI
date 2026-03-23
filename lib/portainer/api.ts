import { PortainerAuth } from './auth.ts';
import { EnvironmentsMixin } from './mixins/EnvironmentMixins.ts';
import { ResourceFetchingMixin } from './mixins/ResourceFetchingMixin.ts';
import { ResourceDeletionMixin } from './mixins/ResourceDeletionMixin.ts';
import { StackControlsMixin } from './mixins/StackControlsMixin.ts';
import { logWarn } from '../utils/logger.ts';

class PortainerApiBase {
    auth: PortainerAuth;
    environmentId: number | null = null; // Environment ID, can be null on init but must be defined when used
    constructor(
        environmentId: number | null = null
    ) {
        this.environmentId = environmentId;
        this.auth = PortainerAuth.getInstance();
    }
}

const ApiStack = StackControlsMixin(
    ResourceDeletionMixin(
        ResourceFetchingMixin(
            EnvironmentsMixin(
                PortainerApiBase
            )
        )
    )
)

// Maintain singleton instance
class PortainerApi extends ApiStack {
    public static instance: PortainerApi;
    
    // Make constructor private to enforce singleton pattern
    private constructor(
        environmentId: number | null = null
    ) {
        super(environmentId);
    }
    
    public static getInstance(): PortainerApi {
        if (!PortainerApi.instance) {
            PortainerApi.instance = new PortainerApi();
        }
        return PortainerApi.instance;
    }

    public static initialize(
        environmentId: number | null = null
    ): void {
        if (this.instance) {
            logWarn('PortainerApi is already initialized. Reinitializing will overwrite the existing instance.');
        }

        PortainerApi.instance = new PortainerApi(environmentId);
    }
}

export { PortainerApi, PortainerApiBase };