/** The fixture portal's pages and forms: accessibility snapshots, the calculator picture, fields. */
import type { Box } from '@mudpuppy/core';
import { PNG } from 'pngjs';

const page = (heading: string, body: string): string =>
  [
    '- banner:',
    '  - navigation "Menu główne":',
    '    - link "Start":',
    '      - /url: /',
    '    - link "Samochód":',
    '      - /url: /ubezpieczenia/samochod',
    '    - link "Oblicz składkę":',
    '      - /url: /kalkulator/pojazd',
    '    - link "Kontakt":',
    '      - /url: /kontakt',
    '- main:',
    `  - heading "${heading}" [level=1]`,
    body,
  ].join('\n');

export const SNAPSHOTS = {
  home: page(
    'Ubezpieczenia na każdą drogę',
    '  - paragraph: Porównaj oferty OC, Autocasco (AC) i Assistance.',
  ),
  car: page(
    'Ubezpieczenie samochodu',
    [
      '  - paragraph: OC jest obowiązkowe. Autocasco (AC) tylko dla pojazdów do 15 lat.',
      '  - link "Oblicz składkę":',
      '    - /url: /kalkulator/pojazd',
      '  - button "Kup polisę"',
    ].join('\n'),
  ),
  vehicle: page(
    'Kalkulator OC/AC — dane pojazdu',
    [
      '  - form "Dane pojazdu":',
      '    - combobox "Marka"',
      '    - textbox "Model"',
      '    - spinbutton "Rok produkcji"',
      '    - spinbutton "Pojemność silnika (cm³)"',
      '    - textbox "Kod pocztowy"',
      '    - text: Format NN-NNN',
      '    - button "Dalej"',
    ].join('\n'),
  ),
  contact: page(
    'Kontakt',
    [
      '  - form "Formularz kontaktowy":',
      '    - textbox "Imię"',
      '    - combobox "Temat"',
      '    - textbox "Wiadomość"',
      '    - textbox "Telefon"',
      '    - textbox "E-mail"',
      '    - text: Podaj telefon lub e-mail.',
      '    - button "Wyślij"',
    ].join('\n'),
  ),
  other: '- main:\n  - heading "Start" [level=1]',
} as const;

/** Size and element boxes of the calculator page's fixture screenshot (keys from its snapshot). */
export const VEHICLE_PNG = { width: 400, height: 300 };
export const VEHICLE_BOXES: Record<string, Box> = {
  'heading "Kalkulator OC/AC — dane pojazdu"': { x: 20, y: 60, width: 300, height: 24 },
  'combobox "Marka"': { x: 20, y: 100, width: 160, height: 20 },
  'textbox "Model"': { x: 200, y: 100, width: 160, height: 20 },
  'spinbutton "Rok produkcji"': { x: 20, y: 140, width: 160, height: 20 },
  'spinbutton "Pojemność silnika (cm³)"': { x: 200, y: 140, width: 160, height: 20 },
  'textbox "Kod pocztowy"': { x: 20, y: 180, width: 160, height: 20 },
  'button "Dalej"': { x: 20, y: 240, width: 80, height: 28 },
};

/** A deterministic PNG: white page, grey boxes where the layout says the elements are. */
export function fixturePng(width: number, height: number, boxes: Record<string, Box>): Uint8Array {
  const png = new PNG({ width, height });
  png.data.fill(255);
  for (const b of Object.values(boxes))
    for (let y = b.y; y < b.y + b.height; y++)
      for (let x = b.x; x < b.x + b.width; x++) {
        const i = (y * width + x) * 4;
        png.data[i] = png.data[i + 1] = png.data[i + 2] = 210;
      }
  return new Uint8Array(PNG.sync.write(png, { deflateLevel: 9, filterType: 4 }));
}

export const VEHICLE_FIELDS = [
  {
    name: 'marka',
    type: 'select',
    required: true,
    options: ['— wybierz —', 'Toyota', 'Skoda', 'Inna'],
  },
  { name: 'model', type: 'text', required: true, constraints: { maxlength: 40 } },
  { name: 'rok_produkcji', type: 'number', required: true, constraints: { min: 1990, max: 2026 } },
  { name: 'pojemnosc', type: 'number', required: true, constraints: { min: 50, max: 8000 } },
  {
    name: 'kod_pocztowy',
    type: 'text',
    required: true,
    constraints: { pattern: '[0-9]{2}-[0-9]{3}' },
    validation_messages: ['Please fill out this field.'],
  },
];

export const CONTACT_FIELDS = [
  { name: 'imie', type: 'text', required: true, constraints: { maxlength: 60 } },
  {
    name: 'temat',
    type: 'select',
    required: true,
    options: ['— wybierz —', 'Oferta', 'Szkoda', 'Inne'],
  },
  { name: 'wiadomosc', type: 'textarea', required: true, constraints: { maxlength: 1000 } },
  { name: 'telefon', type: 'tel', required: false, constraints: { pattern: '\\+?[0-9 ]{9,15}' } },
  { name: 'email', type: 'email', required: false },
];
