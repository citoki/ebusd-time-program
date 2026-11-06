# Translations

All texts are in `src/i18n/`, one file per language. `en.ts` is the reference: every other file must provide the
same keys, which TypeScript and `test/i18n.test.ts` check.

## Fix a translation

Edit the language file and open a pull request, or open an issue with the wrong and the better text. Native
speakers are very welcome: most texts were not written by one.

Some texts are functions because they contain numbers or names:

```ts
slotsLeft: (n: number) => `(${n} left)`,
applyTo: (n: number) => `Apply to ${n === 1 ? "1 day" : `${n} days`}`,
```

Keep the placeholders, change the words around them. Plural rules differ: Polish and Ukrainian have helpers for
their three forms (see `pl.ts`), Hungarian keeps the noun singular after numbers.

## Add a language

1. Copy `src/i18n/en.ts` to `src/i18n/<code>.ts`, using the language code Home Assistant uses (e.g. `pt-BR`).
2. Translate it.
3. Register it in `LANGUAGES` in `src/i18n/index.ts`.
4. Add its name to `LANGUAGE_NAMES` in `dev/settings-bar.ts`.
5. Run `npm test`.

## Check it

Open the dev page (`npm run dev`), pick the language at the top and look at both frames, the narrow and the wide
one: longer words can break the layout. Check the dialogs, the error messages (e.g. make two slots overlap) and a
failed write (`?ignore=Z1Timer_Monday`) too.
