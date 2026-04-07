export type StartedServer = {
  port?: number
  stop: (force?: boolean) => void
}

export function startServer(
  _config: unknown,
  _sessionManager: unknown,
  _logger: unknown,
): StartedServer {
  return {
    port: undefined,
    stop: () => {},
  }
}
