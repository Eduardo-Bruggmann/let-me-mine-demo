# Let Me Mine

Browser-based mining simulation using WebAssembly and Web Workers. The interface lets you control threads, CPU usage and algorithm difficulty while visualizing hashrate, shares and estimated XMR earnings in real time.

## Features

- **WASM hashing** — cryptographic work runs in a compiled WebAssembly module for near-native speed
- **Web Workers** — mining is parallelized across multiple threads without blocking the UI
- **Dynamic controls** — adjust threads (based on `navigator.hardwareConcurrency`), CPU target and difficulty on the fly
- **CPU throttling** — the CPU usage slider regulates worker sleep intervals to relieve system load
- **Live chart** — SVG-based hashrate history updated every second
- **XMR earnings simulation** — estimates earnings based on current hashrate, network difficulty and pool efficiency

## Tech Stack

- **Frontend** — HTML, Tailwind CSS v4, vanilla JS
- **Backend** — Express 5 (static file server)
- **Mining engine** — Rust → WebAssembly (`wasm_miner`), Web Workers

## Getting Started

```bash
# Install dependencies
pnpm install

# Build CSS
pnpm run build

# Start the server
pnpm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Development

```bash
pnpm dev
```

Starts the Tailwind watcher and nodemon server in parallel.

## Project Structure

```
index.js              Express server
src/
  index.html          Main page
  input.css           Tailwind source stylesheet
  miner.js            Mining controller (UI, workers, metrics)
  worker.js           Web Worker (WASM hashing loop)
  wasm_miner/pkg/     Compiled WebAssembly module
public/
  styles.css          Generated CSS (build output)
```

## License

ISC
