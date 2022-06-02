import { Family } from "./family";
import { Selector, AsyncSelector, SelectorConfig, AsyncSelectorConfig, selector } from "./selector";

export interface SelectorFamilyConfig<T, Args extends unknown[]> {
  readonly key: (...args: Args) => any;
  readonly selector: (...args: Args) => SelectorConfig<T>;
}

export interface AsyncSelectorFamilyConfig<T, Args extends unknown[]> {
  readonly key: (...args: Args) => any;
  readonly selector: (...args: Args) => AsyncSelectorConfig<T>;
}

export interface NewSelectorFamily {
  <T, Args extends unknown[]>(config: SelectorFamilyConfig<T, Args>): Family<Selector<T>, Args>;
  async<T, Args extends unknown[]>(
    config: AsyncSelectorFamilyConfig<T, Args>,
  ): Family<AsyncSelector<T>, Args>;
}

const createSelectorFamilyCreator = () => {
  const selectorFamily = (<T, Args extends unknown[]>(
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
  }) as NewSelectorFamily;

  const asyncSelectorFamily = <T, Args extends any[]>(
    config: AsyncSelectorFamilyConfig<T, Args>,
  ): Family<AsyncSelector<T>, Args> => {
    const family = new Family({
      key: config.key,
      value: (...args) => {
        const selectorConfig = config.selector(...args);
        return selector.async({
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

  selectorFamily.async = asyncSelectorFamily;
  return selectorFamily;
};

export const selectorFamily = createSelectorFamilyCreator();
