import { Block, BlockConfig, block } from './block';
import { Family } from './family';

export interface BlockFamilyConfig<T, Ctx, Args extends unknown[]> {
  readonly key: (...args: Args) => any;
  readonly block: (...args: Args) => BlockConfig<T, Ctx>;
}

export const blockFamily = <T, Ctx, Args extends unknown[]>(
  config: BlockFamilyConfig<T, Ctx, Args>
): Family<Block<T, Ctx>, Args> => {
  const family = new Family({
    key: config.key,
    value: (...args) => {
      const blockConfig = config.block(...args);
      return block({
        ...blockConfig,
        onUpdate: (event) => {
          blockConfig.onUpdate && blockConfig.onUpdate(event);
          if (event.type === 'Removed') {
            family.remove(...args);
          }
        },
      });
    },
  });
  return family;
};
