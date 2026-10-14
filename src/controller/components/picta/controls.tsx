/**
 * The few control patterns Picta repeats everywhere. Each one fixes a decision
 * (which colour means "primary", how an icon button is labelled, how an inline
 * edit commits) so feature code does not make it again.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Button,
  ColorPicker,
  Input,
  NumberField,
  SurfaceCut,
  ToggleButton,
  ToggleGroup,
} from '@cladd-ui/react';
import { cn, defined } from '@/lib/utils';
import { restoreFocusIfKeyboard } from '@/lib/focus';
import { Hint } from './hint';

/** The class a bare inline `<input>` uses, so one-off inline edits match CommitInput. */
export const INLINE_INPUT =
  'h-cladd-md w-full min-w-0 rounded-cladd-md border-0 bg-transparent px-1.5 text-cladd-xs font-medium outline-none placeholder:text-cladd-fg-softer hover:bg-cladd-surface-hover focus:bg-cladd-surface-cut focus:shadow-cladd-cut-outline focus-ring disabled:opacity-50';

/* Buttons -------------------------------------------------------------------- */

export type Intent = 'default' | 'primary' | 'quiet' | 'cue' | 'danger' | 'danger-fill' | 'live';

const INTENT_PROPS: Record<Intent, Partial<ComponentProps<typeof Button>>> = {
  /** A raised neutral control. */
  default: {},
  /** The single recommended action in a region. */
  primary: { color: 'brand', variant: 'gradient-fill' },
  /** Tertiary: visible only as text until hovered. */
  quiet: { variant: 'transparent', outline: false },
  /** Starts a temporary takeover of the program. */
  cue: { color: 'cue' },
  /** Destructive, but routine enough not to shout. */
  danger: { color: 'danger' },
  /** The confirming button of a destructive dialog. */
  'danger-fill': { color: 'danger', variant: 'gradient-fill' },
  /** Takes or keeps the audience display ON AIR. Used only to confirm such actions. */
  live: { color: 'live', variant: 'gradient-fill' },
};

export function ActionButton({
  intent = 'default',
  ...props
}: ComponentProps<typeof Button> & { intent?: Intent }) {
  return <Button {...INTENT_PROPS[intent]} {...props} />;
}

/**
 * An icon-only button. The label is both the accessible name and the tooltip,
 * so an icon never has to be guessed at.
 */
export function IconButton({
  label,
  keys,
  intent = 'quiet',
  size = 'md',
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'aria-label' | 'square'> & {
  label: string;
  keys?: string[];
  intent?: Intent;
}) {
  return (
    <Hint label={label} {...(keys ? { keys } : {})}>
      <ActionButton square intent={intent} size={size} aria-label={label} {...props}>
        {children}
      </ActionButton>
    </Hint>
  );
}

/** Wraps a possibly-disabled control so its tooltip still shows. */
export function HintWhenDisabled({
  label,
  keys,
  children,
}: {
  label: ReactNode;
  keys?: string[];
  children: ReactElement;
}) {
  return (
    <Hint label={label} {...(keys ? { keys } : {})}>
      <span className="inline-flex">{children}</span>
    </Hint>
  );
}

/* Fields --------------------------------------------------------------------- */

/** A labelled form control with an optional error. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  error?: string | null | undefined;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-cladd-xs font-medium text-cladd-fg-soft">
          {label}
        </label>
      ) : (
        <span className="text-cladd-xs font-medium text-cladd-fg-soft">{label}</span>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-cladd-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-cladd-xs text-cladd-fg-softer">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * A text or number input that edits a draft and commits once, on blur or
 * Enter (Escape abandons the draft). Every inline edit in the app works this
 * way, so one change is one Undo step and nothing is saved half-typed.
 *
 *   field   a Cladd Input well, for forms and property rows
 *   inline  flat until hovered, for names and table cells
 */
export function CommitInput({
  value,
  onCommit,
  label,
  variant = 'field',
  type = 'text',
  placeholder,
  disabled,
  invalid,
  className,
  inputClassName,
  maxLength,
  min,
  max,
  list,
  inputId,
  autoSelect,
  autoWidth,
}: {
  value: string;
  onCommit(value: string): void;
  label: string;
  variant?: 'field' | 'inline';
  type?: 'text' | 'number';
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  inputClassName?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  list?: string;
  inputId?: string;
  autoSelect?: boolean;
  /** Inline only: size the input to its text, like a title. */
  autoWidth?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoSelect) ref.current?.select();
  }, [autoSelect]);
  const finish = (commit: boolean) => {
    if (commit && draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      setDraft(null);
      // Blur after the draft clears so the blur handler has nothing to commit.
      const input = event.currentTarget;
      requestAnimationFrame(() => input.blur());
    }
  };
  const shown = draft ?? value;
  if (variant === 'inline')
    return (
      <input
        ref={ref}
        id={inputId}
        aria-label={label}
        aria-invalid={invalid || undefined}
        type={type}
        list={list}
        value={shown}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        min={min}
        max={max}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => finish(true)}
        onKeyDown={onKeyDown}
        {...(autoWidth ? { style: { width: `${Math.max(8, shown.length + 2)}ch` } } : {})}
        className={cn(
          INLINE_INPUT,
          invalid && 'shadow-[inset_0_0_0_1px_var(--danger)]',
          className,
          inputClassName,
        )}
      />
    );
  return (
    <Input
      inputRef={ref}
      type={type}
      value={shown}
      valid={!invalid}
      {...defined({
        inputId,
        placeholder,
        disabled,
        maxLength,
        min,
        max,
        className,
        inputClassName,
      })}
      inputComponentProps={{
        'aria-label': label,
        'aria-invalid': invalid || undefined,
        ...(list ? { list } : {}),
      }}
      onChange={(next) => setDraft(next)}
      onBlur={() => finish(true)}
      onKeyDown={onKeyDown}
    />
  );
}

