export async function logHandler(_logId?: number | string): Promise<void> {}

export async function errorHandler(_number?: number | string): Promise<void> {}

export async function exportHandler(
  _source: string,
  _outputFile?: string,
): Promise<void> {}

export async function taskCreateHandler(
  _subject: string,
  _opts?: unknown,
): Promise<void> {}

export async function taskListHandler(_opts?: unknown): Promise<void> {}

export async function taskGetHandler(
  _id: string,
  _opts?: unknown,
): Promise<void> {}

export async function taskUpdateHandler(
  _id: string,
  _opts?: unknown,
): Promise<void> {}

export async function taskDirHandler(_opts?: unknown): Promise<void> {}

export async function completionHandler(
  _shell: string,
  _opts: unknown,
  _program: unknown,
): Promise<void> {}
