# Contributing

Bug reports, translations and pull requests are welcome.

The [documentation](https://citoki.github.io/ebusd-time-program/) has more on the
[development setup](https://citoki.github.io/ebusd-time-program/development/) and
[translations](https://citoki.github.io/ebusd-time-program/translations/). Its sources are in `docs/`.

## Reporting a bug

Please include:

- the card's version (printed in the browser console as `ebusd-time-program-card x.y.z`)
- your controller (e.g. VRC720 / `ctlv2`) and ebusd version
- the card's YAML configuration
- what you expected and what happened, with a screenshot if it helps

Remove personal data (entity names, IP addresses, tokens) before posting logs or states.

## Development setup

Developed with Node.js 24.

```sh
npm install
npm run dev        # dev page on http://localhost:5199
```

The dev page runs the card against a fake ebusd controller (`test/fake-ebusd.ts`), so no Home Assistant is needed.
It shows the card in a narrow (400 px) and a wide (820 px) frame. The bars at the top switch language, card theme,
light/dark HA theme and sensor-state scenarios (ebusd offline, entities missing, startup …).
More options are URL parameters, listed at the top of `dev/main.ts`, e.g. `?mode=preview&stacked=1` or
`?ignore=Z1Timer_Tuesday` to make a write fail.

Other commands:

```sh
npm test           # unit tests (vitest)
npm run typecheck  # TypeScript
npm run build      # dist/ebusd-time-program-card.js, one self-contained file
npm run screenshot -- shot.png "tab=1&layout=wide"   # screenshot of the dev page (Playwright)
```

To try a build in Home Assistant, copy `dist/ebusd-time-program-card.js` to `/config/www/` and add it as a dashboard
resource (`/local/ebusd-time-program-card.js`, type JavaScript module). `scripts/ha-loader.js` is a small loader that
always fetches the latest copy, so you don't fight the browser cache while testing.

## Project layout

| Path | Contents |
|---|---|
| `src/ebusd-time-program-card.ts` | the card element: state, rendering, write flow |
| `src/components/` | render functions for tabs, day picker, slot list, preview, sheets, apply bar |
| `src/model/` | time programs without UI: parsing, editing, validation |
| `src/adapters/mqtt.ts` | reading ebusd MQTT entities and building write payloads |
| `src/write-job.ts` | writes day by day and verifies each day against the controller |
| `src/i18n/` | translations |
| `test/` | unit tests and the fake ebusd controller |
| `dev/` | dev page |

## Translations

The card ships with 14 languages in `src/i18n/`. `en.ts` is the reference; every other file must provide the same
keys (TypeScript and `test/i18n.test.ts` check this).

- **Fix a translation:** edit the language file. Native speakers are very welcome: most texts were not written by one.
- **Add a language:** copy `en.ts` to `<code>.ts` (code as in HA, e.g. `pt-BR`), translate it, register it in
  `LANGUAGES` in `src/i18n/index.ts` and add its name to `dev/settings-bar.ts`. Mind plural rules (see `pl.ts`).
- Check the result on the dev page with the language selector, in both the narrow and the wide frame, because longer
  words can break the layout.

## Pull requests

- Keep a pull request to one topic.
- `npm test`, `npm run typecheck` and `npm run build` must pass.
- Add or update tests for changes in `src/model/`, `src/adapters/` and `src/write-job.ts`.
- For visible changes, add a screenshot (before/after) from the dev page.
- Don't commit `dist/` or recorded states from a real installation; test data is generated
  (`test/fixtures/hass-states.ts`).
- Commit messages: short, lowercase, imperative, e.g. `preview: day column only as wide as its content`.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
