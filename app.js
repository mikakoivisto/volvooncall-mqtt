const { v4: uuidv4 } = require('uuid');
const VOC = require('./lib/voc.js');
const VocCar = require('./lib/car.js');
const EventEmitter = require('events');
const mqttApi = require('mqtt');
const { isGeneratorObject } = require('util/types');
const logDebug = require('debug')('app:debug');
const logError = require('debug')('app:error');
const logInfo = require('debug')('app:info');

logInfo.log = console.log.bind(console);

const config = {
  mqttHost: process.env.MQTTHOST || 'localhost',
  mqttPort: process.env.MQTTPORT || '1883',
  mqttUser: process.env.MQTTUSER,
  mqttPass: process.env.MQTTPASS,
  hassTopic: 'homeassistant/status',
  vocUser: process.env.VOCUSERNAME,
  vocPassword: process.env.VOCPASSWORD,
  vocRegion: process.env.VOCREGION || 'eu',
  refreshStatusCar: process.env.REFRESH_STATUS_CAR || 120,
  refreshStatusCloud: process.env.REFRESH_STATUS_CLOUD || 5,
  refreshPosition: process.env.REFRESH_POSITION || 5
}

logDebug(JSON.stringify(config));

class App extends EventEmitter {
  voc;
  mqtt;
  cars = [];
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
      self.handleMessage(topic, message);
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
      self.mqtt.unsubscribe(`volvooncall/${car.vehicleId}/delayCharging`)
    });
  }

  subscribeForActions() {
    let self = this;
    Object.keys(self.cars).forEach(id => {
      self.mqtt.subscribe(`volvooncall/${id}/startCharging`);
      self.mqtt.subscribe(`volvooncall/${id}/delayCharging`)
    });
  }

  listenForChanges() {
    let self = this;
    Object.keys(self.cars).forEach(id => {
      let car = self.cars[id];

      car.on('attributes_updated', vehicle => {
        self.publishAttributes(vehicle);
      });
      car.on('status_updated', vehicle => {
        self.publishStatus(vehicle);
      });
      car.on('charge_locations_updated', vehicle => {
        self.publishChargeLocations(vehicle);
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
}
const app = new App(config);