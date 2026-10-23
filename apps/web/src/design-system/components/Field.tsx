import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from '../cx.js';

export interface FieldProps {
  label: ReactNode;
  /** One line under the control: the limit or the format. */
  help?: ReactNode;
  /** What is wrong with the value; marks the control invalid and is read with it. */
  error?: ReactNode;
  /** One control: an `Input`, `Select` or `Textarea`. */
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
}

/** A labelled form control with its help and error, tied together for assistive technology. */
export function Field({ label, help, error, children }: FieldProps) {
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
    <div className="sy-field">
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

/** A text input. `drawn`: a proposed value (blueprint). */
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx('sy-input', className)} />;
}

/**
 * A select. Never one that navigates on change (WCAG 3.2.2): use a menu of links instead.
 * `drawn`: a proposed value the person may change before approving it (a suite's expectation).
 */
export function Select({ className, drawn = false, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { drawn?: boolean }) {
  return <select {...rest} className={cx('sy-select', drawn && 'sy-select--drawn', className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx('sy-textarea', className)} />;
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

export interface CheckProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

/** A checkbox with its label. */
export function Check({ label, className, ...rest }: CheckProps) {
  return (
    <label className={cx('sy-check', className)}>
      <input {...rest} type="checkbox" /> {label}
    </label>
  );
}
