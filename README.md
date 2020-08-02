# Trian

Trian is my experimental state management library for [React][react].

[react]: https://reactjs.org/

- Type Safe
- Distributed - No single state object
- Hook independent - No React requirement for just running

## Motivation

- I like React Hooks, but I don't want to lock all the logic into Hooks.
    - Is it really a good practice to manage any states and effects by Hook? Even if they are UI-independent?
- [Recoil] seems good so I made a minimum version that suits my preference.

[recoil]: https://github.com/facebookexperimental/recoil

## Code Sample

### Play without React

```typescript
import { block, createStore, createDispatch, Thunk } from 'trian';

const Count = block({
    default: () => 0,
});

const Increment = (n: number = 1): Thunk => ({ update }) => {
  update(Count, (cnt) => cnt + n);
};

const store = createStore();

const dispatch = createDispatch(store);

console.log(store.selectValue(Count)); //=> 0

dispatch(Increment);
console.log(store.selectValue(Count)); //=> 1

dispatch(Increment, 20);
console.log(store.selectValue(Count)); //=> 21
```

### Use with React

```typescript
import React from 'react';
import ReactDOM from 'react-dom';
import { block, createStore, TrianProvider, useValue, useDispatch, Thunk } from 'trian';

const Count = block({
  default: () => 0,
});

const Increment = (n: number = 1): Thunk => ({ update }) => {
  update(Count, (cnt) => cnt + n);
};

function Counter() {
  const count = useValue(Count);
  const dispatch = useDispatch();
  return (
    <div>
      <h1>Count: {count}</h1>
      <button onClick={() => dispatch(Increment)}>Increment</button>
    </div>
  );
}

const store = createStore();

ReactDOM.render(
  <TrianProvider store={store}>
    <Counter />
  </TrianProvider>,
  document.getElementById('root')
);
```

```javascript
const store = createStore();

// FYI: You can customize the dispatcher.
// This maybe be useful for component testing.
const histories = [];
const dispatch = (action, ...args) => {
  histories.push({ action, args });
};
render(
  <TrianProvider store={store} dispatch={dispatch}>
    <Counter />
  </TrianProvider>
);

// FYI: You can change the state from outside of React components.
// This maybe be useful for component testing.
setTimeout(() => {
  store.setValue(Count, 100); //=> Update view
}, 1000);
```
