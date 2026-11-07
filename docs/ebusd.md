# ebusd & entities

The card has no integration of its own. It reads the sensors that ebusd's Home Assistant MQTT discovery creates,
and writes by publishing to ebusd's MQTT topics.

``` mermaid
flowchart LR
  C[VRC 720 controller] <-- eBUS --> A[eBUS adapter] <--> E[ebusd]
  E <-- MQTT --> B[MQTT broker] <--> H[Home Assistant]
  H --> K[Time program card]
  K -- mqtt.publish --> B
```

## ebusd setup

You need:

- an eBUS adapter, e.g. the [C6 stick](https://adapter.ebusd.eu/v5-c6/stick.en.html)
- [ebusd](https://github.com/john30/ebusd), e.g. as the
  [Home Assistant add-on](https://github.com/LukasGrebe/ha-addons), with MQTT enabled
- Home Assistant MQTT discovery in ebusd (`--mqttint=/etc/ebusd/mqtt-hassio.cfg`), see the
  [ebusd MQTT wiki](https://github.com/john30/ebusd/wiki/MQTT-integration)
- the controller's message definitions, e.g. `15.ctlv2.csv` for the VRC 720, with **all three slots per day**
  of the `…Timer_<Day>` messages. The upstream definitions don't have them yet, see
  [ebusd configuration](ebusd-config.md)

## What the card reads

For each program and day the controller has up to three slots. ebusd exposes each slot as one message, and
discovery turns its fields into sensors. With the defaults (`mqtt_prefix: ebusd`, `circuit: ctlv2`):

| Entity | Content |
|---|---|
| `sensor.ebusd_ctlv2_z1timer_monday0_htm` | start of slot 0 on Monday, e.g. `06:00` |
| `sensor.ebusd_ctlv2_z1timer_monday0_htm_1` | end of slot 0 |
| `sensor.ebusd_ctlv2_z1timer_monday0_slottemp` | temperature of slot 0 (zones and hot water) |
| `sensor.ebusd_ctlv2_z1timer_monday1_…`, `…monday2_…` | slots 1 and 2 |
| `sensor.ebusd_ctlv2_z1timer_timeslots_slotcount` | number of slots on Monday |
| `sensor.ebusd_ctlv2_z1timer_timeslots_slotcount_1` … `_6` | number of slots Tuesday … Sunday |
| `sensor.ebusd_ctlv2_z1setbacktemp` | set-back temperature of zone 1, shown in the info text (optional; `number.…` when writes are discovered too; older configs: `…_z1nighttemp`) |

The other programs use the prefixes `z2timer`, `z3timer`, `hwctimer` and `cctimer`. That is about 70 sensors per
program. The card only re-renders when one of them changes.

The slot-count message is called `…Timer_Timeslots` in the current ebusd configuration and `…Timer_Timeframes` in
older ones. The card finds it by itself; set [`count_message`](options.md) if yours is named differently.

## What the card writes

A day is always written as a whole, one `/set` message per slot, in order:

```text
topic:   ebusd/ctlv2/Z1Timer_Monday/set
payload: 0;2;06:00;08:00;21.0      slot index; slot count; start; end; temperature
         1;2;16:00;22:00;21.0
```

Circulation has no temperature (`0;2;06:00;06:10`). An empty day is written as one slot with count `0`.

After writing a day the card publishes `?1` to the `/get` topics of that day's messages, so ebusd reads them
again from the controller, and compares the result with what it wrote. See [how writing works](usage.md#apply).

## Different names

If your entities or topics are named differently, adjust the templates instead of renaming entities:

| Option | Default | Placeholders |
|---|---|---|
| `mqtt_prefix` | `ebusd` | ebusd's `--mqtttopic` |
| `circuit` | `ctlv2` | ebusd circuit of the controller |
| `entity_template` | `sensor.{prefix}_{circuit}_{message}_{field}` | `{prefix}`, `{circuit}`, `{message}`, `{field}` |
| `topic_template` | `{prefix}/{circuit}/{message}/{action}` | `{prefix}`, `{circuit}`, `{message}`, `{action}` (`set` / `get`) |

Entity ids are lower-cased like Home Assistant does. A renamed message prefix (e.g. a custom CSV) can be set per
program with [`message_prefix`](options.md#programs).

## Status and troubleshooting

The dot in the card's header shows the state of the current program:

| Dot | Meaning | What to do |
|---|---|---|
| :green_circle: green | Connected, all values received | – |
| :white_circle: grey, pulsing | Waiting for values: some slots haven't been read yet | Wait a few minutes after an ebusd restart |
| :red_circle: red | ebusd not available: all sensors of the program are `unavailable` | Check that ebusd runs and is connected to MQTT |
| :orange_circle: orange | No ebusd entities found | The card lists the entity it looked for. Check `mqtt_prefix`, `circuit` and `entity_template`, or remove programs your system doesn't have (e.g. `z2`) |

!!! tip "Find your entity names"

    In Home Assistant open **Developer tools :material-arrow-right: States** and filter for `timer_monday0`.
    The part before `z1timer` is your `{prefix}_{circuit}`.
