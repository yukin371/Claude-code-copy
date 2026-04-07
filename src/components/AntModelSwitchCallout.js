import React, { useEffect } from 'react'

export function AntModelSwitchCallout({ onDone }) {
  useEffect(() => {
    onDone('dismiss')
  }, [onDone])

  return null
}

export function shouldShowModelSwitchCallout() {
  return false
}
