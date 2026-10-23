/** Join class names, leaving out the empty and false ones: `cx('sy-btn', primary && 'sy-btn--primary')`. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
