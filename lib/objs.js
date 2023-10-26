module.exports = {
    states: {
        refresh: {
            type: 'state',
            common: {
                name: 'Refresh',
                type: 'state',
                role: 'button',
                read: true,
                write: true,
                desc: 'Refresh this Route now'
            }, native: {}
        },
        distance: {
            type: 'state',
            common: {
                name: 'Distance',
                role: 'value',
                desc: 'Distance from origin to destination',
                type: 'number',
                unit: 'm',
                read: true,
                write: false
            }
        },
        distanceText: {
            type: 'state',
            common: {
                role: 'text',
                name: 'Distance from origin to destination',
                type: 'string',
                read: true,
                write: false
            }
        },
        duration: {
            type: 'state',
            common: {
                name: 'Normal duration without Traffic',
                role: 'value',
                desc: 'Normal duration without Traffic',
                type: 'number',
                unit: 'sec',
                read: true,
                write: false
            }
        },
        durationText: {
            type: 'state',
            common: {
                role: 'text',
                name: 'Normal duration without Traffic',
                type: 'string',
                read: true,
                write: false
            }
        },
        durationTraffic: {
            type: 'state',
            common: {
                name: 'Duration with actual Traffic',
                role: 'value',
                desc: 'Travel duration with actual traffic',
                type: 'number',
                unit: 'sec',
                read: true,
                write: false
            }
        },
        durationTrafficText: {
            type: 'state',
            common: {
                role: 'text',
                name: 'Duration with actual Traffic',
                type: 'string',
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
                type: 'boolean',
                role: 'state',
                read: true,
                write: true,
                def: false,
                name: 'Alarm enabled'
            }, native: {}
        },
        arrivaltime: {
            type: 'state',
            common: {
                type: 'string',
                role: 'state',
                read: true,
                write: true,
                def: '07:30',
                name: 'Arrivaltime (HH:MM)'
            }, native: {}
        },
        bathtime: {
            type: 'state',
            common: {
                type: 'number',
                role: 'state',
                read: true,
                write: true,
                def: 45,
                name: 'Minutes between alarm and leaving the house'
            }, native: {}
        },
        triggered: {
            type: 'state',
            common: {
                type: 'boolean',
                role: 'state',
                read: true,
                write: false,
                def: false,
                name: 'True if alarm is triggered'
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