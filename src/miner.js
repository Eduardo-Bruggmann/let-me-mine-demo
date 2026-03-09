const DEFAULT_CPU_USAGE = 60
const DEFAULT_DIFFICULTY = 3
const FALLBACK_THREADS = 4
const MAX_DIFFICULTY = 10
const MIN_DIFFICULTY = 1
const HASHRATE_SAMPLES = 24
const NETWORK_HASHRATE = 3.05e9
const BLOCK_REWARD = 0.6
const BLOCKS_PER_DAY = 720
const POOL_EFFICIENCY = 0.985

const hardwareThreads = Math.max(
  1,
  navigator.hardwareConcurrency ?? FALLBACK_THREADS,
)
const defaultThreads = Math.min(4, hardwareThreads)

const dom = {
  threads: document.getElementById('threads'),
  threadsRange: document.getElementById('threads-range'),
  cpu: document.getElementById('cpu'),
  cpuValue: document.getElementById('cpu-value'),
  difficulty: document.getElementById('difficulty'),
  startButton: document.getElementById('start-btn'),
  stopButton: document.getElementById('stop-btn'),
  sharesFound: document.getElementById('shares-found'),
  sharesMeta: document.getElementById('shares-meta'),
  lastShareTime: document.getElementById('lastShareTime'),
  runtimeMeta: document.getElementById('runtime-meta'),
  earnings: document.getElementById('earnings'),
  earningsMeta: document.getElementById('earnings-meta'),
  hashrate: document.getElementById('hashrate'),
  hashrateMeta: document.getElementById('hashrate-meta'),
  agreementOverlay: document.getElementById('agreement-overlay'),
  cancelAgreement: document.getElementById('cancel-agreement'),
  agreeAgreement: document.getElementById('agree-agreement'),
  graphEmpty: document.getElementById('graph-empty'),
  hashrateArea: document.getElementById('hashrate-area'),
  hashrateLine: document.getElementById('hashrate-line'),
}

const state = {
  hasConsent: false,
  running: false,
  workers: [],
  hashesSinceTick: 0,
  totalHashes: 0,
  sharesFound: 0,
  earnings: 0,
  dailyEstimate: 0,
  currentHashrate: 0,
  hashrateHistory: Array.from({ length: HASHRATE_SAMPLES }, () => 0),
  lastShareAt: null,
  startedAt: null,
  tickStartedAt: performance.now(),
  metricsTimer: null,
}

initializeUi()
bindEvents()
render()

function initializeUi() {
  dom.threads.min = '1'
  dom.threads.max = String(hardwareThreads)
  dom.threads.value = String(defaultThreads)
  dom.threadsRange.textContent = `1 - ${hardwareThreads} available`

  dom.cpu.min = '10'
  dom.cpu.max = '100'
  dom.cpu.step = '1'
  dom.cpu.value = String(DEFAULT_CPU_USAGE)

  dom.difficulty.min = String(MIN_DIFFICULTY)
  dom.difficulty.max = String(MAX_DIFFICULTY)
  dom.difficulty.value = String(DEFAULT_DIFFICULTY)

  updateCpuLabel()
  updateControlState()
}

function bindEvents() {
  dom.startButton.addEventListener('click', handleStartClick)
  dom.stopButton.addEventListener('click', () => stopMining())
  dom.cancelAgreement.addEventListener('click', hideAgreement)
  dom.agreeAgreement.addEventListener('click', () => {
    state.hasConsent = true
    hideAgreement()
    startMining()
  })

  dom.cpu.addEventListener('input', () => {
    updateCpuLabel()

    if (state.running) updateWorkerConfig()
  })

  dom.threads.addEventListener('change', () => {
    sanitizeInputs()

    if (state.running) restartMining()
    else render()
  })

  dom.difficulty.addEventListener('change', () => {
    sanitizeInputs()

    if (state.running) restartMining()
    else render()
  })
}

function handleStartClick() {
  if (state.running) return

  sanitizeInputs()

  if (!state.hasConsent) {
    showAgreement()
    return
  }

  startMining()
}

