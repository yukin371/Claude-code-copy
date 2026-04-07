export type NotebookCellType = string
export type NotebookOutputImage = {
  image_data: string
  media_type: string
}

export type NotebookCellSourceOutput = {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error'
  text?: string
  image?: NotebookOutputImage
}

export type NotebookCellSource = {
  cellType: NotebookCellType
  source: string
  execution_count?: number
  cell_id: string
  language?: string
  outputs?: NotebookCellSourceOutput[]
}

export type NotebookCellOutput =
  | {
      output_type: 'stream'
      text?: string | string[]
      name?: string
    }
  | {
      output_type: 'execute_result' | 'display_data'
      data?: Record<string, unknown> & {
        'text/plain'?: string | string[]
        'image/png'?: string
        'image/jpeg'?: string
      }
      metadata?: Record<string, unknown>
      execution_count?: number | null
    }
  | {
      output_type: 'error'
      ename: string
      evalue: string
      traceback: string[]
    }

export type NotebookCell = {
  cell_type: NotebookCellType
  id?: string
  source: string | string[]
  metadata: Record<string, unknown>
  execution_count?: number | null
  outputs?: NotebookCellOutput[]
}

export type NotebookContent = {
  cells: NotebookCell[]
  metadata: {
    language_info?: {
      name?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  nbformat: number
  nbformat_minor: number
  [key: string]: unknown
}
