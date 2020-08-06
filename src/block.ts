export type Comparer<T> = (a: T, b: T) => boolean;

export interface BlockConfig<T, Ctx> {
  readonly default: (ctx?: Ctx) => T;

  // If this is true, it lets the store clear the block state
  // when all components stop its subscription for this block.
  readonly autoClear?: boolean;

  readonly isSame?: Comparer<T>;
}

export class Block<T, Ctx = any> {
  readonly default: (ctx?: Ctx) => T;
  readonly autoClear: boolean;
  readonly isSame: Comparer<T>;

  constructor(config: BlockConfig<T, Ctx>) {
    this.default = config.default;
    this.autoClear = config.autoClear || false;
    this.isSame = config.isSame || Object.is;
  }
}

export const block = <T, Ctx>(config: BlockConfig<T, Ctx>): Block<T, Ctx> => {
  return new Block(config);
};