function startMining() {
  const settings = getSettings()
  const sessionPayload = buildPayload()

  stopMining({ preserveSession: false })
  resetSession()

  state.running = true
  state.startedAt = performance.now()
  state.tickStartedAt = performance.now()

  for (let workerId = 0; workerId < settings.threads; workerId += 1) {
    const worker = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = event => handleWorkerMessage(event.data)
    worker.onerror = () => {
      stopMining()
      dom.hashrateMeta.textContent =
        'Worker initialization failed in this browser.'
      render()
    }

    worker.postMessage({
      type: 'start',
      payload: sessionPayload,
      difficulty: settings.difficulty,
      workerId,
      totalWorkers: settings.threads,
      throttle: deriveThrottle(settings.cpuUsage),
    })

    state.workers.push(worker)
  }

  state.metricsTimer = window.setInterval(sampleMetrics, 1000)
  updateControlState()
  render()
}

function stopMining({ preserveSession = true } = {}) {
  if (state.metricsTimer !== null) {
    window.clearInterval(state.metricsTimer)
    state.metricsTimer = null
  }

  for (const worker of state.workers) worker.terminate()

  state.workers = []
  state.running = false
  state.hashesSinceTick = 0
  state.currentHashrate = 0
  state.dailyEstimate = 0

  if (!preserveSession) {
    state.totalHashes = 0
    state.sharesFound = 0
    state.earnings = 0
    state.lastShareAt = null
    state.startedAt = null
    state.hashrateHistory = Array.from({ length: HASHRATE_SAMPLES }, () => 0)
  } else {
    pushHashrateSample(0)
  }

  updateControlState()
  render()
}

function restartMining() {
  if (!state.running) return

  startMining()
}

function resetSession() {
  state.hashesSinceTick = 0
  state.totalHashes = 0
  state.sharesFound = 0
  state.earnings = 0
  state.dailyEstimate = 0
  state.currentHashrate = 0
  state.lastShareAt = null
  state.hashrateHistory = Array.from({ length: HASHRATE_SAMPLES }, () => 0)
}

function handleWorkerMessage(data) {
  if (data.type === 'stats') {
    state.hashesSinceTick += data.hashes
    state.totalHashes += data.hashes
  }

  if (data.type === 'share') {
    state.sharesFound += 1
    state.lastShareAt = Date.now()
    state.earnings += estimateShareBonus(getSettings().difficulty)
    render()
  }
}

function updateWorkerConfig() {
  const settings = getSettings()
  const message = {
    type: 'update-config',
    difficulty: settings.difficulty,
    throttle: deriveThrottle(settings.cpuUsage),
  }

  for (const worker of state.workers) worker.postMessage(message)

  render()
}

function sampleMetrics() {
  const now = performance.now()
  const elapsedSeconds = Math.max((now - state.tickStartedAt) / 1000, 1)

  state.currentHashrate = state.hashesSinceTick / elapsedSeconds
  state.hashesSinceTick = 0
  state.tickStartedAt = now

  const settings = getSettings()
  const xmrPerSecond = estimateXmrPerSecond(
    state.currentHashrate,
    settings.difficulty,
  )

  state.earnings += xmrPerSecond * elapsedSeconds
  state.dailyEstimate = xmrPerSecond * 86400

  pushHashrateSample(state.currentHashrate)
  render()
}

function pushHashrateSample(value) {
  state.hashrateHistory.push(value)

  if (state.hashrateHistory.length > HASHRATE_SAMPLES)
    state.hashrateHistory.shift()
}

function render() {
  const settings = getSettings()
  const runtimeSeconds = state.startedAt
    ? Math.max(0, Math.floor((performance.now() - state.startedAt) / 1000))
    : 0
  const threadUsage = `${settings.threads}/${hardwareThreads} thread${hardwareThreads > 1 ? 's' : ''}`
  const throttlePercent = 100 - settings.cpuUsage

  dom.sharesFound.textContent = String(state.sharesFound)
  dom.sharesMeta.textContent = `${state.sharesFound} accepted shares in this session`
  dom.lastShareTime.textContent = state.lastShareAt
    ? formatClock(state.lastShareAt)
    : '--:--:--'
  dom.runtimeMeta.textContent = state.running
    ? `Running for ${formatDuration(runtimeSeconds)}`
    : runtimeSeconds > 0
      ? `Last session ran for ${formatDuration(runtimeSeconds)}`
      : 'Session idle'
  dom.earnings.textContent = `${formatXmr(state.earnings)} XMR`
  dom.earningsMeta.textContent = `Projected 24h: ${formatXmr(state.dailyEstimate)} XMR`
  dom.hashrate.textContent = formatHashrate(state.currentHashrate)
  dom.hashrateMeta.textContent = state.running
    ? `${threadUsage} active • ${settings.cpuUsage}% target CPU • ${throttlePercent}% throttle relief`
    : `Ready to mine with up to ${hardwareThreads} thread${hardwareThreads > 1 ? 's' : ''}`

  renderChart()
}

