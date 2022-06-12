export type Comparer<T> = (a: T, b: T) => boolean;

export interface BlockChangeEvent<T> {
  readonly lastValue: T;
  readonly value: T;
}

export interface BlockDeletionEvent<T> {
  readonly lastValue: T;
}

export interface BlockConfig<T, Ctx> {
  readonly name?: string;
  readonly default: (ctx?: Ctx) => T;
  readonly isSame?: Comparer<T>;
  readonly onUpdate?: (event: BlockChangeEvent<T>) => void;
  readonly onDelete?: (event: BlockDeletionEvent<T>) => void;
}

export class Block<T, Ctx = any> {
  readonly name?: string;
  readonly default: (ctx?: Ctx) => T;
  readonly isSame: Comparer<T>;
  readonly onUpdate?: (event: BlockChangeEvent<T>) => void;
  readonly onDelete?: (event: BlockDeletionEvent<T>) => void;

  constructor(config: BlockConfig<T, Ctx>) {
    this.name = config.name;
    this.default = config.default;
    this.isSame = config.isSame || Object.is;
    this.onUpdate = config.onUpdate;
    this.onDelete = config.onDelete;
  }
}

export const block = <T, Ctx = unknown>(config: BlockConfig<T, Ctx>): Block<T, Ctx> => {
  return new Block(config);
};
