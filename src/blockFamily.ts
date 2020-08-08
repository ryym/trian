import { Block, BlockConfig, block } from './block';
import { Family } from './family';

export interface BlockFamilyConfig<T, Ctx, Args extends any[]> {
  readonly key: (...args: Args) => any;
  readonly block: (...args: Args) => BlockConfig<T, Ctx>;
}

export const blockFamily = <T, Ctx, Args extends any[]>(
  config: BlockFamilyConfig<T, Ctx, Args>
): Family<Block<T, Ctx>, Args> => {
  return new Family({
    key: config.key,
    value: (...args) => block(config.block(...args)),
  });
};
