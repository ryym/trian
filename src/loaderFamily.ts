import { Family } from "./family";
import { Loader, LoaderConfig, loader } from "./loader";

export interface LoaderFamilyConfig<T, Args extends unknown[]> {
  readonly key: (...args: Args) => any;
  readonly loader: (...args: Args) => LoaderConfig<T>;
}

export const loaderFamily = <T, Args extends unknown[]>(
  config: LoaderFamilyConfig<T, Args>,
): Family<Loader<T>, Args> => {
  const family = new Family({
    key: config.key,
    value: (...args) => {
      const loaderConfig = config.loader(...args);
      return loader({
        ...loaderConfig,
        onCacheInvalidate: loaderConfig.onCacheInvalidate,
        onDelete: (event) => {
          loaderConfig.onDelete && loaderConfig.onDelete(event);
          family.delete(...args);
        },
      });
    },
  });
  return family;
};
