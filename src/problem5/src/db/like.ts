import { literal } from 'sequelize';

/** Sequelize 6 does not re-export the `Literal` type from its package root. */
type Literal = ReturnType<typeof literal>;

/**
 * Escape `%`, `_` and `\` so a user-supplied string matches literally in a
 * `LIKE`/`ILIKE` pattern.
 *
 * The order is the part that bites: PostgreSQL's default LIKE escape character
 * is the backslash, so `\` must be doubled FIRST. Escape `%` and `_` first and
 * the backslashes you just added get doubled in turn, and the filter silently
 * stops matching.
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[%_]/g, (match) => `\\${match}`);
}

const NAME_PATTERN_BINDING = 'namePattern';

export interface NameFilter {
  where: Literal;
  replacements: Record<string, string>;
}

/**
 * Case-insensitive "contains" on `name`, as one object: the fragment and the
 * replacement it needs are produced together, so a call site cannot supply one
 * without the other. A raw literal rather than `Op.iLike` - see the `name`
 * filter in README.md.
 *
 * Sequelize `replacements` are escaped and inlined into the SQL text; they are
 * not server-side bind parameters, and `Model.findAll` accepts no `bind`.
 */
export function nameContains(value: string): NameFilter {
  return {
    where: literal(`"name" ILIKE :${NAME_PATTERN_BINDING} ESCAPE '\\'`),
    replacements: { [NAME_PATTERN_BINDING]: `%${escapeLike(value)}%` },
  };
}
