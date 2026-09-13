import { useEffect, useRef, type KeyboardEvent, type ReactElement, type RefObject } from 'react'

export interface PickerOption {
  readonly key: string
  readonly testId: string
  readonly label: string
  readonly note?: string
}

/** Lets whatever opened the list move focus into it without owning its option nodes */
export interface PickerHandle {
  focus(): void
}

export interface PickerProps {
  readonly id: string
  readonly testId: string
  readonly label: string
  readonly options: readonly PickerOption[]
  readonly activeIndex: number
  readonly handleRef?: RefObject<PickerHandle | null>
  onActivate(index: number): void
  onChoose(index: number): void
  onDismiss(): void
}

const OPTION_STEP: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 }

/**
 * One listbox for every list the product lets a grower choose from. A listbox owns its
 * options directly: a ul/li wrapper breaks the required parent-child relationship as well
 * as tripping the interactive-role rule
 */
export const Picker = ({
  id,
  testId,
  label,
  options,
  activeIndex,
  handleRef,
  onActivate,
  onChoose,
  onDismiss,
}: PickerProps): ReactElement => {
  const nodes = useRef(new Map<number, HTMLButtonElement>())

  const focusOption = (index: number): void => {
    const count = options.length
    if (count === 0) return
    const next = ((index % count) + count) % count
    onActivate(next)
    nodes.current.get(next)?.focus()
  }

  useEffect(() => {
    if (!handleRef) return
    handleRef.current = { focus: () => nodes.current.get(activeIndex)?.focus() }
    return () => {
      handleRef.current = null
    }
  }, [handleRef, activeIndex])

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onDismiss()
      return
    }
    const step = OPTION_STEP[event.key]
    const target =
      step !== undefined
        ? index + step
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : null
    if (target === null) return
    event.preventDefault()
    focusOption(target)
  }

  return (
    <div className="list picker" id={id} role="listbox" aria-label={label} data-testid={testId}>
      {options.map((option, index) => (
        <button
          key={option.key}
          type="button"
          role="option"
          className={`picker-option${index === activeIndex ? ' picker-option-active' : ''}`}
          data-testid={option.testId}
          aria-selected={index === activeIndex}
          tabIndex={index === activeIndex ? 0 : -1}
          ref={(node) => {
            if (node) nodes.current.set(index, node)
            else nodes.current.delete(index)
          }}
          onClick={() => onChoose(index)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <span className="picker-label">{option.label}</span>
          {option.note === undefined ? null : <span className="picker-note">{option.note}</span>}
        </button>
      ))}
    </div>
  )
}
