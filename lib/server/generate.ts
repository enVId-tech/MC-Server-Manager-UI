import { PortainerFactory } from "../portainer";

const instance = PortainerFactory.getInstance();

const generateCompose = (name: string, type: string, version: string, secret: string) => {

  return instance.createContainer({
    name: name,
    Image: 'itzg/minecraft-server',
    Env: [
      `TYPE=${type}`,
      `VERSION=${version}`,
      `VELOCITY_SECRET=${secret}`,
      `ONLINE_MODE=FALSE`,
      `EULA=TRUE`
    ],
  });
}

