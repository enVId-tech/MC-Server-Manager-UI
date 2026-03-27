import { PortainerFactory } from "../portainer";
import { PortainerAuth } from "../portainer/auth";
import dotenv from "dotenv";

dotenv.config();

export function initializePortainer() {
    const portainerUrl = process.env.PORTAINER_URL || "http://localhost:9000";
    const portainerKey = process.env.PORTAINER_API_KEY || "your-portainer-api-key";

    PortainerAuth.initialize(portainerUrl, portainerKey);
    PortainerFactory.initialize()
}