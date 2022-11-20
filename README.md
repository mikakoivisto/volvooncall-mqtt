## Volvo on call Home Assistant addon via MQTT

Provides functionality to start and schedule charging which is missing from the official Volvo on call integration. 

This uses undocumented API used by the Volvo mobile app. voc.js borrowed from https://github.com/ricott/homey-com.volvocars

# Building and testing locally

Create haconfig directory for homeassistant config directory

Build and run:

```bash
docker-compose up -d --build
```

# Configuration

Add following to docker.env file

```
MQTTHOST=mqtt
MQTTPORT=
MQTTUSER=
MQTTPASS=
VOCUSERNAME=
VOCPASSWORD=
VOCREGION=eu
```

Charging is triggered via MQTT topic

1. Start charging

Topic: ```volvooncall/<car id>/startCharging```
Payload: None

2. Delay charging

Topic: ```volvoonvall/<car id>/delayCharging```
Payload:
```json
{ "chargingLocation": "<location id>", "startTime": "00:00", "endTime": "06:00" }
```

Car id and location id are found on the app log.

Car information is also periodically published under topics

```volvooncall/<car id>/attributes```
```volvooncall/<car id>/status```
```volvooncall/<car id>/charge_locations/<location id>```
```volvooncall/<car id>/position```