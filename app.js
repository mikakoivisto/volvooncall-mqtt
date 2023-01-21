const { v4: uuidv4 } = require('uuid');
const VOC = require('./lib/voc.js');
const VocCar = require('./lib/car.js');
const EventEmitter = require('events');
const mqttApi = require('mqtt');
const { isGeneratorObject } = require('util/types');
const { info } = require('console');
const logDebug = require('debug')('app:debug');
const logError = require('debug')('app:error');
const logInfo = require('debug')('app:info');

logInfo.log = console.log.bind(console);

const config = {
  mqttHost: process.env.MQTTHOST || 'localhost',
  mqttPort: process.env.MQTTPORT || '1883',
  mqttUser: process.env.MQTTUSER,
  mqttPass: process.env.MQTTPASS,
  hassTopic: process.env.HASSTOPIC || 'homeassistant/status',
  vocUser: process.env.VOCUSERNAME,
  vocPassword: process.env.VOCPASSWORD,
  vocRegion: process.env.VOCREGION || 'eu',
  refreshStatusCar: process.env.REFRESH_STATUS_CAR || 120,
  refreshStatusCloud: process.env.REFRESH_STATUS_CLOUD || 5,
  refreshPosition: process.env.REFRESH_POSITION || 5,
  refreshChargeLocation: process.env.REFRESH_CHARGE_LOCATION || 5,
  hassMqttDiscoveryEnabled: process.env.HASS_MQTT_DISCOVERY === 'false' ? false : true
}

logDebug(JSON.stringify(config));

class App extends EventEmitter {
  voc;
  mqtt;
  cars = [];
  haDiscovered = {};
  config;
  constructor(config) {
    super();

    this.config = config;
    this.voc = new VOC({
      username: config.vocUser,
      password: config.vocPassword,
      region: config.vocRegion,
      uuid: uuidv4().toUpperCase() 
    });

    this.voc.login().then(res => {
      logDebug(`Logged in to account ${res.accountId} as ${res.firstName} ${res.lastName}`)
    }).catch(e => logError(e));

    this.mqtt = mqttApi.connect({
      host: config.mqttHost,
      port: config.mqttPort,
      username: config.mqttUser,
      password: config.mqttPass
    });

    this.registerEventListeners(this);
    if (this.mqtt.connected) {
      this.mqttConnected();
    }
    this.startPollers();
  }

  startPollers() {
    let self = this;
    // Update status from car
    setInterval(() => {
      Object.keys(self.cars).forEach(id => self.cars[id].refreshVehicleStatusFromCar())
    }, 60 * 1000 * self.config.refreshStatusCar);

    // Update status from cloud
    setInterval(() => {
      Object.keys(self.cars).forEach(id => self.cars[id].getVehicleStatusFromCloud())
    }, 60 * 1000 * self.config.refreshStatusCloud);

    // Update charge locations
    setInterval(() => {
      Object.keys(self.cars).forEach(id => self.cars[id].getVehicleChargeLocations())
    }, 60 * 1000 * self.config.refreshChargeLocation);

    // Update position
    setInterval(() => {
      Object.keys(self.cars).forEach(id => {
        let car = self.cars[id];
        if (car.isPositionSupported()) {
          car.getVehiclePosition();
        }
      })
    }, 60 * 1000 * self.config.refreshPosition)
  }

  mqttConnected() {
    logInfo('MQTT connection established');
    this.mqtt.subscribe(config.hassTopic);
    this.listVehiclesOnAccount();
  }

  listVehiclesOnAccount() {
    let self = this;
    self.voc.listVehiclesOnAccount()
      .then(vehicles => {
        self.updateVehicles(vehicles);
      }).catch(err => logError(`Failed to get vehicles:  ${err}`))
  }

  updateVehicles(vehicles) {
    let self = this;
    let cars = {};
    vehicles.forEach(vehicle => {
      const id = vehicle.data.id;
      logDebug('Found vehicle ' + id + '\n' + JSON.stringify(vehicle));
      let car = new VocCar(vehicle, self.voc);
      cars[id] = car;
    });
    let removedCarIds = Object.keys(self.cars).filter(x => !Object.keys(cars).includes(x));
    let removedCars = []
    removedCarIds.forEach(id => removedCars.push(self.cars[id]));
    self.cars = cars;
    this.emit('vehicles_updated', removedCars);
  }

