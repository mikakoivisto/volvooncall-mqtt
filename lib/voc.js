'use strict';

var http = require('http.min');
const { v1: uuidv1 } = require('uuid');
var EventEmitter = require('events');
var util = require('util');

const apiProtocol = 'https:';
const apiDomains = {
    eu: 'vocapi.wirelesscar.net',
    na: 'vocapi-na.wirelesscar.net',
    cn: 'vocapi-cn.wirelesscar.net'
};
const apiEndpoint = '/customerapi/rest/v3.0/';
const apiTimeout = 10000;
const apiXClientVersion = '4.6.9.264685';
const apiUserAgent = 'Volvo%20On%20Call/4.6.9.264685 CFNetwork/1120 Darwin/19.0.0';
const apiXOSVersion = '13.3.1';
const apiErrorEventName = 'voc_api_error';
const refreshEventName = 'car_action_status';

function VOC(options) {
    var self = this;
    EventEmitter.call(self);
    if (options == null) { options = {} };
    //Options should contain
    //username, password, region, uuid
    self.options = options;
    //Used for service invocations to check for result of invocation
    self._serviceInvocationSuccess = false;
}
util.inherits(VOC, EventEmitter);

VOC.prototype.login = function () {
    var self = this;
    return login(self.options)
        .then(function (result) {
            if (result.errorLabel) {
                return Promise.reject('invalid_user_password');
            }
            return result;
        })
        .catch(reason => {
            return Promise.reject('invalid_user_password');
        });
}

