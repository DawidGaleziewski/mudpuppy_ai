import { describe, expect, it } from 'vitest';
import type { PictureMark } from '../src/process-export/elements.js';
import { elementsSvg, validationNotes, validationSvg } from '../src/process-export/pictures.js';
import type { ValidationRow } from '../src/process-export/validation.js';

// Owner review 2026-10-17 (points b, c): every element tagged on the screenshot, and each field's
// validation message drawn in a band opened under the field.

const PNG = new Uint8Array([137, 80, 78, 71]);
const PAGE = { width: 400, height: 300 };

const mark = (tag: string, name: string, y: number, role = 'textbox'): PictureMark => ({
  tag,
  kind: role === 'button' ? 'action' : 'field',
  role,
  name,
  box: { x: 20, y, width: 160, height: 20 },
});

const row = (field: string, probe: string, message: string): ValidationRow => ({
  field,
  tried: 'left empty',
  message,
  source: 'native',
  probe,
  accepted: false,
});

describe('validationNotes', () => {
  it('shows the empty-field message first, and a radio group once', () => {
    const marks = [
      mark('1', 'Model', 100),
      mark('2', 'Tylko OC', 140, 'radio'),
      mark('3', 'OC + AC', 170, 'radio'),
      mark('A', 'Dalej', 240, 'button'),
    ];
    const rows = [
      row('Model', 'wrong-format', 'Please match the requested format.'),
      row('Model', 'required-empty-one', 'Please fill out this field.'),
      row('Tylko OC', 'required-empty-all', 'Please select one of these options.'),
      row('OC + AC', 'required-empty-all', 'Please select one of these options.'),
    ];
    expect(validationNotes(rows, marks).map((n) => [n.tag, n.text])).toEqual([
      ['1', 'Please fill out this field.'],
      ['2', 'Please select one of these options.'],
    ]);
  });
});

describe('the pictures', () => {
  it('tags every element and embeds the screenshot', () => {
    const svg = elementsSvg(
      PNG,
      PAGE,
      [mark('1', 'Model', 100), mark('A', 'Dalej', 240, 'button')],
      'Step 2',
    );
    expect(svg).toContain('data:image/png;base64,iVBORw==');
    expect(svg).toMatch(/>1<\/text>/);
    expect(svg).toMatch(/>A<\/text>/);
  });

  it('opens a band under each messaged field, so the page below moves down', () => {
    const notes = validationNotes(
      [row('Model', 'required-empty-one', 'Please fill out this field.')],
      [mark('1', 'Model', 100), mark('2', 'Rok', 140)],
    );
    const svg = validationSvg(PNG, PAGE, notes, 'Step 2');
    const height = Number(/height="(\d+)" viewBox/.exec(svg)?.[1]);
    expect(height).toBeGreaterThan(PAGE.height);
    // The slice below the cut (y 123) is drawn moved down by the band.
    expect(svg).toContain(`translate(0,${height - PAGE.height})`);
    expect(svg).toContain('Please fill out this field.');
  });
});
