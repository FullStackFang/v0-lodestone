# Bench results — coda

Append-only. One row per run; a row is never edited after it is written.
`tokens: unknown` means the run recorded no usage — it does not mean the
run was free.

## 2026-09-02

| headline | n | ci95 | prompt_version | core_version | model | tokens | cost | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.206 | 6 | [0.100, 0.338] | 93b6f30c60ea | c91e9db56dd1 | cli:claude-opus-5 | 497196 | unknown | dev split, sample of 10 by fixed seed |
