import type { ReactElement, ReactNode, RefObject } from 'react'

export interface NumberFieldProps {
  readonly testId: string
  readonly label: string
  readonly value: number
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly unit?: string
  onChange(value: number): void
}

export const NumberField = ({
  testId,
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: NumberFieldProps): ReactElement => (
  <label className="field">
    <span className="field-label">
      {label}
      {unit ? <em> ({unit})</em> : null}
    </span>
    <input
      type="number"
      data-testid={testId}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
)

export interface SliderFieldProps extends NumberFieldProps {
  readonly display?: string
}

export const SliderField = ({
  testId,
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  display,
  onChange,
}: SliderFieldProps): ReactElement => (
  <label className="field">
    <span className="field-label">
      {label}
      {display ? <em> {display}</em> : null}
    </span>
    <input
      type="range"
      data-testid={testId}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
)

export interface SelectFieldProps<T extends string> {
  readonly testId: string
  readonly label: string
  readonly value: T
  readonly options: readonly (readonly [T, string])[]
  /** Greyed and unchangeable, for a select whose answer something else is overriding for now */
  readonly disabled?: boolean
  onChange(value: T): void
}

export const SelectField = <T extends string>({
  testId,
  label,
  value,
  options,
  disabled,
  onChange,
}: SelectFieldProps<T>): ReactElement => (
  <label className="field">
    <span className="field-label">{label}</span>
    <select
      data-testid={testId}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map(([key, text]) => (
        <option key={key} value={key}>
          {text}
        </option>
      ))}
    </select>
  </label>
)

export interface TextFieldProps {
  readonly testId: string
  readonly label: string
  readonly value: string
  readonly placeholder?: string
  /** Lets a caller move focus back into the field after dismissing whatever it opened */
  readonly inputRef?: RefObject<HTMLInputElement | null>
  readonly controls?: string
  onChange(value: string): void
  onSubmit?(): void
  onOpenList?(): void
}

export const TextField = ({
  testId,
  label,
  value,
  placeholder,
  inputRef,
  controls,
  onChange,
  onSubmit,
  onOpenList,
}: TextFieldProps): ReactElement => (
  <label className="field">
    <span className="field-label">{label}</span>
    <input
      type="text"
      data-testid={testId}
      ref={inputRef}
      value={value}
      placeholder={placeholder}
      aria-controls={controls}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSubmit?.()
        else if (event.key === 'ArrowDown' && onOpenList) {
          event.preventDefault()
          onOpenList()
        }
      }}
    />
  </label>
)

export interface ToggleProps {
  readonly testId: string
  readonly label: string
  readonly checked: boolean
  onChange(checked: boolean): void
}

export const Toggle = ({ testId, label, checked, onChange }: ToggleProps): ReactElement => (
  <label className="field field-toggle">
    <input
      type="checkbox"
      data-testid={testId}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span className="field-label">{label}</span>
  </label>
)

export interface ChoiceOption<T extends string> {
  readonly value: T
  readonly label: string
  readonly help?: string
}

export interface ChoiceGroupProps<T extends string> {
  readonly testId: string
  readonly name: string
  readonly legend: string
  readonly options: readonly ChoiceOption<T>[]
  readonly value: T
  /** Greyed and unchangeable, for a choice something else is answering for now */
  readonly disabled?: boolean
  onChange(value: T): void
}

/**
 * A radio group drawn as cards. Native radios rather than buttons with roles, so the arrow
 * keys, the group semantics and the focus ring are the browser's and not a reimplementation
 */
export const ChoiceGroup = <T extends string>({
  testId,
  name,
  legend,
  options,
  value,
  disabled,
  onChange,
}: ChoiceGroupProps<T>): ReactElement => (
  <fieldset className="choices" data-testid={testId} disabled={disabled}>
    <legend className="field-label">{legend}</legend>
    {options.map((option) => (
      <label
        key={option.value}
        className={`choice${option.value === value ? ' choice-active' : ''}`}
        data-choice={option.value}
      >
        <input
          type="radio"
          name={name}
          value={option.value}
          data-testid={`${testId}-${option.value}`}
          checked={option.value === value}
          onChange={() => onChange(option.value)}
        />
        <span className="choice-label">{option.label}</span>
        {option.help ? <span className="choice-help">{option.help}</span> : null}
      </label>
    ))}
  </fieldset>
)

export interface ActionProps {
  readonly testId: string
  readonly children: ReactNode
  readonly disabled?: boolean
  readonly tone?: 'primary' | 'ghost'
  /** Set on a button that toggles something, so assistive tech is told the state and not just
   *  the label. Omit it for a button that simply does a thing */
  readonly pressed?: boolean
  /**
   * The id of the sentence that says what pressing this costs, for a button whose label cannot
   * carry it. Read out with the label rather than instead of it, so nothing has to be hunted for
   */
  readonly describedBy?: string
  /**
   * The width of its column and thumb-height, for the one press a step turns on: the foot's Next
   * and the layout search. Everything else keeps the size of its own label
   */
  readonly block?: boolean
  /**
   * The accessible name, when the visible words are not enough on their own: "Try another mix"
   * on twelve bed cards is twelve identical names to a screen reader, and the bed's label is the
   * half that tells them apart. The visible label stays what a sighted reader sees
   */
  readonly label?: string
  onClick(): void
}

export const Action = ({
  testId,
  children,
  disabled,
  tone = 'ghost',
  pressed,
  describedBy,
  label,
  block,
  onClick,
}: ActionProps): ReactElement => (
  <button
    type="button"
    className={`action action-${tone}${block === true ? ' action-block' : ''}`}
    data-testid={testId}
    disabled={disabled}
    aria-pressed={pressed}
    aria-describedby={describedBy}
    aria-label={label}
    onClick={onClick}
  >
    {children}
  </button>
)