VOC.prototype.getVehicleAttributes = function (vehicleId) {
    var self = this;
    return getVehicleAttributes(self.options, [vehicleId])
        .then(function (vehicles) {
            self.emit('car_attributes_update', vehicles[0]);
            return vehicles[0];
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.refreshVehicleStatusFromCar = function (vehicleId) {
    var self = this;
    return refreshVehicleStatusFromCar(self.options, vehicleId)
        .then(function (status) {
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit('car_refreshed_status', result);
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.startHeater = function (vehicleId) {
    var self = this;
    return startHeater(self.options, vehicleId)
        .then(function (status) {
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit(refreshEventName, { action: 'startHeater', result: result });
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.stopHeater = function (vehicleId) {
    var self = this;
    return stopHeater(self.options, vehicleId)
        .then(function (status) {
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit(refreshEventName, { action: 'stopHeater', result: result });
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.startPreClimatization = function (vehicleId) {
    var self = this;
    return startPreClimatization(self.options, vehicleId)
        .then(function (status) {
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit(refreshEventName, { action: 'startPreClimatization', result: result });
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.stopPreClimatization = function (vehicleId) {
    var self = this;
    return stopPreClimatization(self.options, vehicleId)
        .then(function (status) {
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit(refreshEventName, { action: 'stopPreClimatization', result: result });
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.lock = function (vehicleId) {
    var self = this;
    return lock(self.options, vehicleId)
        .then(function (status) {
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit(refreshEventName, { action: 'lock', result: result });
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.unlock = function (vehicleId) {
    var self = this;
    return unlock(self.options, vehicleId)
        .then(function (status) {
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit(refreshEventName, { action: 'unlock', result: result });
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.startEngine = function (vehicleId, duration) {
    var self = this;
    return startEngine(self.options, vehicleId, duration)
        .then(function (status) {
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit(refreshEventName, { action: 'startEngine', result: result });
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.stopEngine = function (vehicleId) {
    var self = this;
    return stopEngine(self.options, vehicleId)
        .then(function (status) {
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit(refreshEventName, { action: 'stopEngine', result: result });
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.blinkLights = function (vehicleId, latitude, longitude) {
    var self = this;
    return blinkLights(self.options, vehicleId, latitude, longitude)
        .then(function (status) {
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit(refreshEventName, { action: 'blinkLights', result: result });
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}
VOC.prototype.honkHorn = function (vehicleId, latitude, longitude) {
    var self = this;
    return honkHorn(self.options, vehicleId, latitude, longitude)
        .then(function (status) {
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit(refreshEventName, { action: 'honkHorn', result: result });
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}
VOC.prototype.honkHornAndBlinkLights = function (vehicleId, latitude, longitude) {
    var self = this;
    return honkHornAndBlinkLights(self.options, vehicleId, latitude, longitude)
        .then(function (status) {
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit(refreshEventName, { action: 'honkHornAndBlinkLights', result: result });
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.delayCharging = function (vehicleId, chargeLocationId, payload) {
    var self = this;
    return delayCharging(self.options, vehicleId, chargeLocationId, payload)
        .then(function (status) {
            //If data sent equals data in cloud, then no service id is sent
            //also customerServiceId is not included, have to fetch it from the url
            if (status.service) {
                return awaitSuccessfulServiceInvocation(self, vehicleId, status.service.substring(status.service.lastIndexOf('/') + 1))
                    .then(function (result) {
                        self.emit(refreshEventName, { action: 'delayCharging', result: result });
                        return result;
                    })
                    .catch(reason => {
                        self.emit(apiErrorEventName, reason);
                        return Promise.reject(reason);
                    });    
            } else {
                self.emit(refreshEventName, { action: 'delayCharging', result: status });
                return status;
            }
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.startCharging = function (vehicleId) {
    var self = this;
    return startCharging(self.options, vehicleId)
        .then(function (status) {
            //console.log(status);
            return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
                .then(function (result) {
                    self.emit(refreshEventName, { action: 'startCharging', result: result });
                    return result;
                })
                .catch(reason => {
                    self.emit(apiErrorEventName, reason);
                    return Promise.reject(reason);
                });
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.getVehicleStatusFromCloud = function (vehicleId) {
    var self = this;
    return getVehicleStatusFromCloud(self.options, vehicleId)
        .then(function (vehicle) {
            self.emit('car_status_update', vehicle);
            return vehicle;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.getVehicleChargeLocations = function (vehicleId) {
    var self = this;
    return getVehicleChargeLocations(self.options, vehicleId)
        .then(function (locations) {
            self.emit('car_charge_locations', locations);
            return locations;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.getVehiclePosition = function (vehicleId) {
    var self = this;
    return getVehiclePosition(self.options, vehicleId)
        .then(function (position) {
            self.emit('car_position_update', position);
            return position;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

VOC.prototype.listVehiclesOnAccount = function () {
    var self = this;
    return getRelationLinks(self.options)
        .then(function (relationLinks) {
            return getVehicleIds(self.options, relationLinks);
        })
        .then(function (vehicleIds) {
            return getVehicleAttributes(self.options, vehicleIds)
                .catch(reason => {
                    return Promise.reject(reason);
                });
        })
        .then(function (vehicles) {
            let devices = [];
            vehicles.forEach(vehicle => {
                let registrationNumber = '';
                if (vehicle.registrationNumber) {
                    registrationNumber = ` / ${vehicle.registrationNumber}`;
                }
                devices.push({
                    name: `${vehicle.vehicleType} / ${vehicle.modelYear}${registrationNumber}`,
                    data: {
                        id: vehicle.vin,
                        ice: true,
                        vehicleType: vehicle.vehicleType
                    },
                    store: {
                        username: self.options.username,
                        password: self.options.password
                    }
                });
            });

            self.emit('account_devices_found', devices);
            return devices;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

function login(options) {
    return getVOCCommand(options, 'customeraccounts')
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}


const timeoutPromise = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout));
const runFor = async (func, interval, self) => {
    let done = false;
    let counter = 0;
    while (!done && counter < 15) {
        counter++;
        await timeoutPromise(interval);
        await func()
            .then(function (response) {
                //console.log('Response:', response);
                if (response === 'Successful') {
                    done = true;
                    self._serviceInvocationSuccess = true;
                } else if (response === 'Failed') {
                    console.error('Service invocation failed!');
                    done = true;
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    if (counter > 15) {
        console.error(`Service invocation didn't get a status back in '${counter}' attempts!`);
    }

};

function awaitSuccessfulServiceInvocation(self, vehicleId, serviceId) {
    if (!serviceId) return Promise.reject(new Error('ServiceId is null!'));

    return runFor(() => getServiceInvocationStatus(self, vehicleId, serviceId), 1000, self)
        .then(function (response) {
            let result = self._serviceInvocationSuccess;
            self._serviceInvocationSuccess = false;
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function getServiceInvocationStatus(self, vehicleId, serviceId) {
    return getVOCCommand(self.options, `vehicles/${vehicleId}/services/${serviceId}`)
        .then(function (data) {
            if (!data) return Promise.reject(new Error('getServiceInvocationStatus, api_error'));
            let failureReason = data.failureReason || 'none';
            console.log(`Service invocation status '${data.status}', with failure reason '${failureReason}'`);
            if (failureReason !== 'none') {
                self.emit(apiErrorEventName, data);
            }

            return data.status;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function startHeater(options, vehicleId) {
    return postVOCCommand(options, `vehicles/${vehicleId}/heater/start`, {})
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}
function stopHeater(options, vehicleId) {
    return postVOCCommand(options, `vehicles/${vehicleId}/heater/stop`, null)
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}
function startPreClimatization(options, vehicleId) {
    return postVOCCommand(options, `vehicles/${vehicleId}/preclimatization/start`, {})
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}
function stopPreClimatization(options, vehicleId) {
    return postVOCCommand(options, `vehicles/${vehicleId}/preclimatization/stop`, null)
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function lock(options, vehicleId) {
    return postVOCCommand(options, `vehicles/${vehicleId}/lock`, {})
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}
function unlock(options, vehicleId) {
    return postVOCCommand(options, `vehicles/${vehicleId}/unlock`, null)
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function startEngine(options, vehicleId, duration) {
    return postVOCCommand(options, `vehicles/${vehicleId}/engine/start`, { runtime: duration })
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function stopEngine(options, vehicleId) {
    return postVOCCommand(options, `vehicles/${vehicleId}/engine/stop`, null)
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function delayCharging(options, vehicleId, chargeLocationId, payload) {
    return putVOCCommand(options, `vehicles/${vehicleId}/chargeLocations/${chargeLocationId}`, payload)
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function startCharging(options, vehicleId) {
    return postVOCCommand(options, `vehicles/${vehicleId}/rbm/overrideDelayCharging`, null)
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function blinkLights(options, vehicleId, latitude, longitude) {
    return postVOCCommandwithPosition(options,
        `vehicles/${vehicleId}/honk_blink/lights`,
        latitude, longitude)
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}
function honkHorn(options, vehicleId, latitude, longitude) {
    return postVOCCommandwithPosition(options,
        `vehicles/${vehicleId}/honk_blink/horn`,
        latitude, longitude)
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}
function honkHornAndBlinkLights(options, vehicleId, latitude, longitude) {
    return postVOCCommandwithPosition(options,
        `vehicles/${vehicleId}/honk_blink/both`,
        latitude, longitude)
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function refreshVehicleStatusFromCar(options, vehicleId) {
    return postVOCCommand(options, `vehicles/${vehicleId}/updatestatus`, null)
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function getVehicleStatusFromCloud(options, vehicleId) {
    return getVOCCommand(options, `vehicles/${vehicleId}/status`)
        .then(function (data) {
            return data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function getVehicleChargeLocations(options, vehicleId) {
    return getVOCCommand(options, `vehicles/${vehicleId}/chargeLocations?status=Accepted`)
        .then(function (data) {
            return data.chargingLocations || data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function getVehiclePosition(options, vehicleId) {
    return getVOCCommand(options,
        `vehicles/${vehicleId}/position?client_longitude=0.000000&client_precision=0.000000&client_latitude=0.000000`)
        .then(function (data) {
            return data.position;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function getRelationLinks(options) {
    let relationLinks = [];
    return getVOCCommand(options, 'customeraccounts')
        .then(function (data) {
            data.accountVehicleRelations.forEach(link => {
                let command = link.substring(link.indexOf('/vehicle-account-relations') + 1);
                relationLinks.push(command);
            });
            return relationLinks;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

async function getVehicleIds(options, relationLinks) {
    let finalArray = relationLinks.map(async (command) => {
        const result = await getVOCCommand(options, command)
            .catch(reason => {
                return Promise.reject(reason);
            });

        return result.vehicleId;
    });
    const vehicleIds = await Promise.all(finalArray);
    return vehicleIds;
};

async function getVehicleAttributes(options, vehicleIds) {
    let finalArray = vehicleIds.map(async (vehicleId) => {
        const result = await getVOCCommand(options, `vehicles/${vehicleId}/attributes`)
            .catch(reason => {
                return Promise.reject(reason);
            });

        return result;
    });
    const tempArray = await Promise.all(finalArray);
    return tempArray;
};

function postVOCCommandwithPosition(inputOptions, path, latitude, longitude) {
    let options = {
        timeout: apiTimeout,
        protocol: apiProtocol,
        hostname: apiDomains[inputOptions.region],
        path: `${apiEndpoint}${path}`,
        json: {
            'clientAccuracy': 0,
            'clientLatitude': latitude,
            'clientLongitude': longitude
        },
        headers: {
            'X-Client-Version': apiXClientVersion,
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/vnd.wirelesscar.com.voc.ClientPosition.v4+json; charset=utf-8',
            'X-Request-Id': uuidv1().toUpperCase(),
            'User-Agent': apiUserAgent,
            'X-Os-Type': 'iPhone OS',
            'X-Device-Id': inputOptions.uuid,
            'X-Os-Version': apiXOSVersion,
            'X-Originator-Type': 'app',
            'Accept': '*/*'
        },
        auth: `${inputOptions.username}:${inputOptions.password}`
    };

    return http.post(options)
        .then(function (response) {
            return response.data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });

}

function postVOCCommand(inputOptions, path, data) {
    let options = {
        timeout: apiTimeout,
        protocol: apiProtocol,
        hostname: apiDomains[inputOptions.region],
        path: `${apiEndpoint}${path}`,
        json: true,
        headers: {
            'X-Client-Version': apiXClientVersion,
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/json; charset=utf-8',
            'X-Request-Id': uuidv1().toUpperCase(),
            'User-Agent': apiUserAgent,
            'X-Os-Type': 'iPhone OS',
            'X-Device-Id': inputOptions.uuid,
            'X-Os-Version': apiXOSVersion,
            'X-Originator-Type': 'app',
            'Accept': '*/*'
        },
        auth: `${inputOptions.username}:${inputOptions.password}`
    };

    if (data) {
        options.json = data;
    }

    return http.post(options)
        .then(function (response) {
            return response.data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function getVOCCommand(inputOptions, path) {
    let options = {
        timeout: apiTimeout,
        protocol: apiProtocol,
        hostname: apiDomains[inputOptions.region],
        path: `${apiEndpoint}${path}`,
        headers: {
            'X-Client-Version': apiXClientVersion,
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/json; charset=utf-8',
            'X-Request-Id': uuidv1().toUpperCase(),
            'User-Agent': apiUserAgent,
            'X-Os-Type': 'iPhone OS',
            'X-Device-Id': inputOptions.uuid,
            'X-Os-Version': apiXOSVersion,
            'X-Originator-Type': 'app',
            'Accept': '*/*'
        },
        auth: `${inputOptions.username}:${inputOptions.password}`
    };

    return http.json(options)
        .then(function (response) {
            return response;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function putVOCCommand(inputOptions, path, data) {
    let options = {
        timeout: apiTimeout,
        protocol: apiProtocol,
        hostname: apiDomains[inputOptions.region],
        path: `${apiEndpoint}${path}`,
        json: true,
        headers: {
            'X-Client-Version': apiXClientVersion,
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/vnd.wirelesscar.com.voc.ChargeLocation.v4+json; charset=utf-8',
            'X-Request-Id': uuidv1().toUpperCase(),
            'User-Agent': apiUserAgent,
            'X-Os-Type': 'iPhone OS',
            'X-Device-Id': inputOptions.uuid,
            'X-Os-Version': apiXOSVersion,
            'X-Originator-Type': 'app',
            'Accept': '*/*'
        },
        auth: `${inputOptions.username}:${inputOptions.password}`
    };

    if (data) {
        options.json = data;
    }

    return http.put(options)
        .then(function (response) {
            return response.data;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

exports = module.exports = VOC;