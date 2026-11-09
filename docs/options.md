---
hide:
  - toc
---

# Options

All options are optional. Without any, the card shows zone 1, hot water and circulation of a standard ebusd setup.

```yaml
type: custom:ebusd-time-program-card
```

## Card

| Option | Description | Default |
|---|---|---|
| `title` | Card title | "Weekly schedule", translated |
| `programs` | Programs to show, in this order, see [programs](#programs) | `[z1, hwc, cc]` |
| `mode` | `edit`, or `preview` for a read-only week chart, see [preview mode](usage.md#preview-mode) | `edit` |
| `default_days` | Days selected when the card opens: `weekdays`, `weekend`, `all` or `today` | `weekdays` |
| `show_preview` | Show the week preview in edit mode | `true` |
| `layout` | `auto`: two columns from a card width of 720 px; `wide` or `narrow` force one | `auto` |
| `theme` | `brand`: the card's own dark design; `default`: your Home Assistant theme with its primary and accent colour | `brand` |
| `accent` | Any CSS colour to replace the accent colour, e.g. `"#e07a1f"` | theme's |
| `language` | Card language, e.g. `de` or `en-GB`, see [languages](languages.md) | Home Assistant user's language |

## Preview mode

| Option | Description | Default |
|---|---|---|
| `stacked` | Show all programs below each other instead of tabs | `false` |
| `temp_labels` | Temperature inside the bars. `auto`: only when a program uses more than one temperature, otherwise it is shown once in the heading; `always`; `never` | `auto` |
| `preview_days` | Rows of the chart: `week`, `today`, or `today_tomorrow` (Sunday continues with Monday) | `week` |
| `preview_label` | Write the slots of today (or the tapped day) below the chart. With `false` only the bars are shown; hovering a bar shows its times | `true` |

## Writing

| Option | Description | Default |
|---|---|---|
| `verify_timeout` | Seconds to wait per day for the controller to confirm a write | `30` |
| `setback_entity` | Entity with the set-back temperature of zone 1, shown and changed in the ⓘ dialog (a `number` or `input_number` can be changed, a custom `sensor` is only shown). Other zones: per program | `sensor.` or `number.{prefix}_{circuit}_z1setbacktemp`, else `…_z1nighttemp` |

## Source

By default the card reads ebusd's MQTT sensors and writes with `mqtt.publish`. Alternatively it can use the
[Vaillant eBUS](https://github.com/MarkBovee/vaillant-ebus) integration, which talks to ebusd over TCP without MQTT.
It needs a version with the `vaillant_ebus.read_time_program` and `vaillant_ebus.write_time_program` actions.

| Option | Description | Default |
|---|---|---|
| `source` | `mqtt`, or `vaillant_ebus` for the Vaillant eBUS integration | `mqtt` |
| `refresh_interval` | `vaillant_ebus`: seconds between reads of the programs (from ebusd's cache). `0`: only when the dashboard opens and after a write | `300` |
| `entry_id` | `vaillant_ebus`: config entry of the integration, only needed when several are set up | |

With `vaillant_ebus`, the MQTT options below are not used. The set-back temperature of a zone needs
`setback_entity` (e.g. the integration's `number` entity).

```yaml
type: custom:ebusd-time-program-card
source: vaillant_ebus
programs: [z1, hwc, cc]
```

## ebusd

See [ebusd & entities](ebusd.md#different-names) for how entity ids and topics are built.

| Option | Description | Default |
|---|---|---|
| `mqtt_prefix` | ebusd's MQTT topic prefix (`--mqtttopic`) | `ebusd` |
| `circuit` | ebusd circuit of the controller | `ctlv2` |
| `entity_template` | How entity ids are built | `sensor.{prefix}_{circuit}_{message}_{field}` |
| `topic_template` | How MQTT topics are built | `{prefix}/{circuit}/{message}/{action}` |
| `count_message` | Name of the slot-count message without program prefix | detected: `Timeframes` or `Timeslots` |

## Programs

| Id | Program | Temperature per slot |
|---|---|---|
| `z1` | Zone 1 | 5–30 °C |
| `z2` | Zone 2 | 5–30 °C |
| `z3` | Zone 3 | 5–30 °C |
| `hwc` | Hot water | 35–70 °C |
| `cc` | Circulation | – |

An entry is either the id or an object with these keys:

| Key | Description |
|---|---|
| `id` | Program id from the table above (required) |
| `name` | Own name for tab and heading, e.g. `Ground floor`. Without it the tab shows the short form (`Z1`, `HWC`, `CC`) and the heading the full name in the card's language |
| `message_prefix` | ebusd message prefix if your CSV names it differently, e.g. `Z2Timer` |
| `setback_entity` | Zones: entity with the set-back temperature |

```yaml
programs:
  - id: z1
    name: Ground floor
  - id: z2
    name: First floor
    setback_entity: sensor.ebusd_ctlv2_z2setbacktemp
  - hwc
```

Each id may appear once. Invalid values (an unknown theme, program or layout) show an error in place of the card
that names the supported values.
