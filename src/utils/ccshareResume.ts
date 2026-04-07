import type { LogOption } from '../types/logs.js'

export function parseCcshareId(_value: string): string | null {
  return null
}

export async function loadCcshare(_id: string): Promise<LogOption> {
  throw new Error('ccshare resume is unavailable in this snapshot')
}
