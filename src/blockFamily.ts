import { Block, BlockConfig, block } from "./block";
import { Family } from "./family";

export interface BlockFamilyConfig<T, Args extends unknown[]> {
  readonly key: (...args: Args) => any;
  readonly block: (...args: Args) => BlockConfig<T>;
}

export const blockFamily = <T, Args extends unknown[]>(
  config: BlockFamilyConfig<T, Args>,
): Family<Block<T>, Args> => {
  const family = new Family({
    key: config.key,
    value: (...args) => {
      const blockConfig = config.block(...args);
      return block({
        ...blockConfig,
        onUpdate: blockConfig.onUpdate,
        onDelete: (event) => {
          blockConfig.onDelete && blockConfig.onDelete(event);
          family.delete(...args);
        },
      });
    },
  });
  return family;
};
