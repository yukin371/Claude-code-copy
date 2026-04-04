declare module 'react/compiler-runtime' {
  export const c: (...args: unknown[]) => unknown
}

type InkIntrinsicProps = {
  children?: import('react').ReactNode
  [key: string]: unknown
}

interface InkIntrinsicElements {
  'ink-box': InkIntrinsicProps
  'ink-link': InkIntrinsicProps
  'ink-raw-ansi': InkIntrinsicProps
  'ink-text': InkIntrinsicProps
  'ink-virtual-text': InkIntrinsicProps
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends InkIntrinsicElements {}
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements extends InkIntrinsicElements {}
  }
}

declare global {
  const MACRO: {
    VERSION: string
    BUILD_TIME?: string
    FEEDBACK_CHANNEL?: string
    ISSUES_EXPLAINER?: string
    NATIVE_PACKAGE_URL?: string
    PACKAGE_URL?: string
    VERSION_CHANGELOG?: string
  }

  function sleep(
    ms: number,
    signal?: AbortSignal,
    opts?: {
      throwOnAbort?: boolean
      abortError?: () => Error
      unref?: boolean
    },
  ): Promise<void>

  namespace JSX {
    interface IntrinsicElements extends InkIntrinsicElements {}
  }
}

export {}
