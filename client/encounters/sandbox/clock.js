// Whether the sandbox's run may tick: it waits for "Start encounter" after
// every new run and restart, and the player may pause it. The application's
// tick loop asks the encounter (`isPaused`, assets/Grid.js); the engine
// itself never does, so a replay rebuild or the determinism harness ticks
// as always. While the run is held no tick happens at all, so nothing here
// reaches a replay or the determinism digests.
//
// Every change is announced as the window event "sandbox-clock": the start
// of fight countdown (Grid.js) waits while the run is held and counts down
// once Start is pressed.
export const sandboxClock = { state: "waiting" };

function setState(state) {
  if (sandboxClock.state === state) return;
  sandboxClock.state = state;
  globalThis.dispatchEvent?.(new Event("sandbox-clock"));
}
export const isSandboxHeld = () => sandboxClock.state !== "running";
export function holdSandboxForStart() {
  setState("waiting");
}
export function startSandbox() {
  setState("running");
}
export function toggleSandboxPause() {
  setState(sandboxClock.state === "running" ? "paused" : "running");
}