  registerEventListeners() { 
    let self = this;   
    self.mqtt.on('connect', () => {
      self.mqttConnected();
    });

    self.mqtt.on('reconnect', () => { 
      logInfo('Attempting to reconnect to MQTT broker');
    });

    self.mqtt.on('error', (error) => {
      logError('Unable to connect to MQTT broker.', error.message);
    });

    self.mqtt.on('message', (topic, message) => {
      logDebug('Message received on ' + topic);
      self.handleMessage(topic, message.toString());
    });

    self.on('vehicles_updated', (removedCars) => {
      removedCars.forEach(car => car.removeEventListeners());
      self.unsubscribeForActions(removedCars);
      self.subscribeForActions();
      self.listenForChanges();
    })
  }

  unsubscribeForActions(cars) {
    let self = this;
    cars.forEach(car => {
      self.mqtt.unsubscribe(`volvooncall/${car.vehicleId}/startCharging`);
      self.mqtt.unsubscribe(`volvooncall/${car.vehicleId}/delayCharging`);
      self.mqtt.unsubscribe(`volvooncall/${car.vehicleId}/lock`);
      self.mqtt.unsubscribe(`volvooncall/${car.vehicleId}/heater`);
    });
  }

  subscribeForActions() {
    let self = this;
    Object.keys(self.cars).forEach(id => {
      self.mqtt.subscribe(`volvooncall/${id}/startCharging`);
      self.mqtt.subscribe(`volvooncall/${id}/delayCharging`);
      self.mqtt.subscribe(`volvooncall/${id}/lock`);
      self.mqtt.subscribe(`volvooncall/${id}/heater`);
    });
  }

  listenForChanges() {
    let self = this;
    Object.keys(self.cars).forEach(id => {
      let car = self.cars[id];

      car.on('attributes_updated', vehicle => {
        self.publishAttributes(vehicle);
        self.hassMqttDiscovery(vehicle);
      });
      car.on('status_updated', vehicle => {
        self.publishStatus(vehicle);
        self.hassMqttDiscovery(vehicle);
      });
      car.on('charge_locations_updated', vehicle => {
        self.publishChargeLocations(vehicle);
        self.hassMqttDiscovery(vehicle);
      });
      car.on('position_updated', vehicle => {
        self.publishPosition(vehicle);
      });
      self.publishAttributes(car);
      self.publishStatus(car);
      self.publishChargeLocations(car);
      self.publishPosition(car);
    });
  }

  publishAttributes(car) {
    let self = this;
    logInfo(`publish ${car.vehicleId} attributes`)
    self.mqtt.publish(`volvooncall/${car.vehicleId}/attributes`, JSON.stringify(car.attributes), { retain: true});
  }

  publishStatus(car) {
    let self = this;
    logInfo(`publish ${car.vehicleId} status`)
    self.mqtt.publish(`volvooncall/${car.vehicleId}/status`, JSON.stringify(car.status), { retain: true});
  }

  publishChargeLocations(car) {
    let self = this;
    logInfo(`publish ${car.vehicleId} charge locations`)
    Object.keys(car.chargeLocations).forEach(id => {
      logInfo(`publish ${car.vehicleId} charge location ${id}`)
      self.mqtt.publish(`volvooncall/${car.vehicleId}/charge_locations/${id}`, JSON.stringify(car.chargeLocations[id]), { retain: true});
    })
  }

  publishPosition(car) {
    let self = this;
    logInfo(`publish ${car.vehicleId} position`)
    self.mqtt.publish(`volvooncall/${car.vehicleId}/position`, JSON.stringify(car.position), { retain: true});
  }

  republishVehicles() {
    let self = this;
    Object.keys(self.cars).forEach(id => {
      let car = self.cars[id];
      self.publishAttributes(car);
      self.publishStatus(car);
      self.publishChargeLocations(car);
      self.publishPosition(car);
    })
  }

  handleMessage(topic, payload) {
    let self = this;
    if (topic === self.config.hassTopic) {
      logInfo("HA reloaded");
      self.haDiscovered = {};
      self.republishVehicles();
      return;
    }
    let [ignore, carId, command] = topic.split("/");
    switch(command) {
      case 'startCharging': 
        self.startCharging(carId, payload);
        break;
      case 'delayCharging':
        self.delayCharging(carId, payload);
        break;
      case 'lock':
        self.setLockState(carId, payload);
        break;
      case 'heater':
        self.setHeaterState(carId, payload);
        break;        
      default:
        logError(`Unrecognized command ${command}`)
    } 
  }

