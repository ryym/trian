import { Family } from "./family";
import { Loader, LoaderConfig, loader } from "./loader";

export interface LoaderFamilyConfig<T, Ctx, Args extends unknown[]> {
  readonly key: (...args: Args) => any;
  readonly loader: (...args: Args) => LoaderConfig<T, Ctx>;
}

export const loaderFamily = <T, Ctx, Args extends unknown[]>(
  config: LoaderFamilyConfig<T, Ctx, Args>,
): Family<Loader<T, Ctx>, Args> => {
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
