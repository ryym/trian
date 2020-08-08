import { Family } from './family';
import { Selector, AsyncSelector, SelectorConfig, AsyncSelectorConfig, selector } from './selector';

export interface SelectorFamilyConfig<T, Args extends any[]> {
  readonly key: (...args: Args) => any;
  readonly selector: (...args: Args) => SelectorConfig<T>;
}

export interface AsyncSelectorFamilyConfig<T, Args extends any[]> {
  readonly key: (...args: Args) => any;
  readonly selector: (...args: Args) => AsyncSelectorConfig<T>;
}

export interface NewSelectorFamily {
  <T, Args extends any[]>(config: SelectorFamilyConfig<T, Args>): Family<Selector<T>, Args>;
  async<T, Args extends any[]>(
    config: AsyncSelectorFamilyConfig<T, Args>
  ): Family<AsyncSelector<T>, Args>;
}

const createSelectorFamilyCreator = () => {
  const selectorFamily = (<T, Args extends any[]>(
    config: SelectorFamilyConfig<T, Args>
  ): Family<Selector<T>, Args> => {
    const family = new Family({
      key: config.key,
      value: (...args) => {
        const selectorConfig = config.selector(...args);
        return selector({
          ...selectorConfig,
          onCacheInvalidate: (event) => {
            selectorConfig.onCacheInvalidate && selectorConfig.onCacheInvalidate(event);
            if (event.removed) {
              family.remove(...args);
            }
          },
        });
      },
    });
    return family;
  }) as NewSelectorFamily;

  const asyncSelectorFamily = <T, Args extends any[]>(
    config: AsyncSelectorFamilyConfig<T, Args>
  ): Family<AsyncSelector<T>, Args> => {
    const family = new Family({
      key: config.key,
      value: (...args) => {
        const selectorConfig = config.selector(...args);
        return selector.async({
          ...selectorConfig,
          onCacheInvalidate: (event) => {
            selectorConfig.onCacheInvalidate && selectorConfig.onCacheInvalidate(event);
            if (event.removed) {
              family.remove(...args);
            }
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
