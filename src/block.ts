export type Comparer<T> = (a: T, b: T) => boolean;

export interface BlockConfig<T, Ctx> {
  readonly default: (ctx?: Ctx) => T;
  readonly isSame?: Comparer<T>;
}

export class Block<T, Ctx = any> {
  readonly default: (ctx?: Ctx) => T;
  readonly isSame: Comparer<T>;

  constructor(config: BlockConfig<T, Ctx>) {
    this.default = config.default;
    this.isSame = config.isSame || Object.is;
  }
}

export const block = <T, Ctx = unknown>(config: BlockConfig<T, Ctx>): Block<T, Ctx> => {
  return new Block(config);
};
