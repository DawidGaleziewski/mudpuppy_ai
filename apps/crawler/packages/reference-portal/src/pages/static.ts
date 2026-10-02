import { layout } from '../html.js';
import { ASSISTANCE_PRICE, BASE_AC, BASE_OC } from '../rules.js';

export function home(): string {
  return layout(
    'Ubezpieczenia dla Ciebie',
    `<section aria-labelledby="produkty"><h2 id="produkty">Nasze produkty</h2>
<ul>
<li><a href="/ubezpieczenia/samochod">Ubezpieczenie samochodu (OC i AC)</a></li>
<li><a href="/ubezpieczenia/dom">Ubezpieczenie domu i mieszkania</a></li>
<li><a href="/ubezpieczenia/podroze">Ubezpieczenie turystyczne</a></li>
</ul></section>
<section aria-labelledby="szybko"><h2 id="szybko">Na skróty</h2>
<ul>
<li><a href="/kalkulator/pojazd">Oblicz składkę OC/AC</a></li>
<li><a href="/porownanie">Porównaj produkty</a></li>
<li><a href="/moje-polisy/przedluz">Przedłuż polisę</a></li>
<li><a href="/kontakt">Napisz do nas</a></li>
</ul></section>`,
  );
}

export function car(): string {
  return layout(
    'Ubezpieczenie samochodu',
    `<p>Obowiązkowe OC chroni Cię, gdy wyrządzisz szkodę innym. Dobrowolne Autocasco (AC) chroni Twój pojazd.</p>
<h2>Co wpływa na składkę?</h2>
<ul><li>Wiek kierowcy</li><li>Pojemność silnika</li><li>Lata bezszkodowej jazdy</li><li>Wybrany zakres i Assistance</li></ul>
<p>Składka bazowa OC wynosi od ${BASE_OC} zł, AC od ${BASE_AC} zł, Assistance ${ASSISTANCE_PRICE} zł.</p>
<p><a href="/kalkulator/pojazd">Oblicz składkę</a></p>`,
  );
}

export function house(): string {
  return layout(
    'Ubezpieczenie domu',
    `<p>Ubezpieczenie mieszkania i domu od ognia, zalania i kradzieży. Suma ubezpieczenia ustalana jest indywidualnie.</p>
<p>Aby otrzymać ofertę na ubezpieczenie domu, <a href="/kontakt">napisz do nas</a>.</p>`,
  );
}

export function faq(): string {
  return layout(
    'Najczęściej zadawane pytania',
    `<h2>Zgłoszenie szkody</h2>
<p>Szkodę zgłosisz telefonicznie lub w serwisie Moje polisy. O wysokości odszkodowania decyduje likwidator szkody.</p>
<h2>Jak obliczana jest składka?</h2>
<p>Składka zależy od wieku kierowcy, pojemności silnika i lat bezszkodowej jazdy. Szczegóły zobaczysz w kalkulatorze.</p>
<h2>Czy mogę przedłużyć polisę online?</h2>
<p>Tak, po zalogowaniu w serwisie Moje polisy.</p>
<h2>Czym są OWU?</h2>
<p>OWU to Ogólne Warunki Ubezpieczenia — dokument opisujący zakres ochrony.</p>`,
  );
}

export const GLOSSARY: readonly [string, string][] = [
  ['OC', 'Obowiązkowe ubezpieczenie odpowiedzialności cywilnej posiadaczy pojazdów.'],
  ['Autocasco (AC)', 'Dobrowolne ubezpieczenie pojazdu od uszkodzeń i kradzieży.'],
  ['Assistance', 'Pomoc w podróży: holowanie, auto zastępcze, naprawa na miejscu.'],
  ['Bezszkodowa jazda', 'Okres, w którym kierowca nie spowodował szkody z polisy OC.'],
  ['Składka', 'Kwota płacona za ochronę ubezpieczeniową.'],
  ['Suma ubezpieczenia', 'Najwyższa kwota, jaką wypłaci ubezpieczyciel.'],
  ['OWU', 'Ogólne Warunki Ubezpieczenia.'],
  ['Ubezpieczający', 'Osoba zawierająca umowę i płacąca składkę.'],
  ['Ubezpieczony', 'Osoba objęta ochroną ubezpieczeniową.'],
  ['Kod rabatowy', 'Kod promocyjny obniżający składkę.'],
];

export function glossary(): string {
  return layout(
    'Słowniczek pojęć',
    `<dl>${GLOSSARY.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl>`,
  );
}

export function notFound(): string {
  return layout(
    'Nie znaleziono strony',
    '<p>Strona nie istnieje. <a href="/">Wróć na stronę główną</a>.</p>',
  );
}
