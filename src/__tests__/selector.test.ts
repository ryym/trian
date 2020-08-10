import { block, Block } from '../block';
import { selector, Get } from '../selector';

describe('Selector', () => {
  const mockGet: Get = (key) => {
    if (key instanceof Block) {
      return key.default();
    }
    return key.run({ get: mockGet });
  };

  it('constructs a derived state', () => {
    const volume = block({ default: () => 3 });
    const word = block({ default: () => 'Hello' });
    const greet = selector({
      get: ({ get }) => {
        return `${get(word)}${'!'.repeat(get(volume))}`;
      },
    });

    const value = greet.run({ get: mockGet });
    expect(value).toEqual('Hello!!!');
  });
});
