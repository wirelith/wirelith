# Learnability eval

Wirelith is meant to be learnable from one page. This eval measures that: a model is given only the one-page AI spec ([spec/ai-spec.md](../spec/ai-spec.md)) and a set of five wireframe tasks, writes its answer once with no checking or revision, and the answer is scored.

Running models is manual. Nothing here calls a model or needs an API key, and CI never runs a model: it only tests the scorer.

## Files

| Path | What it is |
| --- | --- |
| `tasks/tasks.md` | Task sets A and B, five tasks each |
| `prompt.mjs` | Prints the exact prompt for a set: the AI spec, then the tasks |
| `score.mjs` | Scores an answer |
| `requirements.mjs` | What each task asks for, as checks on the answer's syntax tree |
| `results/RESULTS.md` | The table of recorded results |
| `test/fixtures/` | Reference answers that score full marks, used by the scorer's tests |

## Running it

1. Build the packages once: `pnpm install && pnpm build`.
2. Make the prompt: `node eval/prompt.mjs --set a > prompt-a.md`.
3. Give `prompt-a.md` to the model as the whole conversation: no system prompt about Wirelith, no tools, no examples, no retries. Use its first reply.
4. Save the reply, unedited, as `eval/results/<date>-<model>-a.md`. For example, `eval/results/2026-11-12-modelname-a.md`.
5. Score it: `node eval/score.mjs --set a eval/results/<date>-<model>-a.md`.
6. Add a row to `results/RESULTS.md` and commit both files.

Repeat for set B. Use at least two model families, so the result says something about the language rather than about one model.

## How an answer is scored

For each of the five tasks, in order:

- **Valid:** the block has no errors under `@wirelith/core`'s `validate`. Warnings are counted, not penalised.
- **Requirements:** the block meets each thing the task asks for, such as "a phone screen" or "tabs for Profile, Security and Notifications". The checks look for what the task names, not for exact wording or layout. An invalid block meets none.

A missing block scores zero. The headline numbers are valid blocks out of 5, requirements met out of the set's total, and warnings.

Recorded answers must contain only made-up products and people, like everything else in this repository. If a model invents a name that might be real, edit the answer before committing it, and say so in the notes column.
