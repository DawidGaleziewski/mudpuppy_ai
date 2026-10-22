/** Column helpers shared by the table types (`db-types-*.ts`). */
import type { ColumnType } from 'kysely';

/** Nullable text column a v1 writer may leave out. */
export type Nullable = ColumnType<string | null, string | null | undefined, string | null>;

/** A column 0040 added to `entity_refs`: null unless it is the ref's one target. */
export type OptionalRef = ColumnType<string | null, string | null | undefined, string | null>;
