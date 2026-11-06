# Examples

## Standard

Zone 1, hot water and circulation, edit mode, the card's own design:

```yaml
type: custom:ebusd-time-program-card
```

## Overview dashboard

A compact read-only chart of all programs, temperatures always inside the bars:

```yaml
type: custom:ebusd-time-program-card
title: Heating
mode: preview
stacked: true
temp_labels: always
```

## Home Assistant theme

Follow the dashboard theme, German texts, today selected when the card opens:

```yaml
type: custom:ebusd-time-program-card
theme: default
language: de
default_days: today
```

## Two zones with own names

```yaml
type: custom:ebusd-time-program-card
programs:
  - id: z1
    name: Ground floor
  - id: z2
    name: First floor
  - hwc
```

## Only hot water, on a phone

```yaml
type: custom:ebusd-time-program-card
title: Hot water
programs: [hwc]
layout: narrow
show_preview: false
```

## ebusd with another topic prefix

ebusd started with `--mqtttopic=heating`, entities like `sensor.heating_ctlv2_z1timer_monday0_htm`:

```yaml
type: custom:ebusd-time-program-card
mqtt_prefix: heating
```

## Own accent colour

```yaml
type: custom:ebusd-time-program-card
accent: "#e07a1f"
```
