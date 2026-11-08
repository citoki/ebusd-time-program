# Development

The card is a [Lit](https://lit.dev) web component in TypeScript, bundled by [Vite](https://vite.dev) into one
self-contained file. Developed with Node.js 24.

```sh
git clone https://github.com/citoki/ebusd-time-program.git
cd ebusd-time-program
npm install
npm run dev        # dev page on http://localhost:5199
```

## Dev page

The dev page runs the card against a simulated controller (`test/fake-ebusd.ts`) that answers MQTT writes and
reads like ebusd would, so no Home Assistant is needed. It shows the card in a narrow (400 px) and a wide (820 px)
frame.

The bars at the top switch:

- **Language**, **card theme** (`brand` / `default`) and a dark or light **HA theme**
- **Sensor states**: normal, ebusd just started, ebusd offline, entities missing …

More settings are URL parameters, listed at the top of `dev/main.ts`:

| Parameter | Effect |
|---|---|
| `tab=1` `days=saturday,sunday` | open a tab, select days |
| `mode=preview` `stacked=1` `labels=always` | preview mode |
| `range=today` `range=today_tomorrow` `nolabel=1` | preview rows, hide the detail line |
| `layout=wide` | force a layout |
| `programs=z1,z2,hwc` | programs (the simulated system has no Z2/Z3) |
| `delay=300` | milliseconds per simulated bus operation |
| `ignore=Z1Timer_Tuesday` | the controller acknowledges this write but ignores it, so verifying fails |
| `timeout=5` | verify timeout in seconds |
| `nomqtt=1` | Home Assistant without `callService` |

## Commands

```sh
npm test           # unit tests (vitest)
npm run typecheck  # TypeScript
npm run build      # dist/ebusd-time-program-card.js
npm run screenshot -- shot.png "tab=1&layout=wide"   # screenshot of the dev page (Playwright)
```

## Try it in Home Assistant

Copy `dist/ebusd-time-program-card.js` to `/config/www/` and register it as a resource, see
[manual installation](index.md#installation). With the
[loader](https://github.com/citoki/ebusd-time-program/blob/main/scripts/ha-loader.js) as the resource, each new
copy is picked up on the next reload without touching the browser cache.

## Project layout

| Path | Contents |
|---|---|
| `src/ebusd-time-program-card.ts` | the card element: state, rendering, write flow |
| `src/components/` | tabs, day picker, slot list, week preview, sheets, apply bar |
| `src/model/` | time programs without UI: parsing, editing, validation, payloads |
| `src/adapters/mqtt.ts` | reading the ebusd sensors from `hass.states` |
| `src/write-job.ts` | writes day by day and verifies each day against the controller |
| `src/i18n/` | translations |
| `test/` | unit tests, the simulated controller, generated sample states |
| `dev/` | dev page |
| `docs/` | this documentation |

## Releasing

The version lives in `package.json` only; the card reads it from there for the console banner.

1. Bump it without creating a tag: `npm version 0.4.0 --no-git-tag-version`, commit and push.
2. Tag and push: `git tag v0.4.0 && git push origin v0.4.0`.
3. The [release workflow](https://github.com/citoki/ebusd-time-program/blob/main/.github/workflows/release.yaml)
   checks that the tag matches `package.json`, runs typecheck, tests and build, and creates a **draft release** with
   `ebusd-time-program-card.js` attached and generated release notes.
4. Review the notes on GitHub and publish the release. HACS offers the new version from then on.

## Documentation

The documentation is built with [Zensical](https://zensical.org) and published to GitHub Pages on every push to
`main` that changes `docs/` or `zensical.toml`. To preview it locally:

```sh
uvx zensical serve     # or: pip install zensical && zensical serve
```

## Pull requests

- Keep a pull request to one topic.
- `npm test`, `npm run typecheck` and `npm run build` must pass.
- Add or update tests for changes in `src/model/`, `src/adapters/` and `src/write-job.ts`.
- For visible changes, add a before/after screenshot from the dev page.
- Don't commit `dist/` or states recorded from a real installation; test data is generated
  (`test/fixtures/hass-states.ts`).
