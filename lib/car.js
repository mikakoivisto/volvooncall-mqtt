const { v4: uuidv4 } = require('uuid');
const VOC = require('./voc.js');
const EventEmitter = require('events');
const debug = require('debug')('car:debug');
const error = require('debug')('car:error');

class VocCar extends EventEmitter {
  vehicleId;
  vehicleName;
  chargeLocations = {};
  attributes = {};
  status = {};
  distances = [];
  position = {};
  voc;
  debug = false;

  constructor(vehicle, voc) {
    super();

    this.vehicleId = vehicle.data.id;
    this.vehicleName = vehicle.name;
    this.voc = voc;
    this.registerListeners();
    this.getVehicleAttributes();
  }

  registerListeners() {
    let self = this;
    self.on('attributes_updated', car => {
      if (self.isChargingSupported()) {
        self.getVehicleChargeLocations();
      }
      if (self.isPositionSupported()) {
        self.getVehiclePosition();
      }
    });
    self.on('position_updated', car => {
      self.updateDistances();
    });
    self.on('charge_locations_updated', car => {
      self.updateDistances();
    });
  }

  isChargingSupported() {
    return this.attributes["highVoltageBatterySupported"] || false
  }

  isPositionSupported() {
    return this.attributes["carLocatorSupported"] || false
  }

  getVehicleAttributes() {
    let self = this;
    self.voc.getVehicleAttributes(self.vehicleId)
      .then(data => {
        debug("Vehicle attributes:\n" + JSON.stringify(data));
        self.attributes = data;
        self.emit('attributes_updated', self);
      }).catch(err => {
        error(`Vehicle ${self.vehicleId} update attributes failed: ${err}`);
      });
  }

  getVehicleChargeLocations() {
    let self = this;
    if (!self.isChargingSupported()) {
      debug("Charging not supported. Not updating charge locations");
      return;
    }
    debug(`Getting charge locations for ${self.vehicleId}`);
    self.voc.getVehicleChargeLocations(self.vehicleId)
      .then(locations => {
        self.updateChargeLocations(locations);
        self.emit('charge_locations_updated', self);
      }).catch(err => {
        error(`Vehicle ${self.vehicleId} charge locations update failed: ${err}`);
      });
  }

  updateChargeLocations(locations) {
    let chargeLocations = {};
    if (locations != null && locations.length > 0) {
      locations.forEach(location => {
          let locationName = '';
          if (!location.name) {
              //No name for location
              locationName = `${location.position.streetAddress}, ${location.position.postalCode} ${location.position.city}`
          } else {
              locationName = `${location.name}, ${location.position.streetAddress}`
          }
          let locationId = location.chargeLocation.substring(location.chargeLocation.lastIndexOf('/') + 1);
          chargeLocations[locationId] = {
              id: locationId,
              name: locationName,
              location: location
          };
      });
    }
    debug("Updating charge locations: " + JSON.stringify(chargeLocations));
    this.chargeLocations = chargeLocations;
  }

  delayCharging(id, startTime, stopTime) {
    let self = this;
    let payload = {
      status: "Accepted",
      delayChaging: {
        enabled: "true",
        startTime: startTime,
        stopTime: stopTime
      }
    }
    debug("Delaying charging: " + JSON.stringify(payload))
    self.voc.delayCharging(self.vehicleId, id, payload)
      .then(res => {
        debug("Delay charging complete");
        debug("Delay charging result: " + res);
        self.emit('delay_charging_complete', self, res);
        self.refreshVehicleStatusFromCar();
      }).catch(err => {
        error(`Vehicle ${self.vehicleId} delay charging failed: ${err}`);
      });
  }

  refreshVehicleStatusFromCar() {
    let self = this;
    self.voc.refreshVehicleStatusFromCar(self.vehicleId)
      .then(success => {
        debug("Vehicle status from car: " + success);
        if (success){
          self.getVehicleStatusFromCloud();
        }
      }).catch(err => {
        error(`Vehicle ${self.vehicleId} status from car failed: ${err}`);
      });
  }

  getVehicleStatusFromCloud() {
    let self = this;
    self.voc.getVehicleStatusFromCloud(self.vehicleId)
      .then(data => {
        debug("Vehicle status from cloud:\n" + JSON.stringify(data))
        self.status = data;
        self.emit('status_updated', self);
      }).catch(err => {
        error(`Vehicle ${self.vehicleId} status from cloud failed: ${err}`);
      });
  }

  getVehiclePosition() {
    let self = this;
    self.voc.getVehiclePosition(self.vehicleId)
      .then(position => {
        debug("Vehicle position:\n" + JSON.stringify(position))
        self.position = position;
        self.emit('position_updated', self);
      }).catch(err => {
        error(`Vehicle ${self.vehicleId} positions failed: ${err}`)
      });
  }

  startCharging() {
    let self = this;
    self.voc.startCharging(self.vehicleId)
      .then(res => {
        debug("Start charging result: " + JSON.stringify(res));
        self.emit('start_charging_complete', self, res);
        self.refreshVehicleStatusFromCar();
      }).catch(err => {
        error(`Start charging failed for ${self.vehicleId}: ${err}`);
      });
  }

  updateDistances() {
    let self = this;
    let distances = [];
    if (!self.position.latitude || !self.position.longitude) {
      return;
    }
    Object.keys(self.chargeLocations).forEach(locId => {
      let loc = self.chargeLocations[locId];
      debug("Calculate distance from " + loc.name)
      let lat1 = self.position.latitude;
      let lon1 = self.position.longitude;
      let lat2= loc.location.position.latitude;
      let lon2 = loc.location.position.longitude;
      let dist = {
        chargeLocationId: loc.id,
        chargeLocationName: loc.name,
        distanceToChargeLocation: self.calculateDistance(lat1, lon1, lat2, lon2, 'K'),
        currentPosition: {
          latitude: lat1,
          longitude: lon1
        }
      };
      distances.push(dist);
    });
    self.distances = distances;
    debug("Distances updated: \n" + JSON.stringify(self.distances));
    self.emit('distances_updated', self);
  }

  calculateDistance = function (lat1, lon1, lat2, lon2, unit) {
    // based on https://www.geodatasource.com/developers/javascript
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0
    unit = (unit || 'M').toUpperCase()
    var radlat1 = Math.PI * lat1 / 180
    var radlat2 = Math.PI * lat2 / 180
    var theta = lon1 - lon2
    var radtheta = Math.PI * theta / 180
    var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta)
    dist = Math.acos(dist)
    dist = dist * 180 / Math.PI
    dist = dist * 60 * 1.1515 // result in Miles per default
    if (unit === 'K') { dist = dist * 1.609344 }
    if (unit === 'M') { dist = dist * 1.609344 * 1000 }
    if (unit === 'N') { dist = dist * 0.8684 }
    return dist
  }
}

exports = module.exports = VocCar;