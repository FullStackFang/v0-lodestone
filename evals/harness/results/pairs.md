# Bench results — pairs

Append-only. One row per run; a row is never edited after it is written.
`tokens: unknown` means the run recorded no usage — it does not mean the
run was free.

## 2026-09-02

| headline | n | ci95 | prompt_version | core_version | model | tokens | cost | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P@3 0.857 (cofounder) | 11 | [0.571, 1.000] | — | — | no rerank in the scoring path | unknown | unknown | MRR 0.592; violations 4; λ=0.3 μ=0.3; w={"abs":1,"spec":0.5,"domain":0.25,"commit":0.25,"velocity":0.1} |
| fit: λ=0.3 headline=specific MRR 0.663 | — | — | — | — | none (no rerank in the fit) | unknown | unknown | grid 3×2 over λ and the headline rung; weights.ts untouched |
| P@3 0.857 (cofounder) | 11 | [0.571, 1.000] | — | — | no rerank in the scoring path | unknown | unknown | MRR 0.663; violations 4; λ=0.3 μ=0.3; w={"abs":0.5,"spec":1,"domain":0.25,"commit":0.25,"velocity":0.1} |
