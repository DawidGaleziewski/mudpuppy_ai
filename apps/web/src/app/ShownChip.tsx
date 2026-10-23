import { Chip } from '../design-system';
import type { ChipOut } from './api';

/** A chip from the API: its word and variant as the dashboard picked them. */
export function ShownChip({ chip }: { chip: ChipOut }) {
  return <Chip {...(chip.variant ? { variant: chip.variant } : {})}>{chip.word}</Chip>;
}
