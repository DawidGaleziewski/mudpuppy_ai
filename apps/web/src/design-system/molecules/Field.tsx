import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

export interface FieldProps {
  label: ReactNode;
  /** One line under the control: the limit or the format. */
  help?: ReactNode;
  /** What is wrong with the value; marks the control invalid and is read with it. */
  error?: ReactNode;
  /** One control: an `Input`, `Select` or `Textarea`. */
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
  /**
   * The person changed what the assistant drafted (designer 19/04, `[data-edited]` in an editable
   * command card): the person's manila edge; say "Changed by you (was …)" in `help`.
   */
  edited?: boolean;
}

/** A labelled form control with its help and error, tied together for assistive technology. */
export function Field({ label, help, error, children, edited = false }: FieldProps) {
  const id = useId();
  const helpId = help !== undefined ? `${id}-help` : undefined;
  const errorId = error !== undefined ? `${id}-error` : undefined;
  const described = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        ...(described !== undefined ? { 'aria-describedby': described } : {}),
        ...(error !== undefined ? { 'aria-invalid': true } : {}),
      })
    : children;
  return (
    <div className="sy-field" data-edited={edited ? '' : undefined}>
      <label className="sy-field__label" htmlFor={children.props.id ?? id}>
        {label}
      </label>
      {control}
      {help !== undefined && (
        <span className="sy-field__help" id={helpId}>
          {help}
        </span>
      )}
      {error !== undefined && (
        <span className="sy-field__error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}

/** A group of checks or radios under one label (the legend looks like a field label). */
export function Fieldset({ legend, children }: { legend: ReactNode; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="sy-legend-label">{legend}</legend>
      <div className="sy-cluster">{children}</div>
    </fieldset>
  );
}
