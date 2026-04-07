import React, { useEffect } from 'react'

export function UndercoverAutoCallout({ onDone }) {
  useEffect(() => {
    onDone()
  }, [onDone])

  return null
}
