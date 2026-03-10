import { preview } from 'vite'

const port = Number.parseInt(process.env.PORT ?? '3000', 10)
const host = process.env.HOST ?? '0.0.0.0'

try {
  const server = await preview({
    preview: {
      host,
      port,
    },
  })

  const resolvedUrls = server.resolvedUrls?.local ?? []
  const url = resolvedUrls[0] ?? `http://${host}:${port}`

  console.log(`Preview server running at ${url}`)
} catch (error) {
  console.error('Failed to start Vite preview server.')
  console.error(error)
  process.exit(1)
}
