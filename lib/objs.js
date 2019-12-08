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
            type: "state",
            common: {
                name: "Distance",
                role: "value",
                desc: "Distance from origin to destination",
                type: "number",
                unit: "m",
                read: true,
                write: false
            }
        },
        distanceText: {
            type: "state",
            common: {
                role: "text",
                name: "Distance from origin to destination",
                type: "string",
                read: true,
                write: false
            }
        },
        duration: {
            type: "state",
            common: {
                name: "Normal duration without Traffic",
                role: "value",
                desc: "Normal duration without Traffic",
                type: "number",
                unit: "sec",
                read: true,
                write: false
            }
        },
        durationText: {
            type: "state",
            common: {
                role: "text",
                name: "Normal duration without Traffic",
                type: "string",
                read: true,
                write: false
            }
        },
        durationTraffic: {
            type: "state",
            common: {
                name: "Duration with actual Traffic",
                role: "value",
                desc: "Travel duration with actual traffic",
                type: "number",
                unit: "sec",
                read: true,
                write: false
            }
        },
        durationTrafficText: {
            type: "state",
            common: {
                role: "text",
                name: "Duration with actual Traffic",
                type: "string",
                read: true,
                write: false
            }
        }
    },
    objectArray: ['refresh', 'distance', 'distanceText', 'duration', 'durationText', 'durationTraffic', 'durationTrafficText'],
    alarm: {
        alarmMonday: {
            type: 'state',
            common: {
                type: 'boolean',
                role: 'state',
                read: true,
                write: true,
                def: false,
                desc: 'Alarm Monday enabled'
            }, native: {}
        },
        alarmTuesday: {
            type: 'state',
            common: {
                type: 'boolean',
                role: 'state',
                read: true,
                write: true,
                def: false,
                desc: 'Alarm Tuesday enabled'
            }, native: {}
        },
        alarmWednesday: {
            type: 'state',
            common: {
                type: 'boolean',
                role: 'state',
                read: true,
                write: true,
                def: false,
                desc: 'Alarm Wednesday enabled'
            }, native: {}
        },
        alarmThursday: {
            type: 'state',
            common: {
                type: 'boolean',
                role: 'state',
                read: true,
                write: true,
                def: false,
                desc: 'Alarm Thursday enabled'
            }, native: {}
        },
        alarmFriday: {
            type: 'state',
            common: {
                type: 'boolean',
                role: 'state',
                read: true,
                write: true,
                def: false,
                desc: 'Alarm Friday enabled'
            }, native: {}
        },
        alarmSaturday: {
            type: 'state',
            common: {
                type: 'boolean',
                role: 'state',
                read: true,
                write: true,
                def: false,
                desc: 'Alarm Saturday enabled'
            }, native: {}
        },
        alarmSunday: {
            type: 'state',
            common: {
                type: 'boolean',
                role: 'state',
                read: true,
                write: true,
                def: false,
                desc: 'Alarm Sunday enabled'
            }, native: {}
        },
    },
}