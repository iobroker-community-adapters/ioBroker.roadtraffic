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
                unit: "km",
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
        }
    },
    objectArray: ['refresh', 'distance', 'duration', 'durationTraffic']
};