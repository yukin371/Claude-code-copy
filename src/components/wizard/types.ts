import type { ComponentType, Dispatch, ReactNode, SetStateAction } from 'react'

export type WizardStepComponent<T = unknown> = ComponentType<T> | (() => ReactNode)

export type WizardContextValue<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  currentStepIndex: number
  totalSteps: number
  wizardData: T
  setWizardData: Dispatch<SetStateAction<T>>
  updateWizardData: (updates: Partial<T>) => void
  goNext: () => void
  goBack: () => void
  goToStep: (stepIndex: number) => void
  cancel: () => void
  title?: string
  showStepCounter: boolean
}

export type WizardProviderProps<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  steps: WizardStepComponent[]
  initialData?: T
  onComplete: (data: T) => void
  onCancel: () => void
  children?: ReactNode
  title?: string
  showStepCounter?: boolean
}
