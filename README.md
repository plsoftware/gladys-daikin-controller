# gladys-daikin-controller

Daikin ducted air conditioning on an **Airbase (BRP15B61)** Wi-Fi adapter as a
[Gladys Assistant](https://gladysassistant.com) external integration.

Fully local: the adapter is read and driven over plain HTTP on the LAN, the same
API the Daikin Airbase app uses at home. No Daikin account, no cloud. (Airbase
units are not on Daikin Onecta, so the Onecta-based Daikin integration cannot
see them.)

## Features (per adapter)

| Feature | Type | Behaviour |
|---|---|---|
| Power | air-conditioning binary | On / off |
| Mode | air-conditioning mode | Auto, cool, heat, dry, fan |
| Target temperature | air-conditioning target temperature, °C | Range read from the unit (typically 16–32) |
| Fan speed | air-conditioning fan speed | Auto, low, mid, high — only the speeds the unit reports |
| Indoor temperature | temperature sensor, °C | Return-air temperature |
| Outdoor temperature | temperature sensor, °C | Only when the unit reports one |
| `<zone> zone` | switch | One per ducted zone the unit has |

Changes made from the wall controller or the Daikin app show up on the next
poll (30 s by default). Every command is followed by a re-read, so Gladys shows
what the unit actually accepted.

## Install

In Gladys: **Integrations → Install from GitHub → Developer mode: install from a
Docker image**, image `ghcr.io/plsoftware/gladys-daikin-controller:<version>`, and
paste `gladys-assistant-integration.json` as the manifest. Enter the adapter IP
address in the Configuration tab and create the device from Discover.

Give the adapter a DHCP reservation so its address does not change.

## Protocol notes

- Endpoints under `/skyfi/`: `common/basic_info`, `aircon/get_control_info`,
  `get_model_info`, `get_sensor_info`, `get_zone_setting`, and the matching
  `set_control_info` / `set_zone_setting`. Value encoding follows
  [pydaikin](https://github.com/fredrike/pydaikin)'s `daikin_airbase.py`.
- **The adapter answers HTTP 403 to a lowercase `host:` header**, which is all
  Node's `fetch` (undici) sends, so the client uses `node:http`.
- It handles one request at a time; requests to each adapter are queued.
- Containers cannot see LAN broadcasts, so adapters are configured by IP rather
  than discovered.

## Test

```bash
npm test                          # value mapping, from captured payloads
node scripts/read.js <adapter-ip> # read-only check of a live adapter
```

## Release

Actions → **Release** → Run workflow → pick patch / minor / major. It bumps
`package.json` and the manifest, tags `vX.Y.Z`, and builds
`ghcr.io/plsoftware/gladys-daikin-controller:X.Y.Z` (+ `:latest`) for amd64 and arm64.

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
