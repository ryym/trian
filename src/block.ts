export type Comparer<T> = (a: T, b: T) => boolean;

export type BlockUpdateEvent<T> = { type: "NewValue"; value: T } | { type: "Removed" };

export type BlockDeletionEvent<T> = { lastValue: T };

export interface BlockConfig<T, Ctx> {
  readonly default: (ctx?: Ctx) => T;
  readonly isSame?: Comparer<T>;
  readonly onUpdate?: (event: BlockUpdateEvent<T>) => void;
  readonly onDelete?: (event: BlockDeletionEvent<T>) => void;
}

export class Block<T, Ctx = any> {
  readonly default: (ctx?: Ctx) => T;
  readonly isSame: Comparer<T>;
  readonly onUpdate?: (event: BlockUpdateEvent<T>) => void;
  readonly onDelete?: (event: BlockDeletionEvent<T>) => void;

  constructor(config: BlockConfig<T, Ctx>) {
    this.default = config.default;
    this.isSame = config.isSame || Object.is;
    this.onUpdate = config.onUpdate;
    this.onDelete = config.onDelete;
  }
}

export const block = <T, Ctx = unknown>(config: BlockConfig<T, Ctx>): Block<T, Ctx> => {
  return new Block(config);
};
