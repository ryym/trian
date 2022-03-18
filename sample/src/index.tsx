import * as React from "react";
import { render } from "react-dom";
import { createStore, createDispatch, block, selector, Thunk } from "../..";
import { TrianProvider, useValue, useAsyncValue, useDispatch } from "../../react";

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

const Increment = (): Thunk<void, string> => {
  return ({ set }, ctx) => {
    console.log("increment with context:", ctx);
    set(Count, (cnt) => cnt + 1);
  };
};

const cleanHash = (hash: string): string => hash && hash.slice(1);

const Route = block({
  default: ({ route }: { route?: string } = {}) => route || "",
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

const store = createStore({
  route: cleanHash(document.location.hash),
});

const customDispatch = createDispatch(store, "sample-context");

const AsyncCount = selector.async({
  get: ({ get }) =>
    new Promise<number>((resolve) => {
      setTimeout(() => {
        let count = get(Count);
        resolve(count * 2);
      }, 1000);
    }),
});

function UseAsync({ id }: any) {
  const result = useAsyncValue(AsyncCount);
  console.log("render", id, result);
  if (result.status === "Error") {
    console.error(result.error);
  }
  return (
    <div>
      <h1>Async</h1>
      <p>{JSON.stringify(result)}</p>
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
      <UseAsync id="use-async1" />
      <UseAsyncWrapper />
      <Routes />
    </TrianProvider>
  );
}

render(<App />, document.getElementById("root"));
