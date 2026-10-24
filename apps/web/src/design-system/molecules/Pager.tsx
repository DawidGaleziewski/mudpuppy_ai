import { Anchor } from '../atoms/Anchor.js';

export interface PagerStep {
  href: string;
  /** The neighbour's title: in its accessible name ("Next: Kontakt") and on hover. */
  title: string;
}

export interface PagerProps {
  /** The list it steps through ("Screens in this list", "Steps of Oblicz składkę"). */
  label: string;
  /** This item's place, from 1. */
  position: number;
  total: number;
  prev?: PagerStep | null;
  next?: PagerStep | null;
}

/**
 * Previous / Next through the list a page was opened from (designer T-02, D-66, FE-V32):
 * "← Previous · 4 of 37 · Next →" in the page head's actions. At an end the button stays,
 * disabled, so nothing moves. J / K are the app's (they work while focus isn't in a field).
 */
export function Pager({ label, position, total, prev, next }: PagerProps) {
  return (
    <nav className="sy-pager" aria-label={label}>
      <Step step={prev} rel="prev" word="← Previous" name="Previous" keys="K" />
      <span className="sy-pager__pos">{`${String(position)} of ${String(total)}`}</span>
      <Step step={next} rel="next" word="Next →" name="Next" keys="J" />
    </nav>
  );
}

function Step({ step, rel, word, name, keys }: { step: PagerStep | null | undefined; rel: string; word: string; name: string; keys: string }) {
  if (!step)
    return (
      <a className="sy-btn sy-btn--sm" role="link" aria-disabled="true">
        {word}
      </a>
    );
  return (
    <Anchor className="sy-btn sy-btn--sm" rel={rel} href={step.href} title={step.title} aria-label={`${name}: ${step.title}`} aria-keyshortcuts={keys}>
      {word}
    </Anchor>
  );
}
