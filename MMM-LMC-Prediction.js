Module.register("MMM-LMC-Prediction", {
    defaults: {
        header: "MMM-LMC-Prediction",
        rec: true,
    },

    lastGesture: 'LEAP_MOTION_HAND_MISSING',
    gesture: 'LEAP_MOTION_HAND_MISSING',

    start: function () {
        Log.info("Start module: " + this.name);
        this.sendSocketNotification("SET_CONFIG", this.config);
    },

    getDom: function () {
        var wrapper = document.createElement('div');

        wrapper.id = 'MMM-LMC-Prediction';
        wrapper.className = 'leap-motion-prediction';

        return wrapper;
    },

    socketNotificationReceived: function (notification, payload) {
        var self = this;
        var timer = null;

        if (notification === 'LEAP_MOTION_GESTURE' && typeof payload === 'string' && payload !== this.lastGesture) {
            console.log(payload);
            this.sendNotification(payload);
            this.lastGesture = this.gesture;
            this.gesture = payload;

            clearTimeout(timer);
            timer = setTimeout(function () {
                self.sendNotification('LEAP_MOTION_HAND_MISSING');
                self.lastGesture = self.gesture;
                self.gesture = 'LEAP_MOTION_HAND_MISSING';
            }, 1000)
        }
    }
});
