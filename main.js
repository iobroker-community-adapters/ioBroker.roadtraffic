/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';


const request = require('request');
const path = require('path');
const utils = require(path.join(__dirname, 'lib', 'utils'));
const adapter = new utils.Adapter('roadtraffic');
let pollingInterval;

adapter.on('unload', function (callback) {
    try {
        if (pollingInterval) clearInterval(pollingInterval);
        callback();
    } catch (e) {
        callback();
    }
});


adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    // adapter.log.debug('objectChange ' + id + ' ' + JSON.stringify(obj));
});


adapter.on('stateChange', function (id, state) {
    if (!state || state.ack) return;
    var comp = id.split('.');
    if (comp[4] === 'refresh') {
        adapter.log.debug('Route Refresh triggered: ' + comp[3])
        checkDuration(comp[3]);
    }
    else if (comp[2] === 'refresh') {
        checkDuration('all');
    }
});


adapter.on('message', function (msg) {
    if (msg.command === 'wizard' && !wizard) {
        startWizard(msg);
        wizard = true;
    }
});



adapter.on('ready', function () {
    adapter.getForeignObject('system.config', (err, obj) => {
        if (adapter.config.apiKey) {
            if (obj && obj.native && obj.native.secret) {
                adapter.config.apiKey = decrypt(obj.native.secret, adapter.config.apiKey || 'empty');
            } else {
                adapter.config.apiKey = decrypt('Zgfr56gFe87jJOM', adapter.config.apiKey || 'empty');
            }
        }
        main();
    });
});


function decrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}


function checkDuration(name) {
    if (!adapter.config.apiKey) {
        adapter.log.error('You need to set an API Key in the instance settings!');
        return;
    }
    if (name === 'all') {
        adapter.getChannelsOf('routes', function (err, channels) {
            if (err) {
                adapter.log.error('Error getting Route Channels: ' + err);
                return;
            }
            channels.forEach(function (val) {
                checkDuration(val.common.name);
            });
        });
    } else {
        adapter.getObject('routes.' + name, function (err, obj) {
            if (err) return;
            const origin = encodeURIComponent(obj.native.origin);
            const destination = encodeURIComponent(obj.native.destination)
            const link = 'https://maps.googleapis.com/maps/api/distancematrix/json?origins=' + origin + '&destinations=' + destination + '&mode=driving&language=de-DE&departure_time=now&key=' + adapter.config.apiKey;
            request(link, function (error, response, body) {
                if (!error) {
                    try {
                        if (response.statusCode === 200) {
                            var info = JSON.parse(body);
                            if (info.status !== 'OK' && info.error_message) {
                                adapter.log.error('Error from Google: ' + info.error_message);
                            } else {
                                adapter.log.debug('Google response: ' + JSON.stringify(info));
                                try {
                                    adapter.setState('routes.' + name + '.distance', info.rows[0].elements[0].distance.value / 1000, true);
                                    adapter.setState('routes.' + name + '.duration', info.rows[0].elements[0].duration.value, true);
                                    adapter.setState('routes.' + name + '.durationTraffic', info.rows[0].elements[0].duration_in_traffic.value, true);
                                } catch (e) {
                                    adapter.log.error('Error setting State: ' + e);
                                }
                            }
                        }
                    }
                    catch (e) {
                        adapter.log.error('Checking duration failed: ' + e);
                    }
                } else {
                    adapter.log.error('Error in checkDuration(): ' + error);
                }
            });

        });
    }
}

function createStates() {
    try {
        let routes = adapter.config.routepoints;
        adapter.log.debug('Routes Configured: ' + JSON.stringify(routes));
        adapter.deleteDevice('routes', function () {
            if (Array.isArray(routes) && routes.length > 0) {
                adapter.createDevice('routes', {
                    "name": "Configured Routes"
                }, function () {
                    routes.forEach(function (val, i) {
                        let object = {
                            type: 'channel',
                            common: {
                                name: val.name,
                                desc: val.name + ' Route'
                            },
                            native: {
                                origin: val.origin,
                                destination: val.destination
                            }
                        };
                        adapter.log.debug('Creating State for Route ' + i + ': ' + JSON.stringify(val));
                        adapter.setObjectNotExists('routes.' + val.name, object, function (err) {
                            if (err) {
                                adapter.log.debug('Error in creating Channel for Route: ' + err);
                            } else {
                                let object = { type: 'state', common: { name: 'Refresh', type: 'state', role: 'button', read: true, write: true, desc: 'Refresh this Route now' }, native: {} };
                                let distanceObj = { type: "state", common: { name: "Distance", role: "value", desc: "Distance from origin to destination", type: "number", unit: "km", read: true, write: false } };
                                let durationObj = { type: "state", common: { name: "Normal duration without Traffic", role: "value", desc: "Normal duration without Traffic", type: "number", unit: "sec", read: true, write: false } };
                                let durationTrafficObj = { type: "state", common: { name: "Duration with actual Traffic", role: "value", desc: "Travel duration with actual traffic", type: "number", unit: "sec", read: true, write: false } };
                                adapter.setObjectNotExists('routes.' + val.name + '.refresh', object, function (err) {
                                    if (err) {
                                        adapter.log.error(err);
                                    }
                                });
                                adapter.setObjectNotExists('routes.' + val.name + '.distance', distanceObj, function (err) {
                                    if (err) {
                                        adapter.log.error(err);
                                    }
                                });
                                adapter.setObjectNotExists('routes.' + val.name + '.duration', durationObj, function (err) {
                                    if (err) {
                                        adapter.log.error(err);
                                    }
                                });
                                adapter.setObjectNotExists('routes.' + val.name + '.durationTraffic', durationTrafficObj, function (err) {
                                    if (err) {
                                        adapter.log.error(err);
                                    }
                                });
                            }
                        });
                    });
                });
            }
        });
    } catch (e) {
        adapter.log.error('Error in createStates(): ' + e)
    }
}

function checkApiKey() {
    const link = 'https://maps.googleapis.com/maps/api/distancematrix/json?origins=Berlin&destinations=Berlin&mode=driving&language=de-DE&departure_time=now&key=' + adapter.config.apiKey;
    request(link, function (error, response, body) {
        if (!error) {
            try {
                if (response.statusCode === 200) {
                    var info = JSON.parse(body);
                    if (info.status !== 'OK' && info.error_message) {
                        adapter.log.error('Error from Google: ' + info.error_message);
                        adapter.setState('info.connection', false, true);
                    } else {
                        adapter.setState('info.connection', true, true);
                    }
                }
            }
            catch (e) {
                adapter.log.error('API Key check failed: ' + e);
            }
        } else {
            adapter.log.error('Error in checkApiKey(): ' + error);
        }
    });
}

function main() {
    adapter.setState('info.connection', false, true);
    if (adapter.config.apiKey) {
        checkApiKey();
        createStates();
        adapter.subscribeStates('*');
        if (!pollingInterval && adapter.config.pollingInterval) {
            if (adapter.config.pollingInterval < 10) adapter.config.pollingInterval = 10;
            pollingInterval = setInterval(() => {
                checkDuration('all');
            }, adapter.config.pollingInterval * 60 * 1000);
        }
    }
}