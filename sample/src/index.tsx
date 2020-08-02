import * as React from 'react';
import { render } from 'react-dom';
import {
  createStore,
  createDispatch,
  createBlock,
  TrianProvider,
  useBlock,
  useDispatch,
  Thunk,
} from '../..';

const { useEffect } = React;

const Count = createBlock({
  default: () => 0,
  autoClear: true,
});

const Increment = (): Thunk<void, string> => ({ update }, ctx) => {
  console.log('increment with context:', ctx);
  update(Count, (cnt) => cnt + 1);
};

const cleanHash = (hash: string): string => hash && hash.slice(1);

const Route = createBlock({
  default: ({ route }: { route?: string } = {}) => route || '',
});

const SetRoute = (route: string): Thunk => ({ update }) => {
  update(Route, () => route);
};

const useRouteListen = () => {
  const dispatch = useDispatch();
  const listen = () => {
    const route = cleanHash(document.location.hash);
    dispatch(SetRoute, route);
  };

  useEffect(() => {
    window.addEventListener('hashchange', listen);
    return () => window.removeEventListener('hashchange', listen);
  }, []);
};

function Routes() {
  useRouteListen();
  const route = useBlock(Route);
  const pages = ['home', 'about', 'nocount'];

  return (
    <div>
      <header>
        <ul>
          {pages.map((page) => (
            <li key={page}>
              {route === page ? <span>{page}</span> : <a href={`#${page}`}>{page}</a>}
            </li>
          ))}
        </ul>
      </header>
      <main>
        {route === 'home' && <Home />}
        {route === 'about' && <About />}
        {route === 'nocount' && <h1>No count here</h1>}
        {route !== 'nocount' && <Footer />}
      </main>
    </div>
  );
}

function Home() {
  const count = useBlock(Count);
  const dispatch = useDispatch();
  return (
    <div>
      <h1>Home</h1>
      <p>Hello, world! count: {count}</p>
      <button onClick={() => dispatch(Increment)}>Increment</button>
    </div>
  );
}

function About() {
  const count = useBlock(Count);
  const dispatch = useDispatch();
  return (
    <div>
      <h1>About {count}</h1>
      <button onClick={() => dispatch(Increment)}>Increment</button>
    </div>
  );
}

function Footer() {
  const count = useBlock(Count);
  useEffect(() => {
    console.log('count changed', count);
  }, [count]);

  return (
    <footer>
      <p>Current count: {count}</p>
    </footer>
  );
}

const store = createStore({
  route: cleanHash(document.location.hash),
});

const customDispatch = createDispatch(store, 'samle-context');

function App() {
  return (
    <TrianProvider store={store} dispatch={customDispatch}>
      <Routes />
    </TrianProvider>
  );
}

render(<App />, document.getElementById('root'));
