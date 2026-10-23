import { Chip } from '../design-system';
import type { ChipOut } from './api';

/** A chip from the API: its word and variant as the dashboard picked them, and what it means when it is terse. */
export function ShownChip({ chip, said }: { chip: ChipOut; said?: string | null }) {
  return (
    <Chip {...(chip.variant ? { variant: chip.variant } : {})} said={said ?? undefined}>
      {chip.word}
    </Chip>
  );
}
