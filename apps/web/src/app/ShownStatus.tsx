import { Status, Text } from '../design-system';
import type { StatusOut } from './api';

/** A status from the API: its shape and word, or a plain label for a kind without a shape. */
export function ShownStatus({ status }: { status: StatusOut }) {
  return status.shape ? <Status status={status.shape}>{status.word}</Status> : <Text mono>{status.word}</Text>;
}
