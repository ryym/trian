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
    return new Family({
      key: config.key,
      value: (...args) => selector(config.selector(...args)),
    });
  }) as NewSelectorFamily;

  const asyncSelectorFamily = <T, Args extends any[]>(
    config: AsyncSelectorFamilyConfig<T, Args>
  ): Family<AsyncSelector<T>, Args> => {
    return new Family({
      key: config.key,
      value: (...args) => selector.async(config.selector(...args)),
    });
  };

  selectorFamily.async = asyncSelectorFamily;
  return selectorFamily;
};

export const selectorFamily = createSelectorFamilyCreator();
