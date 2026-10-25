# research/

One folder per research question, written by the `research-review` skill
(`.claude/skills/research-review/SKILL.md`):
- `question.md`: the question in the author's words
- `search.json`: the stored and live OpenAlex papers `lodestone:search` returned for it
- `review.md`: what holds up, what is taken, the gap, the studies, citing only those hits
- `smoke-tests.md`: three tests of at most a day and $20 each, every one with a numeric
  kill threshold fixed before it runs
- `links.json`: each claim, gap and smoke test mapped to stored document ids by
  `lodestone:research-links`

This is the author's work, so it is committed. The database the ids point into lives in
`data/`, which is not.
