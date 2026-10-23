/** "1 scan", "3 scans": a count with its word (English plural with an s). */
export function plural(n: number, word: string) {
  return `${String(n)} ${word}${n === 1 ? '' : 's'}`;
}
