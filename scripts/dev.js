import { spawn } from 'node:child_process'

const command = 'pnpm'
const isWindows = process.platform === 'win32'
const children = []
let isShuttingDown = false

function run(name, args) {
  const child = isWindows
    ? spawn(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', `${command} ${args.join(' ')}`],
        {
          cwd: process.cwd(),
          stdio: 'inherit',
          env: process.env,
        },
      )
    : spawn(command, args, {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env,
      })

  child.on('exit', (code, signal) => {
    if (isShuttingDown) {
      return
    }

    if (signal) {
      shutdown(1)
      return
    }

    if (code !== 0) {
      console.error(`${name} exited with code ${code}`)
      shutdown(code ?? 1)
    }
  })

  children.push(child)
  return child
}

function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true

  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }

  process.exit(exitCode)
}

run('tailwind watcher', ['run', 'tw:dev'])
run('server', ['run', 'server'])

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0))
}
