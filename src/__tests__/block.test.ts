import { block } from '../block';

describe('Block', () => {
  it('has a default value', () => {
    const count = block({ default: () => 0 });
    expect(count.default()).toEqual(0);
  });
});
