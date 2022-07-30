import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  createStore,
  createDispatch,
  block,
  selector,
  resource,
  Thunk,
  createContextKey,
} from "../..";
import { TrianProvider, useValue, useResourceValue, useDispatch } from "../../react";

const { useEffect, useState } = React;

const Count = block({
  default: () => 0,
});

const SuperCount = selector({
  get: ({ get }) => {
    console.log("compute super count");
    return get(Count) + 100;
  },
});

const Increment = (): Thunk => {
  return ({ set }) => {
    console.log("increment");
    set(Count, (cnt) => cnt + 1);
  };
};

const cleanHash = (hash: string): string => hash && hash.slice(1);

const RouteContextKey = createContextKey<string>();

const Route = block({
  default: (ctx) => ctx.get(RouteContextKey) || "",
});

const SetRoute = (route: string): Thunk => {
  return ({ set }) => {
    set(Route, route);
  };
};

const useRouteListen = () => {
  const dispatch = useDispatch();
  const listen = () => {
    const route = cleanHash(document.location.hash);
    dispatch(SetRoute, route);
  };

  useEffect(() => {
    window.addEventListener("hashchange", listen);
    return () => window.removeEventListener("hashchange", listen);
  }, []);
};

function Routes() {
  useRouteListen();
  const route = useValue(Route);
  const pages = ["home", "about", "nocount"];

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
        {route === "home" && <Home />}
        {route === "about" && <About />}
        {route === "nocount" && <h1>No count here</h1>}
        {route !== "nocount" && <Footer />}
      </main>
    </div>
  );
}

function Home() {
  const count = useValue(Count);
  const dispatch = useDispatch();
  const asyncIncrement = () => {
    setTimeout(() => dispatch(Increment), 1000);
  };
  return (
    <div>
      <h1>Home</h1>
      <p>Hello, world! count: {count}</p>
      <button onClick={() => dispatch(Increment)}>Increment</button>
      <button onClick={asyncIncrement}>Async Increment</button>
    </div>
  );
}

function About() {
  const count = useValue(Count);
  const dispatch = useDispatch();
  return (
    <div>
      <h1>About {count}</h1>
      <button onClick={() => dispatch(Increment)}>Increment</button>
    </div>
  );
}

function Footer() {
  const count = useValue(SuperCount);
  useEffect(() => {
    console.log("SuperCount changed", count);
  }, [count]);
  console.log("render footer");

  return (
    <footer>
      <p>Current count: {count}</p>
    </footer>
  );
}

const store = createStore();
store.context.set(RouteContextKey, cleanHash(document.location.hash));

const customDispatch = createDispatch(store);

const AsyncCount = resource({
  fetch: ({ get }) => {
    console.log("compute async count");
    return new Promise<number>((resolve, reject) => {
      setTimeout(() => {
        let count = get(Count);
        if (count === 5) {
          reject("test-error");
        }
        resolve(count * 2);
      }, 1000);
    });
  },
});

function UseAsync({ id }: any) {
  const result = useResourceValue(AsyncCount);
  return (
    <div>
      <h1>Async: {result}</h1>
    </div>
  );
}

function UseAsyncWrapper() {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <button onClick={() => setShown(!shown)}>Toggle</button>
      {shown ? <UseAsync id="use-async2" /> : <div>hidden</div>}
    </div>
  );
}

function App() {
  return (
    <TrianProvider store={store} dispatch={customDispatch}>
      <React.Suspense fallback={<div>async1-fallback</div>}>
        <UseAsync id="use-async1" />
      </React.Suspense>
      <React.Suspense fallback={<div>async2-fallback</div>}>
        <UseAsyncWrapper />
      </React.Suspense>
      <Routes />
    </TrianProvider>
  );
}

const container = document.getElementById("root");
createRoot(container!).render(<App />);
