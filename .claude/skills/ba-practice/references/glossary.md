# Glossary (ubiquitous language)

- One `glossary_term` per domain concept that the portal names: product names, insurance terms,
  step names that carry meaning ("Bezszkodowa jazda", "OC", "AC", "Składka", "Polisa").
- `term_verbatim` exactly as shown (case, diacritics); `lang` = portal language; `definition` in
  English, from what the portal shows (tooltips, glossary pages, context). If the meaning is not shown,
  write your best definition with confidence `inferred` or `needs_confirmation`, never `observed`.
- Synonyms: when the portal uses two words for one concept ("klient" / "ubezpieczający"), pick the one
  used most as preferred, list the other in `synonyms_verbatim`, or create both and relate with
  `synonym_of`; ask an `open_question` if they might differ.
- Every other record that uses a term relates to it with `uses_term`, so the vocabulary stays
  consistent across passes. Reuse existing terms (`list_records kind=glossary_term`) before adding.
- Don't add generic UI words ("Dalej", "Wyślij") as terms; they are labels, not domain language.
