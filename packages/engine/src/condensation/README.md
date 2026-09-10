# Condensation methods

Nothing here is implemented in Phase 1. Phase 1's condensation output is the
surface-temperature-against-dew-point verdict produced by
`../temperatureProfile.ts`.

`method.ts` defines the extension point. To add a method:

1. Implement `CondensationMethod` in a new file (`iso13788.ts`,
   `din4108-3.ts`).
2. Cite the standard and clause for every constant and equation, per the
   repository convention in `CLAUDE.md`. Anything you cannot attribute gets a
   `TODO(verify)` and a row in `VERIFY.md`.
3. Register it in `CONDENSATION_METHODS`.
4. Reduce across section paths with `worstCasePerInterface`. Do **not** pick a
   single path: the bridging path is colder at the internal surface but warmer
   at the sheathing, so neither path is conservative everywhere.

The two methods are alternatives, chosen by the caller. Neither may become the
implicit behaviour of the U-value path.
