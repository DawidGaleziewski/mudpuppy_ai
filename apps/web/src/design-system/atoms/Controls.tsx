import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cx } from '../cx.js';

/** A text input; `ref` reaches the element (a page's key moves the focus to it; a form registers it). */
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input {...rest} className={cx('sy-input', className)} />;
}

/**
 * A select. Never one that navigates on change (WCAG 3.2.2): use a menu of links instead.
 * `drawn`: a proposed value the person may change before approving it (a suite's expectation).
 */
export function Select({
  className,
  drawn = false,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { drawn?: boolean; ref?: Ref<HTMLSelectElement> }) {
  return <select {...rest} className={cx('sy-select', drawn && 'sy-select--drawn', className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea {...rest} className={cx('sy-textarea', className)} />;
}

export interface CheckProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  /** One of a group (same `name`): a radio button instead of a checkbox. */
  radio?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/** A checkbox (or, with `radio`, a radio button) with its label. */
export function Check({ label, className, radio = false, ...rest }: CheckProps) {
  return (
    <label className={cx('sy-check', className)}>
      <input {...rest} type={radio ? 'radio' : 'checkbox'} /> {label}
    </label>
  );
}
