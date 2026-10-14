import { VaultError } from './errors.js';

/**
 * RFC 4180 rows: comma separated, `"` quotes a cell (`""` inside is one quote), CRLF or LF.
 * Blank lines are skipped. A quote left open fails, naming the line it opened on.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let openedOn = 0;
  const endRow = () => {
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    cell = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '\n') line++;
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && cell === '') {
      quoted = true;
      openedOn = line;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') endRow();
    else if (ch !== '\r') cell += ch;
  }
  if (quoted) throw new VaultError('INVALID_INPUT', `unclosed quote opened on line ${openedOn}`);
  endRow();
  return rows;
}
