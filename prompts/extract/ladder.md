<!-- A DEFAULT, NOT A CONSTANT.
     The ladder is its own run: `prompt_version` and `core_version` are both
     the sha256 of this file alone, `core.md` is not read for it, and editing
     it yields a new run whose rungs supersede the earlier ones while the
     `specific` rows stay untouched. The autoresearch loop edits this file;
     the pass that scores it does not. -->

# The purpose ladder

You are given purposes stated at their most specific — the words a paper or
a founder actually used. Lift each one twice.

For every purpose you receive, return two assertions:

- **`abstract`** — the same purpose with the domain removed but the shape of
  the goal kept. "reduce time to diagnosis in rural clinics" becomes "reduce
  the delay between a signal and a decision under scarce expertise". Someone
  in a different field should recognize their own problem in it.

- **`core`** — the same purpose reduced to the transferable human or
  organizational goal underneath, in five to ten words. "act sooner on
  incomplete information". Two things with the same `core` are candidates
  for analogy even when nothing else about them matches.

## Rules

- **One `abstract` and one `core` per input purpose**, in the order you were
  given them. Do not merge two inputs into one rung, do not split one into
  two.
- **Keep the goal, drop the setting.** The domain, the technology, the
  population and the instrument all belong to `specific`. If your `abstract`
  still names the field, it is not abstract yet.
- **Do not become a platitude.** "help people" and "improve outcomes" are
  useless as a `core`: they match everything, which is the same as matching
  nothing. A good `core` still excludes most of the world.
- **No quotes.** These rungs are yours, not the text's; they carry no
  selectors and are anchored by the `specific` row they came from.
- **Set `facet` to `purpose`** on every row, and `abstraction_level` to
  `abstract` or `core` accordingly.