  startCharging(id, payload) {
    let self = this;
    logInfo(`Start charging ${id} ${payload}`)
    self.cars[id].startCharging();
  }

  delayCharging(id, payload) {
    let self = this;
    logInfo(`Delay charging ${id} ${payload}`)
    let params = JSON.parse(payload)
    self.cars[id].delayCharging(params['chargeLocation'], params['delayedCharging'] || true, params['startTime'], params['stopTime'])
  }

  setLockState(id, payload) {
    let self = this;
    logInfo(`Set lock state ${id} '${payload}'`);
    switch(payload) {
      case 'UNLOCK':
        self.cars[id].unlock();
        break;
      case 'LOCK':
        self.cars[id].lock();
        break
      default:
        logError(`Unrecognized lock state '${payload}'`);
    }
  }

  setHeaterState(id, payload) {
    let self = this;
    logInfo(`Set heater state ${id} '${payload}'`);
    switch(payload) {
      case 'ON':
        if (self.cars[id].isRemoteHeaterSupported()) {
          self.cars[id].startHeater();
        } else if (self.cars[id].isPreClimatizationSupported()) {
          self.cars[id].startPreclimatization();
        }
        break;
      case 'OFF':
        if (self.cars[id].isRemoteHeaterSupported()) {
          self.cars[id].stopHeater();
        } else if (self.cars[id].isPreClimatizationSupported()) {
          self.cars[id].stopPreclimatization();
        }
        break
      default:
        logError(`Unrecognized heater state '${payload}'`);
    }
  }

