export interface PauserState {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

// Pauser is a utility for testing to create and resolve a Promise easily.
export class Pauser {
  private state: PauserState | null = null;

  pause(): Promise<void> {
    if (this.state == null) {
      let resolve: () => void = () => {};
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      this.state = { promise, resolve };
    }
    return this.state.promise;
  }

  isPaused(): boolean {
    return this.state != null;
  }

  resume(): void {
    if (this.state == null) {
      throw new Error("[Pauser] call .pause() first");
    }
    this.state.resolve();
    this.state = null;
  }
}
