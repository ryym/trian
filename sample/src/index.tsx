import * as React from 'react';
import { render } from 'react-dom';
import { createStore, createBlock, TrianProvider, useBlock, useDispatch, StoreAccess } from '../..';

const { useEffect } = React;

const store = createStore();

const Count = createBlock({
  key: 'Count',
  default: 0,
});

const Increment = ({ update }: StoreAccess) => {
  update(Count, (cnt) => cnt + 1);
};

const cleanHash = (hash: string): string => hash && hash.slice(1);

const Route = createBlock({
  key: 'Route',
  default: cleanHash(document.location.hash),
});

const SetRoute = ({ update }: StoreAccess, route: string) => {
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
  const pages = ['home', 'about'];

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
  const dispatch = useDispatch();
  return (
    <div>
      <h1>About</h1>
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

function App() {
  return (
    <TrianProvider store={store}>
      <Routes />
      <Footer />
    </TrianProvider>
  );
}

render(<App />, document.getElementById('root'));