  hassMqttDiscovery(car) {
    let self = this;
    if (!self.config.hassMqttDiscoveryEnabled) {
      return;
    }
    if (self.haDiscovered[car.vehicleId]) {
      logDebug(`Vehicle ${car.vehicleId} already discovered`);
      return;
    }
    if (!car.isReady()) {
      return;
    }
    self.haDiscovered[car.vehicleId] = true;
    logInfo("Starting mqtt discovery for " + car.vehicleId);
    self.lockDiscovery(car, {name: "Door lock"});
    self.statusSensorDiscovery(car, "fuelAmount", "fuel_amount", {name: "Fuel amount", icon: "mdi:gas-station", unit: "L"});
    self.statusSensorDiscovery(car, "fuelAmountLevel", "fuel_amount_level", {name: "Fuel level", icon: "mdi:water-percent", unit: "%"});
    self.statusSensorDiscovery(car, "averageFuelConsumption", "average_fuel_consumption", {name: "Fuel consumption", icon: "mdi:gas-station", unit: "L/100 km"}, " / 10 | float | round(1)")
    self.statusSensorDiscovery(car, "odometer", "odometer", {name: "Odometer", icon: "mdi:speedometer", unit: "km", deviceClass: "distance"}, " / 1000 | float | round(1)")
    self.statusSensorDiscovery(car, "tripMeter1", "trip_meter_1", {name: "Trip meter 1", icon: "mdi:speedometer", unit: "km", deviceClass: "distance"}, " / 1000 | float | round(1)")
    self.statusSensorDiscovery(car, "tripMeter2", "trip_meter_2", {name: "Trip meter 2", icon: "mdi:speedometer", unit: "km", deviceClass: "distance"}, " / 1000 | float | round(1)")
    self.statusSensorDiscovery(car, "distanceToEmpty", "range", {name: "Range", icon: "mdi:ruler", unit: "km"})
    self.statusSensorDiscovery(car, "averageSpeed", "average_speed", {name: "Average speed", icon: "mdi:ruler", unit: "km/h", deviceClass: "speed"})
    self.statusSensorDiscovery(car, "hvBattery.distanceToHVBatteryEmpty", "battery_range", {name: "Battery range", icon: "mdi:ruler", unit: "km"})
    self.statusSensorDiscovery(car, "hvBattery.hvBatteryLevel", "battery_level", {name: "Battery level", icon: "mdi:battery", unit: "%", deviceClass: "battery"})
    self.statusSensorDiscovery(car, "hvBattery.timeToHVBatteryFullyCharged", "time_to_fully_charged", {name: "Time to fully charged", icon: "mdi:clock", unit: "minutes"})
    self.statusBinarySensorDiscovery(car, "hvBattery.hvBatteryChargeStatusDerived", "battery_charging", {name: "Battery charging", deviceClass: "battery_charging"}, ".endswith('_Charging')")
    self.statusBinarySensorDiscovery(car, "hvBattery.hvBatteryChargeStatusDerived", "plug_status", {name: "Plug status", deviceClass: "plug"}, ".startswith('CablePluggedInCar_')")
    self.statusBinarySensorDiscovery(car, "engineRunning", "engine", {name: "Engine", icon: "mdi:engine", deviceClass: "power"}, " == 'true'")
    self.statusBinarySensorDiscovery(car, "carLocked", "door_lock", {name: "Door Lock", deviceClass: "lock"}, " == 'true'")
    self.statusBinarySensorDiscovery(car, "doors.hoodOpen", "hood", {name: "Hood", deviceClass: "door"}, " == 'true'")
    self.statusBinarySensorDiscovery(car, "doors.tailgateOpen", "tailgate", {name: "Tailgate", deviceClass: "door"}, " == 'true'")
    self.statusBinarySensorDiscovery(car, "doors.frontLeftDoorOpen", "front_left_door", {name: "Front left door", deviceClass: "door"}, " == 'true'")
    self.statusBinarySensorDiscovery(car, "doors.frontRightDoorOpen", "front_right_door", {name: "Front right door", deviceClass: "door"}, " == 'true'")
    self.statusBinarySensorDiscovery(car, "doors.rearLeftDoorOpen", "rear_left_door", {name: "Rear left door", deviceClass: "door"}, " == 'true'")
    self.statusBinarySensorDiscovery(car, "doors.rearRightDoorOpen", "rear_right_door", {name: "Rear right door", deviceClass: "door"}, " == 'true'")
    self.statusBinarySensorDiscovery(car, "windows.frontLeftWindowOpen", "front_left_window", {name: "Front left window", deviceClass: "window"}, " == 'true'")
    self.statusBinarySensorDiscovery(car, "windows.frontRightWindowOpen", "front_right_window", {name: "Front right window", deviceClass: "window"}, " == 'true'")
    self.statusBinarySensorDiscovery(car, "windows.rearLeftWindowOpen", "rear_left_window", {name: "Rear left window", deviceClass: "window"}, " == 'true'")
    self.statusBinarySensorDiscovery(car, "windows.rearRightWindowOpen", "rear_right_window", {name: "Rear right window", deviceClass: "window"}, " == 'true'")
    self.statusBinarySensorDiscovery(car, "tyrePressure.frontLeftTyrePressure", "front_left_tyre", {name: "Front left tyre", icon: "mdi:tire", deviceClass: "safety"}, " != 'Normal'")
    self.statusBinarySensorDiscovery(car, "tyrePressure.frontRightTyrePressure", "front_right_tyre", {name: "Front right tyre", icon: "mdi:tire", deviceClass: "safety"}, " != 'Normal'")
    self.statusBinarySensorDiscovery(car, "tyrePressure.rearLeftTyrePressure", "rear_left_tyre", {name: "Rear left tyre", icon: "mdi:tire", deviceClass: "safety"}, " != 'Normal'")
    self.statusBinarySensorDiscovery(car, "tyrePressure.rearRightTyrePressure", "rear_right_tyre", {name: "Rear right tyre", icon: "mdi:tire", deviceClass: "safety"}, " != 'Normal'")
    self.statusBinarySensorDiscovery(car, "washerFluidLevel", "washer_fluid", {name: "Washer fluid", icon: "mdi:water", deviceClass: "safety"}, " != 'Normal'")
    self.statusBinarySensorDiscovery(car, "brakeFluid", "brake_fluid", {name: "Brake fluid", icon: "mdi:car-brake-fluid-level", deviceClass: "safety"}, " != 'Normal'")
    self.statusBinarySensorDiscovery(car, "serviceWarningStatus", "service_warning", {name: "Service warning", icon: "mdi:alert-circle", deviceClass: "safety"}, " != 'Normal'")
  
    Object.keys(car.chargeLocations).forEach(id => {      
      self.vehicleAtChargeLocationBinarySensor(car, id);
    })

    self.buttonDiscovery(car, "start charging", "mdi:ev-station", "startCharging", "")
    self.chargeStatusDiscovery(car);
    self.heaterDiscovery(car);
    //self.deviceTrackerDiscovery(car);
  }