function renderChart() {
  const maxSample = Math.max(...state.hashrateHistory, 1)
  const points = state.hashrateHistory.map((sample, index) => {
    const x = (index / (HASHRATE_SAMPLES - 1)) * 100
    const y = 85 - (sample / maxSample) * 50
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  dom.hashrateLine.setAttribute('points', points.join(' '))
  dom.hashrateArea.setAttribute('points', `0,100 ${points.join(' ')} 100,100`)
  dom.graphEmpty.classList.toggle(
    'hidden',
    state.hashrateHistory.some(sample => sample > 0),
  )
}

function sanitizeInputs() {
  dom.threads.value = String(
    clamp(
      Number.parseInt(dom.threads.value, 10) || defaultThreads,
      1,
      hardwareThreads,
    ),
  )
  dom.cpu.value = String(
    clamp(Number.parseInt(dom.cpu.value, 10) || DEFAULT_CPU_USAGE, 10, 100),
  )
  dom.difficulty.value = String(
    clamp(
      Number.parseInt(dom.difficulty.value, 10) || DEFAULT_DIFFICULTY,
      MIN_DIFFICULTY,
      MAX_DIFFICULTY,
    ),
  )

  updateCpuLabel()
}

function updateCpuLabel() {
  dom.cpuValue.textContent = `${dom.cpu.value}%`
  const pct =
    ((dom.cpu.value - dom.cpu.min) / (dom.cpu.max - dom.cpu.min)) * 100
  dom.cpu.style.background = `linear-gradient(to right, #00c995 ${pct}%, rgba(255,255,255,0.18) ${pct}%)`
}

function getSettings() {
  sanitizeInputs()

  return {
    threads: Number.parseInt(dom.threads.value, 10),
    cpuUsage: Number.parseInt(dom.cpu.value, 10),
    difficulty: Number.parseInt(dom.difficulty.value, 10),
  }
}

function deriveThrottle(cpuUsage) {
  const throttleFactor = (100 - cpuUsage) / 100

  return {
    sleepMs: Math.round(throttleFactor * 24),
    batchSize: Math.max(80, Math.round(560 - cpuUsage * 4.2)),
    reportEvery: Math.max(120, Math.round(360 - cpuUsage * 2.4)),
  }
}

function estimateXmrPerSecond(hashrate, difficulty) {
  const difficultyModifier = 0.96 + difficulty * 0.018
  const blockRewardsPerSecond = (BLOCK_REWARD * BLOCKS_PER_DAY) / 86400

  return (
    (hashrate / NETWORK_HASHRATE) *
    blockRewardsPerSecond *
    POOL_EFFICIENCY *
    difficultyModifier
  )
}

function estimateShareBonus(difficulty) {
  return 0.0000000025 * (1 + difficulty * 0.15)
}

function buildPayload() {
  return [
    'let-me-mine-demo',
    navigator.userAgent,
    `${window.screen.width}x${window.screen.height}`,
    String(Date.now()),
  ].join('|')
}

function showAgreement() {
  dom.agreementOverlay.classList.remove('hidden')
  dom.agreementOverlay.classList.add('flex')
}

function hideAgreement() {
  dom.agreementOverlay.classList.add('hidden')
  dom.agreementOverlay.classList.remove('flex')
}

function updateControlState() {
  dom.startButton.disabled = state.running
  dom.stopButton.disabled = !state.running
}

function formatClock(timestamp) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp)
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map(value => String(value).padStart(2, '0'))
    .join(':')
}

function formatHashrate(hashrate) {
  if (hashrate >= 1_000_000) return `${(hashrate / 1_000_000).toFixed(2)} MH/s`
  if (hashrate >= 1_000) return `${(hashrate / 1_000).toFixed(2)} kH/s`
  return `${hashrate.toFixed(0)} H/s`
}

function formatXmr(value) {
  return value.toFixed(value >= 0.001 ? 6 : 9)
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
