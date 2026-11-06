# Languages

The card follows the language of the Home Assistant user (**Profile :material-arrow-right: Language**). If that
language isn't available, it uses the base language (e.g. `de` for `de-AT`), otherwise English. To fix the
language for one card, set `language`:

```yaml
type: custom:ebusd-time-program-card
language: fr
```

| Code | Language | Code | Language |
|---|---|---|---|
| `en` | English | `pl` | Polski |
| `en-GB` | English (UK) | `hu` | Magyar |
| `de` | Deutsch | `ro` | Română |
| `fr` | Français | `uk` | Українська |
| `es` | Español | `sv` | Svenska |
| `it` | Italiano | `da` | Dansk |
| `nl` | Nederlands | `el` | Ελληνικά |

Numbers follow the language too: `21.5 °C` in English, `21,5 °C` in German.

Program names and the title are translated unless you set your own with `title` and `name`.

!!! note "Help wanted"

    The translations were made with machine translation and haven't been reviewed by native speakers yet. If something
    sounds wrong, see [translations](translations.md) for how to fix it.
