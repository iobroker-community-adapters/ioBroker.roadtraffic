module.exports = {
    states: {
        refresh: {
            type: 'state',
            common: {
                name: 'Refresh',
                desc: 'Refresh this route now',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true
            }, native: {}
        },
        distance: {
            type: 'state',
            common: {
                name: 'Distance',
                desc: 'Distance from origin to destination',
                type: 'number',
                role: 'value.distance',
                unit: 'm',
                read: true,
                write: false
            }
        },
        distanceText: {
            type: 'state',
            common: {
                name: 'Distance as text',
                desc: 'Distance from origin to destination',
                type: 'string',
                role: 'text',
                read: true,
                write: false
            }
        },
        duration: {
            type: 'state',
            common: {
                name: 'Normal duration without Traffic',
                desc: 'Normal duration without Traffic',
                type: 'number',
                role: 'value',
                unit: 's',
                read: true,
                write: false
            }
        },
        durationText: {
            type: 'state',
            common: {
                name: 'Normal duration without Traffic',
                desc: 'Normal duration without Traffic',
                type: 'string',
                role: 'text',
                read: true,
                write: false
            }
        },
        durationTraffic: {
            type: 'state',
            common: {
                name: 'Duration with actual Traffic',
                desc: 'Travel duration with actual traffic',
                type: 'number',
                role: 'value',
                unit: 's',
                read: true,
                write: false
            }
        },
        durationTrafficText: {
            type: 'state',
            common: {
                name: 'Duration with actual Traffic',
                desc: 'Duration with actual Traffic',
                type: 'string',
                role: 'text',
                read: true,
                write: false
            }
        }
    },
    statesArray: ['refresh', 'distance', 'distanceText', 'duration', 'durationText', 'durationTraffic', 'durationTrafficText'],
    alarm: {
        enabled: {
            type: 'state',
            common: {
                name: 'Alarm enabled',
                type: 'boolean',
                role: 'switch.enable',
                read: true,
                write: true,
                def: false,
            }, native: {}
        },
        arrivaltime: {
            type: 'state',
            common: {
                name: 'Arrivaltime (HH:MM)',
                type: 'string',
                role: 'state',
                read: true,
                write: true,
                def: '07:30',
            }, native: {}
        },
        bathtime: {
            type: 'state',
            common: {
                name: 'Minutes between alarm and leaving the house',
                type: 'number',
                role: 'state',
                read: true,
                write: true,
                def: 45,
            }, native: {}
        },
        triggered: {
            type: 'state',
            common: {
                name: 'True if alarm is triggered',
                type: 'boolean',
                role: 'sensor.alarm',
                read: true,
                write: false,
                def: false,
            }, native: {}
        }
    },
    alarmArray: ['enabled', 'arrivaltime', 'bathtime', 'triggered'],
    channels: {
        route: {
            type: 'channel',
            common: {
                name: 'Routeinformations',
                desc: 'Informations about the route'
            },
            native: {
            }
        },
        '1-Monday': {
            type: 'channel',
            common: {
                name: 'Alarm Monday',
                desc: 'Alarmsettings for mondays'
            },
            native: {
            }
        },
        '2-Tuesday': {
            type: 'channel',
            common: {
                name: 'Alarm Tuesday',
                desc: 'Alarmsettings for tuesdays'
            },
            native: {
            }
        },
        '3-Wednesday': {
            type: 'channel',
            common: {
                name: 'Alarm Wednesday',
                desc: 'Alarmsettings for wednesdays'
            },
            native: {
            }
        },
        '4-Thursday': {
            type: 'channel',
            common: {
                name: 'Alarm Thursday',
                desc: 'Alarmsettings for thursdays'
            },
            native: {
            }
        },
        '5-Friday': {
            type: 'channel',
            common: {
                name: 'Alarm Friday',
                desc: 'Alarmsettings for fridays'
            },
            native: {
            }
        },
        '6-Saturday': {
            type: 'channel',
            common: {
                name: 'Alarm Saturday',
                desc: 'Alarmsettings for saturdays'
            },
            native: {
            }
        },
        '7-Sunday': {
            type: 'channel',
            common: {
                name: 'Alarm Sunday',
                desc: 'Alarmsettings for sundays'
            },
            native: {
            }
        }
    },
    channelsArray: ['route', '1-Monday', '2-Tuesday', '3-Wednesday', '4-Thursday', '5-Friday', '6-Saturday', '7-Sunday'],
    daysArray: ['1-Monday', '2-Tuesday', '3-Wednesday', '4-Thursday', '5-Friday', '6-Saturday', '7-Sunday']
};