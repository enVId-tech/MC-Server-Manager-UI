import { PortainerAuth } from "./auth.ts";
import { ContainerControlsMixin } from "./mixins/ContainerControlsMixin.ts";
import { EnvironmentsMixin } from "./mixins/EnvironmentMixins.ts";
import { ResourceFetchingMixin } from "./mixins/ResourceFetchingMixin.ts";
import { ShellControlsMixin } from "./mixins/ShellControlsMixin.ts";
import { StackControlsMixin } from "./mixins/StackControlsMixin.ts";

class PortainerControls {
    auth: PortainerAuth;
    environmentId: number | null = null; // Environment ID, can be null on init but must be defined when used
    constructor(
        environmentId: number | null = null
    ) {
        this.environmentId = environmentId;
        this.auth = PortainerAuth.getInstance();
    }
}

const ControlsStack = ShellControlsMixin(
    ContainerControlsMixin(
        StackControlsMixin(
            ResourceFetchingMixin(
                EnvironmentsMixin(
                    PortainerControls
                )
            )
        )
    )
)

class PortainerControlApi extends ControlsStack {
    public static instance: PortainerControlApi;
    private constructor(
        environmentId: number | null = null
    ) {
        super(environmentId);
    }
    public static getInstance(
        environmentId: number | null = null
    ): PortainerControlApi {
        if (!PortainerControlApi.instance) {
            PortainerControlApi.instance = new PortainerControlApi(environmentId);
        }
        return PortainerControlApi.instance;
    }
}
export { PortainerControlApi };