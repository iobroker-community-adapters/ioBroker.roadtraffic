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
let IDObject = {};
let configuredIds = [];
let currentObjsArray;
let currentObjs;
const FORBIDDEN_CHARS = /[\][*,;'"`<>\\?]/g;

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
        adapter.log.debug('Route Refresh triggered: ' + comp[3]);
        checkDuration(comp[3]);
    }
    else if (comp[2] === 'refresh') {
        adapter.log.debug('Route Refresh triggered (ALL)');
        checkDuration('all');
    }
});


adapter.on('message', function (msg) {
    // if (msg.command === 'wizard' && !wizard) {
    //     startWizard(msg);
    //     wizard = true;
    // }
});



adapter.on('ready', function () {
    adapter.getForeignObject('system.config', (err, obj) => {
        if (adapter.config.appID && adapter.config.appCode) {
            if (obj && obj.native && obj.native.secret) {
                adapter.config.appID = decrypt(obj.native.secret, adapter.config.appID || 'empty');
                adapter.config.appCode = decrypt(obj.native.secret, adapter.config.appCode || 'empty');
            } else {
                adapter.config.appID = decrypt('Zgfr56gFe87jJOM', adapter.config.appID || 'empty');
                adapter.config.appCode = decrypt('Zgfr56gFe87jJOM', adapter.config.appCode || 'empty');
            }
        }
        routes = adapter.config.routepoints;
        if (Array.isArray(routes) && routes.length > 0) {
            routes.forEach(function (val, i) {
                configuredIds.push(val.routeid);
                if (i === routes.length - 1) {
                    main();
                }
            });
        } else {
            main();
        }
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
    if (!adapter.config.appID || !adapter.config.appCode) {
        adapter.log.error('You need to set the APP ID and APP Code in the instance settings!');
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
            const origin = encodeURIComponent(obj.native.originGeo);
            const destination = encodeURIComponent(obj.native.destinationGeo)
            const link = 'https://route.api.here.com/routing/7.2/calculateroute.json?app_id=' + adapter.config.appID + '&app_code=' + adapter.config.appCode + '&waypoint0=' + origin + '&waypoint1=' + destination + '&jsonAttributes=41&mode=fastest;car;traffic:enabled;&language=de-de';
            request(link, function (error, response, body) {
                if (!error) {
                    try {
                        if (response.statusCode === 200) {
                            var info = JSON.parse(body);
                            if (info.status !== 'OK' && info.error_message) {
                                adapter.log.error('Error from HERE: ' + info.error_message);
                            } else {
                                adapter.log.debug('HERE response: ' + JSON.stringify(info));
                                try {
                                    adapter.setState('routes.' + name + '.distance', info.response.route[0].summary.distance, true);
                                    adapter.setState('routes.' + name + '.distanceText', (info.response.route[0].summary.distance / 1000).toFixed(2).toString() + ' km', true);
                                    adapter.setState('routes.' + name + '.duration', info.response.route[0].summary.baseTime, true);
                                    adapter.setState('routes.' + name + '.durationText', secondsToTime(info.response.route[0].summary.baseTime), true);
                                    adapter.setState('routes.' + name + '.durationTraffic', info.response.route[0].summary.trafficTime, true);
                                    adapter.setState('routes.' + name + '.durationTrafficText', secondsToTime(info.response.route[0].summary.trafficTime), true);
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


function checkChannels() {
    let toDelete = [];
    adapter.getObjectView('roadtraffic', 'listRouteIDs',
        { startkey: 'roadtraffic.' + adapter.instance + '.', endkey: 'roadtraffic.' + adapter.instance + '.\u9999' },
        function (err, doc) {
            if (!err && doc) {
                currentObjs = doc.rows;
                currentObjsArray = [];
                currentObjs.forEach(function (val, i) {
                    currentObjsArray.push(val.value);
                });
                if (currentObjs) {
                    adapter.log.debug('ObjectView got: ' + JSON.stringify(currentObjsArray));
                }
                currentObjs = Object.assign({}, ...currentObjsArray);
                let count = 0;
                if (currentObjsArray.length !== 0) {
                    for (let [key, value] of Object.entries(currentObjs)) {
                        toDelete.push(key);
                        adapter.log.debug(JSON.stringify(routes));
                        adapter.log.debug('Getting Object of ID: ' + key + ' - Name: ' + value);
                        adapter.getObject('routes.' + value, function (err, obj) {
                            count++;
                            if (!err) {
                                adapter.log.debug('Got Object: ' + JSON.stringify(obj));
                                if (configuredIds.indexOf(obj.native.routeid) === -1) {
                                    adapter.deleteChannel('routes', value, function (err) {
                                        if (!err) {
                                            adapter.log.debug('Deleted ' + value + ' ... Running trough again!');
                                            checkChannels();
                                        }
                                    });
                                    return;
                                }
                            }
                            if (count === currentObjsArray.length) {
                                adapter.log.debug('That was the last Object.. Creating states..');
                                createStates();
                            }
                        });
                    }
                } else {
                    adapter.log.debug('No Objects created yet...');
                    createStates();
                }
            }
        });
}

let channel = {};

function createStates() {
    try {
        adapter.log.debug('Routes Configured: ' + JSON.stringify(routes));
        if (Array.isArray(routes) && routes.length > 0) {
            let k = 0;
            routes.forEach(function (val, i) {
                channel[val.routeid] = {
                    type: 'channel',
                    common: {
                        name: val.name.replace(FORBIDDEN_CHARS, '_'),
                        desc: val.name + ' Route'
                    },
                    native: {
                        routeid: val.routeid,
                        origin: val.origin,
                        originGeo: val.originGeo,
                        destination: val.destination,
                        destinationGeo: val.destinationGeo
                    }
                };
                IDObject[val.routeid] = {};
                IDObject[val.routeid]['name'] = val.name;
                IDObject[val.routeid]['origin'] = val.origin;
                IDObject[val.routeid]['destination'] = val.destination;
                IDObject[val.routeid]['channel'] = channel[val.routeid];
                if (currentObjs[val.routeid]) {
                    adapter.log.debug('Trying to get Object ' + currentObjs[val.routeid]);
                    adapter.getObject('routes.' + currentObjs[val.routeid], function (err, obj) {
                        if (obj.common.name !== IDObject[obj.native.routeid].name) {
                            adapter.deleteChannel('routes', currentObjs[val.routeid], function (err) {
                                if (!err) {
                                    adapter.log.debug('Deleted ' + currentObjs[val.routeid] + ' ... Running trough again!');
                                    checkChannels();
                                }
                            });
                            return;
                        } else if (obj.native.origin !== IDObject[obj.native.routeid].origin ||
                            obj.native.destination !== IDObject[obj.native.routeid].destination) {
                            adapter.log.debug(obj.common.name + ' was changed in the settings!!');
                            adapter.extendObject('routes.' + currentObjs[val.routeid], channel[val.routeid], function (err) {
                                if (err) {
                                    adapter.log.debug('Error in updating Channel for Route: ' + err);
                                } else {
                                    adapter.log.debug('Update Route successful!');
                                    checkDuration(currentObjs[val.routeid]);
                                }
                            });
                        } else {
                            adapter.log.debug(obj.common.name + ' has not been changed..');
                        }
                    });
                } else {
                    adapter.log.debug('Creating States for Route ' + i + ': ' + JSON.stringify(val));
                    setTimeout(function () {
                        adapter.setObjectNotExists('routes.' + val.name.replace(FORBIDDEN_CHARS, '_'), channel[val.routeid], function (err) {
                            if (err) {
                                adapter.log.debug('Error in creating Channel for Route: ' + err);
                            } else {
                                adapter.log.debug('Created Channel routes.' + val.name.replace(FORBIDDEN_CHARS, '_'));
                                k = 0;
                                objs.objectArray.forEach(function (value, i) {
                                    adapter.setObjectNotExists('routes.' + val.name.replace(FORBIDDEN_CHARS, '_') + '.' + value, objs.states[value], function (err) {
                                        if (err) {
                                            adapter.log.error(err);
                                        }
                                        k++;
                                        adapter.log.debug('Created State routes.' + val.name.replace(FORBIDDEN_CHARS, '_') + '.' + value);
                                        if (k === objs.objectArray.length) {
                                            adapter.log.debug('That was the last state... Getting fresh data from HERE..');
                                            checkDuration(val.name.replace(FORBIDDEN_CHARS, '_'));
                                        }
                                    });
                                });
                            }
                        })

                    }, 1000);
                }
            });
        }
    } catch (e) {
        adapter.log.error('Error in createStates(): ' + e)
    }
}


function checkApiKey() {
    const link = 'https://route.api.here.com/routing/7.2/calculateroute.json?app_id=' + adapter.config.appID + '&app_code=' + adapter.config.appCode + '&waypoint0=geo!52.5170365,13.3888599&waypoint1=geo!52.5170365,13.3888599&jsonAttributes=41&mode=fastest;car;traffic:enabled;&language=de-de';
    request(link, function (error, response, body) {
        if (!error) {
            try {
                var info = JSON.parse(body);
                if (response.statusCode !== 200) {
                    adapter.log.error('Error from Here: ' + info.type + ' ' + info.subtype);
                    if (info.details) adapter.log.error('Additional Error: ' + info.details);
                    adapter.setState('info.connection', false, true);
                } else {
                    adapter.log.debug('API Key pair looks good! ..');
                    adapter.setState('info.connection', true, true);
                    if (Array.isArray(routes) && routes.length > 0) {
                        adapter.log.debug('Starting to get coordinates of Routepoints..');
                        geoCode(0, checkChannels);
                    } else {
                        adapter.log.error('You need to create Routes in the instance settings!!');
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

let run = 0;
let routePoint;

function geoCode(num, cb) {
    let type;
    if (Array.isArray(routes) && routes.length > 0 && run <= routes.length * 2) {
        if (run == 0 || run % 2 === 0) {
            type = 'origin';
        } else {
            type = 'destination';
        }
        routePoint = routes[num][type];
        const link = 'https://geocoder.api.here.com/6.2/geocode.json?app_id=' + adapter.config.appID + '&app_code=' + adapter.config.appCode + '&searchtext=' + encodeURIComponent(routePoint);
        request(link, function (error, response, body) {
            if (!error) {
                try {
                    var info = JSON.parse(body);
                    if (response.statusCode === 200) {
                        adapter.log.debug(routePoint + ' resolved to: ' + info.Response.View[0].Result[0].Location.Address.Label);
                        adapter.log.debug(routePoint + ' coordinates Lat: ' + info.Response.View[0].Result[0].Location.NavigationPosition[0].Latitude + ' Long: ' + info.Response.View[0].Result[0].Location.NavigationPosition[0].Longitude);
                        const geo = 'geo!' + info.Response.View[0].Result[0].Location.NavigationPosition[0].Latitude + ',' + info.Response.View[0].Result[0].Location.NavigationPosition[0].Longitude;
                        routes[num][type + 'Geo'] = geo;
                        run++;
                        if (run < routes.length * 2) {
                            adapter.log.debug('Geocoded ' + run + ' waypoints.. Geocoding next one...');
                            geoCode(run == 0 || run % 2 !== 0 ? num : num + 1, cb);
                        } else {
                            adapter.log.debug('Geocoded ' + run + ' waypoints.. That was the last one..');
                            cb();
                        }
                    }
                }
                catch (e) {
                    adapter.log.error('geoCode() failed: ' + e);
                }
            } else {
                adapter.log.error('Error in geoCode(): ' + error);
            }
        });
    }
}

function secondsToTime(val) {
    var date = new Date(null);
    date.setSeconds(val);
    var hours = date.toISOString().substr(11, 2);
    var minutes = date.toISOString().substr(14, 2);
    return (hours !== '00' ? hours + (parseFloat(hours) === 1 ? ' Stunde ' : ' Stunden ') + minutes + ' Minuten' : minutes + ' Minuten');
}

function main() {
    adapter.setState('info.connection', false, true);
    if (adapter.config.appID && adapter.config.appCode) {
        adapter.log.debug('Checking API Key..');
        checkApiKey();
        adapter.subscribeStates('*');
        if (!pollingInterval && adapter.config.pollingInterval) {
            if (adapter.config.pollingInterval < 10) adapter.config.pollingInterval = 10;
            pollingInterval = setInterval(() => {
                adapter.log.debug('Polling interval reached..');
                checkDuration('all');
            }, adapter.config.pollingInterval * 60 * 1000);
        }
    }
    adapter.log.debug('Selected Alexa for Alarm: ' + adapter.config.alexa);
}