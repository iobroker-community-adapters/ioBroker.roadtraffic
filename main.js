/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

const request = require('request');
const utils = require('@iobroker/adapter-core');
const adapter = new utils.Adapter('roadtraffic');
const objs = require('./lib/objs.js');
const schedule = require('node-schedule');
const FORBIDDEN_CHARS = /[\][*,;'"`<>\\?]/g;

let pollingInterval;
let routes;
let configuredIdsArray = [];    //-- [routeid,..] of configured routes (filled by getChannels();)
const configuredIdsObject = {};   //-- {routeid: name,..} of configured routes (filled by getChannels();)
let currentIdsArray = [];       //-- [routeid,..] of actual existing route objects (filled by getChannels();)
let currentIdsObject = {};      //-- {routeid: name,..} of actual existing route objects (filled by getChannels();)
const toDelete = [];              //-- [routeid,..] of routes that have to be deleted (filled by checkChannels();)
const toUpdate = [];              //-- [routeid,..] of routes that have to be updated (filled by checkChannels();)
const okayIds = [];               //-- [routeid,..] of routes that we dont have to take care about (filled by checkChannels();)
const toCreate = [];              //-- [routeid,..] of routes that have to be created (filled by checkChannels();)
const alarmObj = {};
const device = {};
const schedules = {};
const triggerReset = schedule.scheduleJob('0 0 * * *', function () {
    adapter.log.info('Resetting triggers for today..');
    resetTrigger();
});

adapter.on('unload', function (callback) {
    try {
        triggerReset.cancel();
        if (pollingInterval) clearInterval(pollingInterval);
        callback();
    } catch (e) {
        callback();
    }
});


//adapter.on('objectChange', function (id, obj) {
//    // Warning, obj can be null if it was deleted
//    // adapter.log.debug('objectChange ' + id + ' ' + JSON.stringify(obj));
//});


adapter.on('stateChange', function (id, state) {
    if (!state || state.ack) return;
    adapter.log.debug('State changed: ' + id + ' ( ' + JSON.stringify(state) + ' )');
    const comp = id.split('.');
    if (comp[4] === 'refresh') {
        adapter.log.debug('Route Refresh triggered: ' + comp[2]);
        checkDuration(comp[2]);
    } else if (comp[4] === 'enabled') {
        if (state.val) {
            calcAlarm(true, comp[2], true);
        } else {
            if (schedules[comp[2]]) {
                adapter.log.debug('Cancelled Schedule for ' + comp[2]);
                schedules[comp[2]].cancel();
                schedules[comp[2]] = false;
            }
        }
    } else if (comp[4] === 'arrivaltime' || comp[4] === 'bathtime') {
        calcAlarm(true, comp[2], true);
    } else if (comp[2] === 'refresh') {
        adapter.log.debug('Route Refresh triggered (ALL)');
        checkDuration('all');
    }
    adapter.setState(id, state.val, true);
});

let calcRunning = false;
let calcRunName = '';

function calcAlarm(get, name, gotEnabled) {
    try {
        if (calcRunning && name !== calcRunName && get) {
            adapter.log.debug('calcAlarm already running.. Retry later..');
            setTimeout(function () {
                calcAlarm(get, name, gotEnabled);
            }, 500);
            return;
        }
        calcRunning = true;
        calcRunName = name;
        const now = new Date();
        const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
        if (get) {
            adapter.log.debug('Getting Alarmstates of ' + name + ' (' + objs.daysArray[dayOfWeek] + ')');
            alarmObj[name] = {};
            adapter.getState(name + '.' + objs.daysArray[dayOfWeek] + '.arrivaltime', function (err, state) {
                alarmObj[name]['arrivaltime'] = state.val;
                adapter.getState(name + '.' + objs.daysArray[dayOfWeek] + '.bathtime', function (err, state) {
                    alarmObj[name]['bathtime'] = state.val;
                    adapter.getState(name + '.' + objs.daysArray[dayOfWeek] + '.enabled', function (err, state) {
                        alarmObj[name]['enabled'] = state.val;
                        adapter.getState(name + '.route.durationTraffic', function (err, state) {
                            alarmObj[name]['travelduration'] = state.val;
                            calcAlarm(false, name, gotEnabled);
                        });
                    });
                });
            });
            return;
        } else {
            adapter.log.debug('Checking if we have to trigger Alarm ' + name + '..');
            if (!alarmObj[name]['enabled']) {
                adapter.log.debug('Alarm for today is disabled..');
                calcRunning = false;
                return;
            }
            const arrivaltime = alarmObj[name]['arrivaltime'].split(':');
            const travelduration = Math.floor(alarmObj[name]['travelduration'] / 60);
            const bathtime = alarmObj[name]['bathtime'];
            const minutesAfter0 = parseFloat(arrivaltime[0]) * 60 + parseFloat(arrivaltime[1]) - parseFloat(bathtime);
            const trafficHours = Math.floor(travelduration / 60);
            const trafficMinutes = travelduration % 60;
            adapter.log.debug('Current travelduration on ' + name + ': ' + trafficHours + ':' + trafficMinutes);
            const withTraffic = minutesAfter0 - travelduration;
            const triggerHour = Math.floor(withTraffic / 60);
            const triggerMinute = withTraffic % 60;
            adapter.log.debug('Actual traffic on ' + name + ' requires to trigger at ' + triggerHour + ':' + triggerMinute);
            adapter.getState(name + '.' + objs.daysArray[dayOfWeek] + '.triggered', function (err, state) {
                if (state.val) {
                    adapter.log.debug('Alarm already triggered for today..');
                    return;
                }
                if ((now.getHours() > triggerHour) || (now.getHours() >= triggerHour && now.getMinutes() >= triggerMinute)) {
                    if (gotEnabled) {
                        adapter.setState(name + '.' + objs.daysArray[dayOfWeek] + '.triggered', true, true);
                        adapter.log.warn('You enabled the Alarm ' + name + ' (' + objs.daysArray[dayOfWeek] + '). And your set arrivaltime + bathtime is already over the triggertime..');
                        return;
                    }
                    adapter.log.debug('TRIGGERED ' + name + '!!!');
                    triggerAlarm(name, dayOfWeek);
                    if (schedules[name]) {
                        schedules[name].cancel();
                        schedules[name] = false;
                    }
                } else {
                    const schedString = triggerMinute + ' ' + triggerHour + ' * * *';
                    if (!schedules[name]) {
                        adapter.log.debug('Schedule doesnt exist. Creating with ' + schedString);
                        schedules[name] = schedule.scheduleJob(schedString, function () {
                            adapter.log.debug('SCHEDULE FOR ' + name + ' REACHED!');
                            triggerAlarm(name, dayOfWeek);
                            schedules[name].cancel();
                            schedules[name] = false;
                        });
                    } else {
                        adapter.log.debug('Refreshing ' + name + ' schedule to ' + schedString);
                        schedules[name].reschedule(schedString);
                    }
                }
            });

            calcRunning = false;
        }
    } catch (e) {
        adapter.log.error('Error in calcAlarm(): ' + e);
    }
}

function triggerAlarm(name, dayOfWeek) {
    try {
        adapter.setState(name + '.' + objs.daysArray[dayOfWeek] + '.triggered', true, true);
        if (adapter.config.alarmSilent) {
            return;
        }
        adapter.setForeignState(adapter.config.alexa + '.Player.volume', parseFloat(adapter.config.alarmVolume));
        adapter.setForeignState(adapter.config.alexa + '.Player.TuneIn-Station', adapter.config.stationId);
        if (adapter.config.speakString !== '') {
            setTimeout(function () {
                adapter.getState(name + '.route.durationTrafficText', function (err, state) {
                    const string = adapter.config.speakString.replace('%dur', state.val).replace('%name', name);
                    adapter.log.debug('Announcement String is: ' + string);
                    adapter.setForeignState(adapter.config.alexa + '.Commands.speak', string);
                });
            }, 15000);
        }
    } catch (e) {
        adapter.log.error('Error in triggerAlarm(): ' + e);
    }
}

//adapter.on('message', function (msg) {
//    // if (msg.command === 'wizard' && !wizard) {
//    //     startWizard(msg);
//    //     wizard = true;
//    // }
//});



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
                        doc.rows.forEach(function (val, _i) {
                            adapter.log.debug('Pushed ' + JSON.stringify(val.value) + ' to currentIdsArray!');
                            currentIdsArray.push(val.value);
                        });
                        currentIdsObject = Object.assign({}, ...currentIdsArray);
                        adapter.log.debug('currentIdsObject now: ' + JSON.stringify(currentIdsObject));
                        currentIdsArray = Object.keys(currentIdsObject);
                        adapter.log.debug('currentIdsArray now: ' + JSON.stringify(currentIdsArray));
                        // Continue with generating the same stuff for configured routes
                        routes.forEach(function (val, _i) {
                            configuredIdsObject[val.routeid] = val.name;
                        });
                        adapter.log.debug('configuredIdsObject now: ' + JSON.stringify(configuredIdsObject));
                        configuredIdsArray = Object.keys(configuredIdsObject);
                        adapter.log.debug('configuredIdsArray now: ' + JSON.stringify(configuredIdsArray));
                        adapter.log.debug('getChannels() finished..');
                        checkChannels(1);
                    } else {
                        adapter.log.debug('getChannels() got nothing..');
                        routes.forEach(function (val, _i) {
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
                    for (const [key, value] of Object.entries(currentIdsObject)) {
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
                                    const index = toCreate.indexOf(obj.native.routeid);
                                    if (index > -1) {
                                        toCreate.splice(index, 1);
                                    }
                                    toUpdate.push(obj.native.routeid);
                                }
                                else {
                                    adapter.log.debug('Route ' + currentIdsObject[obj.native.routeid] + ' hast not changed..');
                                    const index = toCreate.indexOf(obj.native.routeid);
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
                toDelete.forEach(function (val, _i) {
                    adapter.log.debug('Trying to delete ' + currentIdsObject[val]);
                    adapter.deleteDevice(currentIdsObject[val], function (_err) {
                        delCount++;
                        adapter.log.debug('Deleted ' + currentIdsObject[val] + ' ...');
                        if (delCount === toDelete.length) {
                            adapter.log.debug('That was the last route...');
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
                toUpdate.forEach(function (val, _i) {
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
                    const channelstoCreate = (toCreate.length * objs.channelsArray.length);
                    const statestoCreate = (toCreate.length * objs.statesArray.length) + (toCreate.length * objs.alarmArray.length * objs.daysArray.length);
                    adapter.log.debug('checkChannels(4) called.. Starting to create devices..');
                    toCreate.forEach(function (val, _i) {
                        try {
                            adapter.log.debug('Creating ' + device[val].common.name);
                            adapter.setObjectNotExists(device[val].common.name, device[val], function (err) {
                                if (err) {
                                    adapter.log.error('Error in creating Device for Route: ' + err);
                                } else {
                                    adapter.log.debug('Success: Created Device ' + device[val].common.name);
                                    objs.channelsArray.forEach(function (value, _i) {
                                        adapter.setObjectNotExists(device[val].common.name + '.' + value, objs.channels[value], function (err) {
                                            if (!err) {
                                                adapter.log.debug('Created channel ' + device[val].common.name + '.' + value);
                                                createdChannelCount++;
                                                if (value === 'route') {
                                                    objs.statesArray.forEach(function (value, _i) {
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
                                                    objs.alarmArray.forEach(function (val2, _i) {
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
        configuredIdsArray.forEach(function (val, _i) {
            adapter.log.debug('Calling refresh of ' + configuredIdsObject[val]);
            checkDuration(configuredIdsObject[val]);
        });
    } else {
        adapter.log.debug('Refreshing ' + name);
        adapter.getObject(name, function (err, obj) {
            adapter.log.debug('Object ' + name + ': ' + JSON.stringify(obj));
            if (err) return;
            const origin = encodeURIComponent(obj.native.originGeo);
            const destination = encodeURIComponent(obj.native.destinationGeo);
            const link = 'https://route.ls.hereapi.com/routing/7.2/calculateroute.json?apikey=' + adapter.config.apiKEY + '&waypoint0=' + origin + '&waypoint1=' + destination + '&jsonAttributes=41&mode=fastest;car;traffic:enabled;&language=de-de';
            adapter.log.debug('HERE REQ:'+'https://route.ls.hereapi.com/routing/7.2/calculateroute.json?apikey=' + '*****' + '&waypoint0=' + origin + '&waypoint1=' + destination + '&jsonAttributes=41&mode=fastest;car;traffic:enabled;&language=de-de');
            request({ url: link, timeout: 15000 }, function (error, response, body) {
                if (!error) {
                    try {
                        adapter.log.debug('HERE RESP:'+body);
                        if (response.statusCode === 200) {
                            const info = JSON.parse(body);
                            if (info.status !== 'OK' && info.error_description) {
                                adapter.log.error('Error from HERE: ' + response.statusCode + ' / ' + info.error + ' : ' + info.error_description);
                            } else {
                                adapter.log.debug('HERE response: ' + JSON.stringify(info));
                                try {
                                    adapter.setState(name + '.route.distance', info.response.route[0].summary.distance, true);
                                    adapter.setState(name + '.route.distanceText', (info.response.route[0].summary.distance / 1000).toFixed(2).toString() + ' km', true);
                                    adapter.setState(name + '.route.duration', info.response.route[0].summary.baseTime, true);
                                    adapter.setState(name + '.route.durationText', secondsToTime(info.response.route[0].summary.baseTime), true);
                                    adapter.setState(name + '.route.durationTraffic', info.response.route[0].summary.trafficTime, true);
                                    adapter.setState(name + '.route.durationTrafficText', secondsToTime(info.response.route[0].summary.trafficTime), true);
                                    if (adapter.config.alarmEnabled) {
                                        calcAlarm(true, name, false);
                                    }
                                } catch (e) {
                                    adapter.log.error('Error setting State: ' + e);
                                }
                            }
                        } else {
                            adapter.log.error('Unable to get Data from Here.. ' + JSON.stringify(response));
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

function resetTrigger() {
    try {
        const now = new Date();
        const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay() - 1;
        routes.forEach(function (val, _i) {
            adapter.setState(val.name + '.' + objs.daysArray[dayOfWeek] + '.triggered', false, true);
            adapter.log.info('Trigger of ' + val.name + '.' + objs.daysArray[dayOfWeek] + ' has been reset to false.');
            if (adapter.config.alarmEnabled) {
                calcAlarm(true, val.name, false);
            }
        });
    } catch (e) {
        adapter.log.error('Error in resetTrigger(): ' + e);
    }
}

function checkApiKey() {
    const link = 'https://route.ls.hereapi.com/routing/7.2/calculateroute.json?apikey=' + adapter.config.apiKEY + '&waypoint0=geo!52.5170365,13.3888599&waypoint1=geo!52.5170365,13.3888599&mode=fastest;car;traffic:enabled;&language=de-de';
    adapter.log.debug('HERE REQ:' + 'https://route.ls.hereapi.com/routing/7.2/calculateroute.json?apikey=' + '*****' + '&waypoint0=geo!52.5170365,13.3888599&waypoint1=geo!52.5170365,13.3888599&mode=fastest;car;traffic:enabled;&language=de-de');
    request({ url: link, timeout: 15000 }, function (error, response, body) {
        if (!error) {
            try {
                adapter.log.debug('HERE RESP:' + body);
                const info = JSON.parse(body);
                if (response.statusCode !== 200) {
                    adapter.log.error('Error from HERE: ' + response.statusCode + ' / ' + info.error + ' : ' + info.error_description);
                    //adapter.log.error('Error from HERE: ' + info.type + ' ' + info.subtype);
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
            adapter.log.error('Retry in 5 Minutes..');
            setTimeout(function () {
                checkApiKey();
            }, 300000);
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
        request({ url: link, timeout: 15000 }, function (error, response, body) {
            if (!error) {
                try {
                    const info = JSON.parse(body);
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
                                routes.forEach(function (val, _i) {
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
    const date = new Date(null);
    date.setSeconds(val);
    const hours = date.toISOString().substr(11, 2);
    const minutes = date.toISOString().substr(14, 2);
    return (hours !== '00' ? parseFloat(hours) + (parseFloat(hours) === 1 ? ' Stunde ' : ' Stunden ') + parseFloat(minutes) + (parseFloat(minutes) === 1 ? ' Minute' : ' Minuten') : parseFloat(minutes) + (parseFloat(minutes) === 1 ? ' Minute' : ' Minuten'));
}

function main() {
    adapter.setState('info.connection', false, true);
    if (adapter.config.apiKEY) {
        adapter.log.debug('Checking API Key..');
        checkApiKey();
        adapter.subscribeStates('*');
        if (!pollingInterval && adapter.config.pollingInterval) {
            if (adapter.config.pollingInterval < 5) adapter.config.pollingInterval = 5;
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