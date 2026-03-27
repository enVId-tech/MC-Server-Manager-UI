import { PortainerAuth } from './auth.ts';
import { EnvironmentsMixin } from './mixins/EnvironmentMixins.ts';
import { ResourceFetchingMixin } from './mixins/ResourceFetchingMixin.ts';
import { ResourceDeletionMixin } from './mixins/ResourceDeletionMixin.ts';
import { StackControlsMixin } from './mixins/StackControlsMixin.ts';
import { logWarn } from '../utils/logger.ts';
import { ContainerControlsMixin } from './mixins/ContainerControlsMixin.ts';

class PortainerApiBase {
    auth: PortainerAuth;
    environmentId: number | null = null; // Env Id, is null by default, will be set to the first available environment if not provided
    constructor(
        environmentId: number | null = null
    ) {
        this.environmentId = environmentId;
        this.auth = PortainerAuth.getInstance();
    }
}

const ApiStack = ContainerControlsMixin(
    StackControlsMixin(
        ResourceDeletionMixin(
            ResourceFetchingMixin(
                EnvironmentsMixin(
                    PortainerApiBase
                )
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