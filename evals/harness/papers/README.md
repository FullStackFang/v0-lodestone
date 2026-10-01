# Papers fixtures

`inverted-index.json` — the reconstruction fixture. One word at two
positions, one position no word claims, one astral character before every
span the offset tests use, and the `text_hash` its canonical text must
produce. The hash is asserted byte for byte, so a change to
`NORMALIZATION.md` fails here first.

`seed.txt` — five real DOIs across four OpenAlex fields. Ingest them with:

```bash
npm run harness:ingest -- --list evals/harness/papers/seed.txt
```

One line per identifier: `<identifier> <artifact_id> <text_hash>`, or
`<identifier> no_abstract` when the publisher withheld it. Running it twice
prints the same hashes and writes nothing the second time.

`analogy-pairs.json` — labelled query→paper pairs for `bench -- pairs
--edge paper_analogy|prior_art`.
