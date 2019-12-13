/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';


const request = require('request');
const path = require('path');
const utils = require('@iobroker/adapter-core');
const adapter = new utils.Adapter('roadtraffic');
const objs = require('./lib/objs.js');
const FORBIDDEN_CHARS = /[\][*,;'"`<>\\?]/g;

let pollingInterval;
let routes;
let configuredIdsArray = [];    //-- [routeid,..] of configured routes (filled by getChannels();)
let configuredIdsObject = {};   //-- {routeid: name,..} of configured routes (filled by getChannels();)
let currentIdsArray = [];       //-- [routeid,..] of actual existing route objects (filled by getChannels();)
let currentIdsObject = {};      //-- {routeid: name,..} of actual existing route objects (filled by getChannels();)
let toDelete = [];              //-- [routeid,..] of routes that have to be deleted (filled by checkChannels();)
let toUpdate = [];              //-- [routeid,..] of routes that have to be updated (filled by checkChannels();)
let okayIds = [];               //-- [routeid,..] of routes that we dont have to take care about (filled by checkChannels();)
let toCreate = [];              //-- [routeid,..] of routes that have to be created (filled by checkChannels();)
let device = {};

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
        adapter.log.debug('Route Refresh triggered: ' + comp[2]);
        checkDuration(comp[2]);
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
        if (adapter.config.apiKEY) {
            if (obj && obj.native && obj.native.secret) {
                adapter.config.apiKEY = decrypt(obj.native.secret, adapter.config.apiKEY || 'empty');
            } else {
                adapter.config.apiKEY = decrypt('Zgfr56gFe87jJOM', adapter.config.apiKEY || 'empty');
            }
        }
        routes = adapter.config.routepoints;
        if (!adapter.config.apiKEY) {
            adapter.log.error('https://github.com/BuZZy1337/ioBroker.roadtraffic#getting-started');
            adapter.log.error('You need to set the Api KEY in the instance settings!');
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

function getChannels() {  // Fill arrays and objects for comparing configured vs existing routes
    adapter.log.debug('Starting getChannels()..');
    adapter.getObjectView('roadtraffic', 'listRouteIDs',
        { startkey: 'roadtraffic.' + adapter.instance + '.', endkey: 'roadtraffic.' + adapter.instance + '.\u9999' },
        function (err, doc) {
            if (!err && doc) {
                try {
                    if (Array.isArray(doc.rows) && doc.rows.length > 0) {
                        adapter.log.debug('ObjectView got: ' + JSON.stringify(doc));
                        // Filling array and obj with existing routes
                        doc.rows.forEach(function (val, i) {
                            adapter.log.debug('Pushed ' + JSON.stringify(val.value) + ' to currentIdsArray!');
                            currentIdsArray.push(val.value);
                        });
                        currentIdsObject = Object.assign({}, ...currentIdsArray);
                        adapter.log.debug('currentIdsObject now: ' + JSON.stringify(currentIdsObject));
                        currentIdsArray = Object.keys(currentIdsObject);
                        adapter.log.debug('currentIdsArray now: ' + JSON.stringify(currentIdsArray));
                        // Continue with generating the same stuff for configured routes
                        routes.forEach(function (val, i) {
                            configuredIdsObject[val.routeid] = val.name;
                        });
                        adapter.log.debug('configuredIdsObject now: ' + JSON.stringify(configuredIdsObject));
                        configuredIdsArray = Object.keys(configuredIdsObject);
                        adapter.log.debug('configuredIdsArray now: ' + JSON.stringify(configuredIdsArray));
                        adapter.log.debug('getChannels() finished..');
                        checkChannels(1);
                    } else {
                        adapter.log.debug('getChannels() got nothing..');
                        routes.forEach(function (val, i) {
                            configuredIdsObject[val.routeid] = val.name;
                        });
                        adapter.log.debug('configuredIdsObject now: ' + JSON.stringify(configuredIdsObject));
                        configuredIdsArray = Object.keys(configuredIdsObject);
                        adapter.log.debug('configuredIdsArray now: ' + JSON.stringify(configuredIdsArray));
                        checkChannels(1);
                    }
                } catch (e) {
                    adapter.log.error('Error in getChannels(): ' + e);
                }
            }
        });
}

let checkCount = 0;
let delCount = 0;
let updateCount = 0;
let createdChannelCount = 0;
let createdStateCount = 0;

function checkChannels(arg) {
    /* 
        arg=1: decide what we have to do
        arg=2: delete channels
        arg=3: update channels
        arg=4: create channels
    */
    try {
        switch (arg) {
            case 1:
                adapter.log.debug('checkChannels(1) called..');
                if (Array.isArray(currentIdsArray) && currentIdsArray.length > 0) {
                    adapter.log.debug('We have to check ' + currentIdsArray.length + ' Routes..');
                    for (let [key, value] of Object.entries(currentIdsObject)) {
                        adapter.log.debug('Checking Route: ' + value + ' (ID: ' + key + ')');
                        adapter.getObject(value, function (err, obj) {
                            checkCount++;
                            if (!err) {
                                adapter.log.debug('Got Object of Route: ' + value + ' - ' + JSON.stringify(obj));
                                if (configuredIdsArray.indexOf(obj.native.routeid) === -1) {
                                    adapter.log.debug('Route ' + currentIdsObject[obj.native.routeid] + ' has to be deleted - because deleted in config!');
                                    toDelete.push(obj.native.routeid);
                                }
                                else if (obj.common.name !== configuredIdsObject[obj.native.routeid]) {
                                    adapter.log.debug('Route ' + currentIdsObject[obj.native.routeid] + ' has to be recreated - because name was changed!');
                                    toDelete.push(obj.native.routeid);
                                }
                                else if (obj.native.origin !== device[obj.native.routeid].native.origin || obj.native.destination !== device[obj.native.routeid].native.destination) {
                                    adapter.log.debug('Route ' + currentIdsObject[obj.native.routeid] + ' has to be updated - because origin or destination changed!');
                                    let index = toCreate.indexOf(obj.native.routeid);
                                    if (index > -1) {
                                        toCreate.splice(index, 1);
                                    }
                                    toUpdate.push(obj.native.routeid);
                                }
                                else {
                                    adapter.log.debug('Route ' + currentIdsObject[obj.native.routeid] + ' hast not changed..');
                                    let index = toCreate.indexOf(obj.native.routeid);
                                    if (index > -1) {
                                        toCreate.splice(index, 1);
                                    }
                                    okayIds.push(obj.native.routeid);
                                }
                                if (checkCount === currentIdsArray.length) {
                                    adapter.log.debug('That was the last Object..');
                                    if (toDelete.length > 0) {
                                        adapter.log.debug('We have to delete something...');
                                        checkChannels(2);
                                    } else if (toUpdate.length > 0) {
                                        adapter.log.debug('We have to update something..');
                                        checkChannels(3);
                                    } else {
                                        adapter.log.debug('We dont have to do any changes..');
                                        checkChannels(4);
                                    }
                                }
                            }
                        });
                    }
                } else {
                    adapter.log.debug('Seems like we dont have any routes yet...');
                    checkChannels(4);
                }
                break;
            case 2:
                adapter.log.debug('checkChannels(2) called.. Starting to delete devices..');
                toDelete.forEach(function (val, i) {
                    adapter.log.debug('Trying to delete ' + currentIdsObject[val]);
                    adapter.deleteDevice(currentIdsObject[val], function (err) {
                        delCount++;
                        adapter.log.debug('Deleted ' + currentIdsObject[val] + ' ...');
                        if (delCount === toDelete.length) {
                            adapter.log.debug('That was the last route...')
                            if (toUpdate.length > 0) {
                                checkChannels(3);
                            } else {
                                checkChannels(4);
                            }
                        }
                    });
                });
                break;
            case 3:
                adapter.log.debug('checkChannels(3) called.. Starting to update devices..');
                toUpdate.forEach(function (val, i) {
                    updateCount++;
                    adapter.extendObject(currentIdsObject[val], device[val], function (err) {
                        if (err) {
                            adapter.log.debug('Error in updating Channel for Route: ' + err);
                        } else {
                            adapter.log.debug('Update Route successful!');
                            if (updateCount === toUpdate.length) {
                                checkChannels(4);
                            }
                        }
                    });
                });
                break;
            case 4:
                if (toCreate.length > 0) {
                    let channelstoCreate = (toCreate.length * objs.channelsArray.length);
                    let statestoCreate = (toCreate.length * objs.statesArray.length) + (toCreate.length * objs.alarmArray.length * objs.daysArray.length);
                    adapter.log.debug('checkChannels(4) called.. Starting to create devices..');
                    toCreate.forEach(function (val, i) {
                        try {
                            adapter.log.debug('Creating ' + device[val].common.name);
                            adapter.setObjectNotExists(device[val].common.name, device[val], function (err) {
                                if (err) {
                                    adapter.log.debug('Error in creating Device for Route: ' + err);
                                } else {
                                    adapter.log.debug('Success: Created Device ' + device[val].common.name);
                                    objs.channelsArray.forEach(function (value, i) {
                                        adapter.setObjectNotExists(device[val].common.name + '.' + value, objs.channels[value], function (err) {
                                            if (!err) {
                                                adapter.log.debug('Created channel ' + device[val].common.name + '.' + value);
                                                createdChannelCount++;
                                                if (value === 'route') {
                                                    objs.statesArray.forEach(function (value, i) {
                                                        adapter.setObjectNotExists(device[val].common.name + '.route.' + value, objs.states[value], function (err) {
                                                            if (err) {
                                                                adapter.log.error(err);
                                                            }
                                                            createdStateCount++;
                                                            adapter.log.debug('Created State ' + device[val].common.name + '.route.' + value);
                                                            if (createdChannelCount === channelstoCreate &&
                                                                createdStateCount === statestoCreate) {
                                                                adapter.log.debug('Created last State..');
                                                                checkDuration('all');
                                                            }
                                                        });
                                                    });
                                                } else if (objs.daysArray.indexOf(value) !== -1) {
                                                    objs.alarmArray.forEach(function (val2, i) {
                                                        adapter.setObjectNotExists(device[val].common.name + '.' + value + '.' + val2, objs.alarm[val2], function (err) {
                                                            if (err) {
                                                                adapter.log.error(err);
                                                            }
                                                            createdStateCount++;
                                                            adapter.log.debug('Created State ' + device[val].common.name + '.' + value + '.' + val2);
                                                            if (createdChannelCount === channelstoCreate &&
                                                                createdStateCount === statestoCreate) {
                                                                adapter.log.debug('Created last State..');
                                                                checkDuration('all');
                                                            }
                                                        });
                                                    });
                                                }
                                            }
                                        });
                                    });
                                }
                            });
                        } catch (e) {
                            adapter.log.error('Error in checkChannels(4): ' + e);
                        }
                    });
                } else {
                    adapter.log.debug('Everything done.. Getting fresh Data..');
                    checkDuration('all');
                }
        }
    } catch (e) {
        adapter.log.error('Error in checkChannels(): ' + e);
    }
}

function checkDuration(name) {
    if (!adapter.config.apiKEY) {
        adapter.log.error('https://github.com/BuZZy1337/ioBroker.roadtraffic#getting-started');
        adapter.log.error('You need to set the Api KEY in the instance settings!');
        return;
    }
    if (name === 'all') {
        adapter.log.debug('Refreshing all routes.. (' + JSON.stringify(configuredIdsArray) + ')');
        configuredIdsArray.forEach(function (val, i) {
            adapter.log.debug('Calling refresh of ' + configuredIdsObject[val]);
            checkDuration(configuredIdsObject[val]);
        });
    } else {
        adapter.log.debug('Refreshing ' + name);
        adapter.getObject(name, function (err, obj) {
            adapter.log.debug('Checking obj: ' + JSON.stringify(obj));
            if (err) return;
            const origin = encodeURIComponent(obj.native.originGeo);
            const destination = encodeURIComponent(obj.native.destinationGeo)
            const link = 'https://route.ls.hereapi.com/routing/7.2/calculateroute.json?apikey=' + adapter.config.apiKEY + '&waypoint0=' + origin + '&waypoint1=' + destination + '&jsonAttributes=41&mode=fastest;car;traffic:enabled;&language=de-de';
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
                                    adapter.setState(name + '.route.distance', info.response.route[0].summary.distance, true);
                                    adapter.setState(name + '.route.distanceText', (info.response.route[0].summary.distance / 1000).toFixed(2).toString() + ' km', true);
                                    adapter.setState(name + '.route.duration', info.response.route[0].summary.baseTime, true);
                                    adapter.setState(name + '.route.durationText', secondsToTime(info.response.route[0].summary.baseTime), true);
                                    adapter.setState(name + '.route.durationTraffic', info.response.route[0].summary.trafficTime, true);
                                    adapter.setState(name + '.route.durationTrafficText', secondsToTime(info.response.route[0].summary.trafficTime), true);
                                } catch (e) {
                                    adapter.log.error('Error setting State: ' + e);
                                }
                            }
                        } else {
                            adapter.log.error('Unable to get Data from Here.. ' + JSON.stringify(response))
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

function checkApiKey() {
    const link = 'https://route.ls.hereapi.com/routing/7.2/calculateroute.json?apikey=' + adapter.config.apiKEY + '&waypoint0=geo!52.5170365,13.3888599&waypoint1=geo!52.5170365,13.3888599&mode=fastest;car;traffic:enabled;&language=de-de';
    request(link, function (error, response, body) {
        if (!error) {
            try {
                var info = JSON.parse(body);
                if (response.statusCode !== 200) {
                    adapter.log.error('Error from Here: ' + info.type + ' ' + info.subtype);
                    if (info.details) adapter.log.error('Additional Error: ' + info.details);
                    adapter.setState('info.connection', false, true);
                } else {
                    adapter.log.debug('API Key looks good! ..');
                    adapter.setState('info.connection', true, true);
                    if (Array.isArray(routes) && routes.length > 0) {
                        adapter.log.debug('Starting to get coordinates of Routepoints..');
                        geoCode(0, getChannels);
                    } else {
                        adapter.log.error('You need to create Routes in the instance settings!!');
                    }
                }
            }
            catch (e) {
                adapter.log.error('API Key check failed: ' + e);
            }
        } else {
            adapter.log.error('Error in checkApiKey() request: ' + error);
        }
    });
}

let run = 0;
let routePoint;

function geoCode(num, cb) {
    let type;
    if (Array.isArray(routes) && routes.length > 0 && run <= routes.length * 2) {
        if (run === 0 || run % 2 === 0) {
            type = 'origin';
        } else {
            type = 'destination';
        }
        routePoint = routes[num][type];
        const link = 'https://geocoder.ls.hereapi.com/6.2/geocode.json?apikey=' + adapter.config.apiKEY + '&searchtext=' + encodeURIComponent(routePoint);
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
                            if (Array.isArray(routes) && routes.length > 0) {
                                routes.forEach(function (val, i) {
                                    toCreate.push(val.routeid);
                                    device[val.routeid] = {
                                        type: 'device',
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
                                });
                                adapter.log.debug('Filled device object: ' + JSON.stringify(device));
                                cb();
                            }
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
    if (adapter.config.apiKEY) {
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
    } else {
        adapter.log.error('https://github.com/BuZZy1337/ioBroker.roadtraffic#getting-started');
        adapter.log.error('You need to set the Api KEY in the instance settings!');
    }
    adapter.log.debug('Selected Alexa for Alarm: ' + adapter.config.alexa);
}