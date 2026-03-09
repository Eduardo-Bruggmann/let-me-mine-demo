import initWasm, { hash as wasmHash } from './wasm_miner/pkg/wasm_miner.js'

const meetsDifficulty = (hash, difficulty) =>
  hash.startsWith('0'.repeat(difficulty))

const wasmInitPromise = initWasm()
const workerState = {
  active: false,
  jobId: 0,
  payload: '',
  difficulty: 1,
  workerId: 0,
  totalWorkers: 1,
  nonce: 0,
  throttle: {
    sleepMs: 0,
    batchSize: 160,
    reportEvery: 160,
  },
}

onmessage = async e => {
  const data = e.data

  if (data.type === 'start') {
    await wasmInitPromise

    workerState.jobId += 1
    workerState.active = true
    workerState.payload = data.payload
    workerState.difficulty = data.difficulty
    workerState.workerId = data.workerId
    workerState.totalWorkers = data.totalWorkers
    workerState.nonce = data.workerId
    workerState.throttle = normalizeThrottle(data.throttle)

    postMessage({
      type: 'ready',
      workerId: workerState.workerId,
    })

    mine(workerState.jobId)
  }

  if (data.type === 'update-config') {
    if (typeof data.difficulty === 'number')
      workerState.difficulty = data.difficulty
    if (data.throttle) workerState.throttle = normalizeThrottle(data.throttle)
  }

  if (data.type === 'stop') {
    workerState.active = false
    workerState.jobId += 1
  }
}

async function mine(jobId) {
  let hashesSinceReport = 0
  let hashesSincePause = 0

  while (workerState.active && jobId === workerState.jobId) {
    const hash = wasmHash(workerState.payload, workerState.nonce)

    hashesSinceReport += 1
    hashesSincePause += 1

    if (meetsDifficulty(hash, workerState.difficulty))
      postMessage({
        type: 'share',
        nonce: workerState.nonce,
        hash,
      })

    workerState.nonce += workerState.totalWorkers

    if (hashesSinceReport >= workerState.throttle.reportEvery) {
      postMessage({
        type: 'stats',
        hashes: hashesSinceReport,
      })

      hashesSinceReport = 0
    }

    if (
      workerState.throttle.sleepMs > 0 &&
      hashesSincePause >= workerState.throttle.batchSize
    ) {
      hashesSincePause = 0
      await new Promise(resolve =>
        setTimeout(resolve, workerState.throttle.sleepMs),
      )
    }
  }

  if (hashesSinceReport > 0)
    postMessage({
      type: 'stats',
      hashes: hashesSinceReport,
    })
}

function normalizeThrottle(throttle = {}) {
  return {
    sleepMs: Math.max(0, Number.parseInt(throttle.sleepMs, 10) || 0),
    batchSize: Math.max(40, Number.parseInt(throttle.batchSize, 10) || 160),
    reportEvery: Math.max(40, Number.parseInt(throttle.reportEvery, 10) || 160),
  }
}
