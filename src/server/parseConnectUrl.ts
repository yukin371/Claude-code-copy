type ParsedConnectUrl = {
  serverUrl: string
  authToken: string | undefined
}

export function parseConnectUrl(connectUrl: string): ParsedConnectUrl {
  const url = new URL(connectUrl)
  const authToken =
    url.searchParams.get('token') ??
    url.searchParams.get('authToken') ??
    undefined

  url.searchParams.delete('token')
  url.searchParams.delete('authToken')

  if (url.protocol === 'cc:') {
    return {
      serverUrl: `https://${url.host}${url.pathname}${url.search}`,
      authToken,
    }
  }

  if (url.protocol === 'cc+unix:') {
    return {
      serverUrl: `http+unix://${url.host}${url.pathname}${url.search}`,
      authToken,
    }
  }

  throw new Error(`Unsupported connect URL protocol: ${url.protocol}`)
}
