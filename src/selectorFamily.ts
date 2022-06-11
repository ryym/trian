import { Family } from "./family";
import { Selector, SelectorConfig, selector } from "./selector";

export interface SelectorFamilyConfig<T, Args extends unknown[]> {
  readonly key: (...args: Args) => any;
  readonly selector: (...args: Args) => SelectorConfig<T>;
}

export const selectorFamily = <T, Args extends unknown[]>(
  config: SelectorFamilyConfig<T, Args>,
): Family<Selector<T>, Args> => {
  const family = new Family({
    key: config.key,
    value: (...args) => {
      const selectorConfig = config.selector(...args);
      return selector({
        ...selectorConfig,
        onCacheInvalidate: selectorConfig.onCacheInvalidate,
        onDelete: (event) => {
          selectorConfig.onDelete && selectorConfig.onDelete(event);
          family.delete(...args);
        },
      });
    },
  });
  return family;
};
