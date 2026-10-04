# Daikin Airbase for Gladys

Controls Daikin ducted air conditioning fitted with an Airbase (BRP15B61) Wi-Fi
adapter, directly on your local network — no Daikin account or cloud.

## Features

- **Power**, **Mode** (auto, cool, heat, dry, fan), **Target temperature** and
  **Fan speed** (auto, low, mid, high).
- **Indoor temperature**, and **Outdoor temperature** when the unit reports it.
- **One switch per zone**, named as in the Daikin Airbase app.

## Configuration

1. In your router, give the adapter a fixed IP (DHCP reservation).
2. Enter that IP in the Configuration tab (several adapters: separate with commas).
3. Open the Discovery tab and create the device.

## Troubleshooting

- *No Airbase adapter answered* — check the IP, and that
  `http://<ip>/skyfi/common/basic_info` opens in a browser on the same network.
- Changes from the wall controller appear after the refresh interval (30 s by default).
- Logs: `docker logs` on the integration container.
