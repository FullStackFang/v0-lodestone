## Context

After `lodestone-corpus-compact` a corpus document is one `artifact_texts`
row (the canonical abstract, `text_hash`) and one `document_chunk` row (one
`halfvec(1024)` for the whole abstract). `source_format` is a Postgres enum
(`abstract | deck | resume | stage_event`) mirrored by `SOURCE_FORMATS` in
`src/harness/schema.ts`. Block vectors are `assertions` rows read by
`ideaVectors`. `ingestWork` returns `created: false` from `storedBySourceId`
before fetching when a DOI or OpenAlex id is already stored, so a document
once written is never re-read unless asked. `priorArtFor` cuts to `k` (now
`3k`) inside SQL, so anything that should change a document's place must be
in that statement, not in `hitFrom`. `NORMALIZATION.md` fixes how text is
canonicalised; Whetstone's `support` rows anchor by substring in the
abstract the run read, checked against `abstractHash`.

## Decisions

### 1. Sentences are a table keyed to the text they were cut from

```
document_sentence(document_id, text_hash, ordinal, start, end,
                  embedding halfvec(1024),
                  primary key (document_id, ordinal))
```

`start` and `end` are offsets into the canonical text with that `text_hash`,
so the sentence text is a slice and is never stored twice; the same offsets
are what a `support` row would anchor on. `ensureSentences` compares the
row's `text_hash` to the document's current one and re-splits when they
differ. Filling happens where hits are about to be returned: `searchCard`
warms the top ten when a search reaches `done`, and the `GET` route and card
page fill any hit still missing rows, so the first read after a search is
already warm and an older card costs one embed batch on its first read.

### 2. Splitting is a rule, not a model

Split on `. `, `? `, `! ` followed by an upper-case letter or a digit, after
protecting the common abbreviations (`e.g.`, `i.e.`, `et al.`, `Fig.`, `vs.`,
single initials). Shorter than four words joins the sentence before it. The
splitter is a pure function with its own tests on the eval set's abstracts;
it does not need to be perfect, it needs to be deterministic and to produce
sentences a reader recognises.

### 3. Three sentences, by the best block, in abstract order

For a hit, the best block is `blockKeys[0]`. Cosine of each sentence vector
to each entry vector of that block, max over entries; take the top three;
return them in abstract order with their cosines and the block key. A tie in
`blocks` (the 0.03 band) does not add sentences; the first block decides.
One SQL statement per hit over at most a few dozen rows. The hit also
carries `abstractHash`, the `text_hash` the sentences were cut from, so a
client that stored anything against the hit can tell when the abstract
changed without a second read.

### 4. Cost

Embedding sentences is the only new spend: an abstract is seven to ten
sentences, so a top ten costs under a hundred short embeds the first time it
is asked for, one Voyage batch (`embed.ts` batches at 128), and nothing
after. On a read that has to fill rows this adds half a second to a second
and a half; the warm path from `searchCard` is what keeps that off the
common case.

### 5. Thin is an enum value, a provenance flag, and an ingest option

Migration `0016` adds `tldr` to the `source_format` enum and
`SOURCE_FORMATS` gains `"tldr"`. A thin document is written with
`source_format = "tldr"`, `provenance.thin = true`, and the TLDR as its
canonical text. `ingestWork` gains `{ tldr?: string, replaceThin?: boolean }`:
when the fetched work has no abstract and a `tldr` is given, it writes thin
instead of reporting `no_abstract`, exempt from `MIN_ABSTRACT_WORDS`; when
`replaceThin` is set and the stored row has `provenance.thin`, the early
`storedBySourceId` return is bypassed, the work is fetched, and an abstract
replaces the TLDR as a new `artifact_texts` version (so `abstractHash`
changes and the sentence rows are re-cut). Only the card-search path passes
either option; `lodestone:ingest --query` keeps refusing works without
abstracts.

### 6. `THIN_FACTOR` is in the SQL ordering, and `score` stays the cosine

0.9, applied in the `best` CTE's ordering key by joining
`artifact_texts.provenance->>'thin'`, before the `3k` cut and before the
quota. The hit's `score` is still the plain best-block cosine — the one
rule every ordering effect in this series follows, so a client never sees a
number that means two things — and the hit says `thin: true`. The eval set
has no thin documents to measure the factor on, so it is provisional and
named as such in `thresholds.md`; the first real cohort's verdicts on thin
hits are what would move it.

### 7. The API says what it is returning

`sentences`, `thin` and `abstractHash` on the hit; `thin`, `abstractKind` on
the read endpoint. Whetstone (`forge-network-why`) reads all three and marks
a thin why as lower confidence. Nothing is hidden: a thin document's
"abstract" is a summary someone else's model wrote, and the client is told so.