/* Choice ---------------------------------------------------------------------- */

export interface ChoiceOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Tooltip explaining the option. */
  hint?: ReactNode;
  /** Accessible name when the label is not text. */
  ariaLabel?: string;
}

/**
 * Pick one of a few options, all visible at once: a recessed track holding
 * Cladd toggle buttons. Unlike a bare ToggleGroup, the selected option cannot
 * be deselected, because a setting always has a value.
 */
export function Choice<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
  stretch,
  vertical,
  className,
}: {
  value: T;
  onChange(value: T): void;
  options: ChoiceOption<T>[];
  label: string;
  disabled?: boolean;
  /** Fill the available width, options sharing it equally. */
  stretch?: boolean;
  /** Stack the options as rows, for labels too wide to share a line. */
  vertical?: boolean;
  className?: string;
}) {
  return (
    <SurfaceCut
      className={cn(
        'rounded-cladd-md',
        stretch || vertical ? 'flex w-full' : 'inline-flex',
        className,
      )}
      contentClassName="flex w-full p-0.5"
    >
      <ToggleGroup
        role="group"
        aria-label={label}
        disabled={disabled ?? false}
        value={value}
        onValueChange={(next) => {
          if (typeof next === 'string') onChange(next as T);
        }}
        className={cn('gap-0.5', stretch && 'w-full', vertical && 'w-full flex-col items-stretch')}
      >
        {options.map((option) => {
          const button = (
            <ToggleButton
              key={option.value}
              type="button"
              value={option.value}
              // Segmented only dims a disabled group; the buttons must really be disabled.
              disabled={disabled ?? false}
              size="sm"
              {...(option.ariaLabel ? { 'aria-label': option.ariaLabel } : {})}
              className={cn(stretch && 'min-w-0 flex-1', vertical && 'justify-start')}
              contentClassName={cn('px-2', vertical && 'justify-start')}
            >
              {option.label}
            </ToggleButton>
          );
          return option.hint ? (
            <Hint key={option.value} label={option.hint}>
              {button}
            </Hint>
          ) : (
            button
          );
        })}
      </ToggleGroup>
    </SurfaceCut>
  );
}

/* Colour --------------------------------------------------------------------- */

/**
 * A colour well that opens Cladd's colour editor. Team colours are opaque, so
 * there is no alpha. `onClose` fires when the editor closes, which is where a
 * change that should be one Undo step is committed.
 */
export function ColorField({
  label,
  value,
  onChange,
  onClose,
  className,
}: {
  label: string;
  value: string;
  onChange(hex: string): void;
  onClose?(): void;
  className?: string;
}) {
  const trigger = useRef<HTMLElement | null>(null);
  return (
    <ColorPicker
      ref={trigger}
      type="button"
      surface="cut"
      alpha={false}
      dropdownIcon={false}
      aria-label={label}
      value={value}
      onChange={(color) => onChange(color.hex)}
      onPopoverState={(open) => {
        if (open) return;
        onClose?.();
        restoreFocusIfKeyboard(trigger.current);
      }}
      {...(className ? { className } : {})}
    />
  );
}

/* Forms ---------------------------------------------------------------------- */

/**
 * A submit handler for forms that contain Cladd controls. Cladd renders its
 * Buttons without a `type`, which the browser treats as "submit", so opening a
 * Select, a colour editor or a segmented option inside a form would submit it.
 * Only Enter in a field, or a button that is explicitly `type="submit"`, counts.
 */
export function explicitSubmit(handler: () => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter && !submitter.hasAttribute('type')) return;
    handler();
  };
}

/* Numbers -------------------------------------------------------------------- */

/**
 * A Cladd NumberField that is also nameable. NumberField forwards extra props
 * to its outer surface, leaving the number input and the two step buttons
 * without names, so the names are applied to those parts directly.
 */
export function StepperField({
  label,
  className,
  ...props
}: ComponentProps<typeof NumberField> & { label: string }) {
  const root = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    element.querySelector('input[type="number"]')?.setAttribute('aria-label', label);
    element
      .querySelector('[data-part="decrease"]')
      ?.setAttribute('aria-label', `Decrease ${label}`);
    element
      .querySelector('[data-part="increase"]')
      ?.setAttribute('aria-label', `Increase ${label}`);
  });
  return (
    <NumberField
      ref={root}
      role="group"
      aria-label={label}
      {...(className ? { className } : {})}
      {...props}
    />
  );
}