  vehicleAtChargeLocationBinarySensor(car, locationId) {
    let self = this;
    let vehicleId = car.vehicleId;
    let stateTopic = `volvooncall/${vehicleId}/charge_locations/${locationId}`;
    let objectId = `volvooncall_${vehicleId}_charge_location_${locationId}_vehicle_at_location`;
    let uniqueId = `${objectId}`;
    let valueTemplate = `{% if value_json.location['vehicleAtChargingLocation'] is defined and value_json.location['vehicleAtChargingLocation'] == true %}ON{% else %}OFF{% endif %}`
    let namePrefix = `Volvo ${car.attributes.registrationNumber}`
    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": `${namePrefix} at charge location ${car.chargeLocations[locationId].location.name}`,
      "icon": "mdi:map-marker",
      "state_topic": stateTopic,
      "value_template": valueTemplate,
      "device": self.getDeviceDiscovery(car)
    };
    logDebug(`Discover sensor ${objectId}: ${JSON.stringify(config)}`)
    self.mqtt.publish("homeassistant/binary_sensor/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  chargeStatusDiscovery(car) {
    let self = this;
    let vehicleId = car.vehicleId;
    let stateTopic = `volvooncall/${vehicleId}/status`;
    let objectId = `volvooncall_${vehicleId}_battery_charge_status`;
    let uniqueId = `${objectId}_sensor`;
    let attribute = "hvBattery.hvBatteryChargeStatusDerived";
    let valueTemplate = `{% if value_json.${attribute} is defined and value_json.${attribute}.endswith('_Charging') %}Charging{% elif value_json.${attribute} is defined and value_json.${attribute}.endswith('_FullyCharged') %}Fully charged{% elif value_json.${attribute} is defined and value_json.${attribute}.endswith('_ChargingPaused') %}Paused{% elif value_json.${attribute} is defined and value_json.${attribute}.endswith('CableNotPluggedInCar') %}Not plugged in{% else %}unknown{% endif %}`
    let namePrefix = `Volvo ${car.attributes.registrationNumber}`
    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": `${namePrefix} charging status`,
      "icon": "mdi:ev-station",
      "state_topic": stateTopic,
      "value_template": valueTemplate,
      "device": self.getDeviceDiscovery(car)
    };
    logDebug(`Discover sensor ${objectId}: ${JSON.stringify(config)}`)
    self.mqtt.publish("homeassistant/sensor/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  buttonDiscovery(car, name, icon, command, payload) {
    let self = this;
    let vehicleId = car.vehicleId;
    let objectId = `volvooncall_${vehicleId}_button_${command}`;
    let uniqueId = `${objectId}`;
    let commandTopic = `volvooncall/${vehicleId}/${command}`;
    let namePrefix = `Volvo ${car.attributes.registrationNumber}`
    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": `${namePrefix} ${name}`,
      "icon": icon,
      "command_topic": commandTopic,
      "payload_press": payload,
      "device": self.getDeviceDiscovery(car)
    };
    logDebug(`Discover sensor ${objectId}: ${JSON.stringify(config)}`)
    self.mqtt.publish("homeassistant/button/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  statusSensorDiscovery(car, attribute, attributeName, info, valueMutator = '') {
    let self = this;
    let vehicleId = car.vehicleId;
    let stateTopic = `volvooncall/${vehicleId}/status`;
    let objectId = `volvooncall_${vehicleId}_${attributeName}`;
    let uniqueId = `${objectId}_sensor`;
    let valueTemplate = `{% if value_json.${attribute} is defined %}{{ value_json.${attribute}${valueMutator} }}{% else %}unknown{% endif %}`
    let namePrefix = `Volvo ${car.attributes.registrationNumber}`
    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": `${namePrefix} ${info.name}`,
      "icon": info.icon,
      "unit_of_measurement": info.unit,
      "device_class": info.deviceClass,
      "state_topic": stateTopic,
      "value_template": valueTemplate,
      "device": self.getDeviceDiscovery(car)
    };
    logDebug(`Discover sensor ${objectId}: ${JSON.stringify(config)}`)
    self.mqtt.publish("homeassistant/sensor/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  statusBinarySensorDiscovery(car, attribute, attributeName, info, oncondition = '') {
    let self = this;
    let vehicleId = car.vehicleId;
    let stateTopic = `volvooncall/${vehicleId}/status`;
    let objectId = `volvooncall_${vehicleId}_${attributeName}`;
    let uniqueId = `${objectId}_binarysensor`;
    let valueTemplate = `{% if value_json.${attribute} is defined and value_json.${attribute}${oncondition} %}ON{% else %}OFF{% endif %}`
    let namePrefix = `Volvo ${car.attributes.registrationNumber}`
    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": `${namePrefix} ${info.name}`,
      "icon": info.icon,
      "device_class": info.deviceClass,
      "state_topic": stateTopic,
      "value_template": valueTemplate,
      "device": self.getDeviceDiscovery(car)
    };
    logDebug(`Discover sensor ${objectId}: ${JSON.stringify(config)}`)
    self.mqtt.publish("homeassistant/binary_sensor/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  lockDiscovery(car, info) {
    let self = this;
    let vehicleId = car.vehicleId;
    let commandTopic = `volvooncall/${vehicleId}/lock`;
    let stateTopic = `volvooncall/${vehicleId}/status`;
    let objectId = `volvooncall_${vehicleId}_door_lock`;
    let uniqueId = `${objectId}_lock`;
    let valueTemplate = `{% if value_json['carLocked'] is defined and value_json['carLocked']  == true %}LOCKED{% else %}UNLOCKED{% endif %}`
    let namePrefix = `Volvo ${car.attributes.registrationNumber}`
    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": `${namePrefix} ${info.name}`,
      "icon": info.icon,
      "device_class": info.deviceClass,
      "state_topic": stateTopic,
      "value_template": valueTemplate,
      "command_topic": commandTopic,
      "payload_lock": "LOCK",
      "payload_unlock": "UNLOCK",
      "device": self.getDeviceDiscovery(car)
    };
    logDebug(`Discover lock ${objectId}: ${JSON.stringify(config)}`)
    self.mqtt.publish("homeassistant/lock/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  heaterDiscovery(car) {
    let self = this;
    let vehicleId = car.vehicleId;
    let commandTopic = `volvooncall/${vehicleId}/heater`;
    let stateTopic = `volvooncall/${vehicleId}/status`;
    let objectId = `volvooncall_${vehicleId}_heater`;
    let uniqueId = `${objectId}_switch`;
    let valueTemplate = `{% if value_json.heater.status is defined and value_json.heater.status.startswith('on') %}on{% elif value_json.heater.status is defined and value_json.heater.status == 'off'  %}off{% else %}unknown{% endif %}`
    let namePrefix = `Volvo ${car.attributes.registrationNumber}`
    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": `${namePrefix} heater`,
      "icon": "mdi:radiator",
      "state_topic": stateTopic,
      "value_template": valueTemplate,
      "command_topic": commandTopic,
      "state_off": "off",
      "state_on": "on",
      "device": self.getDeviceDiscovery(car)
    };
    logDebug(`Discover lock ${objectId}: ${JSON.stringify(config)}`)
    self.mqtt.publish("homeassistant/switch/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  deviceTrackerDiscovery(car) {
    let self = this;
    let vehicleId = car.vehicleId;
    let stateTopic = `volvooncall/${vehicleId}/position`;
    let objectId = `volvooncall_${vehicleId}_position`;
    let uniqueId = `${objectId}_device_tracker`;
    let namePrefix = `Volvo ${car.attributes.registrationNumber}`
    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": `${namePrefix} position`,
      "icon": "mdi:map-marker",
      "state_topic": stateTopic,
      "value_template": "{{ value_json.heading }}",
      "source_type": "gps",
      "json_attributes_topic": stateTopic,
      "device": self.getDeviceDiscovery(car)
    };
    logDebug(`Discover lock ${objectId}: ${JSON.stringify(config)}`)
    self.mqtt.publish("homeassistant/device_tracker/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  getDeviceDiscovery(car) {
    let vehicleId = car.vehicleId;
    let device = {
      "manufacturer": "Volvo",
      "model": `${car.attributes.vehicleType}/${car.attributes.modelYear}`,
      "identifiers": [vehicleId],
      "name": `Volvo ${car.attributes.registrationNumber}`
    };
    return device;
  }
}
const app = new App(config);