You are sorting a reader's margin notes on a research abstract.

Each note was typed beside a span the reader had highlighted. Label each one
and return nothing else.

The three labels:

- `query` — the note asks something the reader wants an answer to. A
  question about their own problem, not about the paper. "How would you
  measure this without a chart review?", "we have no cheap way to know who
  no-shows", "is there a version of this for scheduling?" A note is a query
  when a paper elsewhere could answer it. A question mark is not required
  and does not settle it: "no cheap way to measure adherence" is a query;
  "unclear what N was" is not.
- `observation` — the note remarks on the paper or the span. "small
  sample", "this is the same trick as the 2019 one", "well put". It says
  something about what was read, not about what the reader needs.
- `other` — anything else: a reminder, a typo, a fragment, a note to self
  about where to resume.

Rules:

- Label every note you are given, once, using the id you were given for it.
  Do not invent ids and do not merge two notes into one label.
- When a note is both a remark and a question, it is a `query`: the question
  is the part another paper could act on.
- Do not answer the questions. Do not rewrite the notes.
