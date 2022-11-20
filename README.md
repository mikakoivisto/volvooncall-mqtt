## Volvo on call Home Assistant addon via MQTT

Provides functionality to start and schedule charging which is missing from the official Volvo on call integration. 

This uses undocumented API used by the Volvo mobile app. voc.js borrowed from https://github.com/ricott/homey-com.volvocars

## Building and testing locally

Create haconfig directory for homeassistant config directory

Build and run:

```bash
docker-compose up -d --build
```

## Running with Home Assistant

Simples way is to run it using docker-compose.yml. The latest versio is available direct from Docker Hub so no need to even build it locally.

```yml
version: "3.4"
services:
  mqtt:
    image: eclipse-mosquitto
    volumes:
      - ./mosquitto/config.conf:/mosquitto/config/mosquitto.conf
  volvooncall-mqtt:
    image: mikakoivisto/volvooncall-mqtt:latest
    links:
      - mqtt
    env_file: 
      - docker.env
```

## Configuration

Add following to docker.env file

```
MQTTHOST=mqtt
MQTTPORT=
MQTTUSER=
MQTTPASS=
VOCUSERNAME=
VOCPASSWORD=
VOCREGION=eu
DEBUG=app:info,app:error
```

Add app:debug to DEBUG in order to get more verbose output.

### MQTT Topics

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

Car features: ```volvooncall/<car id>/attributes```

Car status information: ```volvooncall/<car id>/status```

Car charge location information: ```volvooncall/<car id>/charge_locations/<location id>```

Car position: ```volvooncall/<car id>/position```