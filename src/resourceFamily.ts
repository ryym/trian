import { Family } from "./family";
import { Resource, ResourceConfig, resource } from "./resource";

export interface ResourceFamilyConfig<T, Args extends unknown[]> {
  readonly key: (...args: Args) => any;
  readonly resource: (...args: Args) => ResourceConfig<T>;
}

export const resourceFamily = <T, Args extends unknown[]>(
  config: ResourceFamilyConfig<T, Args>,
): Family<Resource<T>, Args> => {
  const family = new Family({
    key: config.key,
    value: (...args) => {
      const resourceConfig = config.resource(...args);
      return resource({
        ...resourceConfig,
      });
    },
  });
  return family;
};
