/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';


const request = require('request');
const path = require('path');
const utils = require('@iobroker/adapter-core');
const adapter = new utils.Adapter('roadtraffic');
const objs = require('./lib/objs.js');
let pollingInterval;
let routes;

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
        routes = adapter.config.routepoints;
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
                                    adapter.setState('routes.' + name + '.distance', info.rows[0].elements[0].distance.value, true);
                                    adapter.setState('routes.' + name + '.distanceText', info.rows[0].elements[0].distance.text, true);
                                    adapter.setState('routes.' + name + '.duration', info.rows[0].elements[0].duration.value, true);
                                    adapter.setState('routes.' + name + '.durationText', info.rows[0].elements[0].duration.text, true);
                                    adapter.setState('routes.' + name + '.durationTraffic', info.rows[0].elements[0].duration_in_traffic.value, true);
                                    adapter.setState('routes.' + name + '.durationTrafficText', info.rows[0].elements[0].duration_in_traffic.text, true);

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
        adapter.log.debug('Routes Configured: ' + JSON.stringify(routes));
        adapter.deleteDevice('routes', function () {
            if (Array.isArray(routes) && routes.length > 0) {
                adapter.createDevice('routes', {
                    "name": "Configured Routes"
                }, function () {
                    let k = 0;
                    routes.forEach(function (val, i) {
                        let channel = {
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
                        adapter.log.debug('Creating States for Route ' + i + ': ' + JSON.stringify(val));
                        adapter.setObjectNotExists('routes.' + val.name, channel, function (err) {
                            if (err) {
                                adapter.log.debug('Error in creating Channel for Route: ' + err);
                            } else {
                                objs.objectArray.forEach(function (value, i) {
                                    adapter.setObjectNotExists('routes.' + val.name + '.' + value, objs.states[value], function (err) {
                                        if (err) {
                                            adapter.log.error(err);
                                        }
                                        k++;
                                        if (k === objs.objectArray.length * routes.length) {
                                            checkDuration('all');
                                        }
                                    });
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