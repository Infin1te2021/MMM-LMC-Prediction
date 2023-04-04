Module.register("MMM-LMC-Prediciton", {
	defaults:{
		rec: true,
		csvPath: false
	},

    currentPage: 0,
	lastGesture: 'LEAP_MOTION_HAND_MISSING',
	gesture: 'LEAP_MOTION_HAND_MISSING',

	start: function() {
		Log.info("Start module: " + this.name);
        this.sendSocketNotification("SET_CONFIG", this.config);
	},

	getStyles: function() {
		return ['MMM-Leap-Motion.css'];
	},

	getDom: function() {
		var wrapper = document.createElement('div');

		wrapper.id = 'leap-motion-prediction';
		wrapper.className = this.gesture.toLowerCase();

		return wrapper;
	},

	updateStatus: function() {
		document.getElementById('leap-motion-prediction').className = this.gesture.toLowerCase();
	},

	socketNotificationReceived: function (notification, payload) {
		var self = this;
		var timer = null;

		if (notification === 'LEAP_MOTION_GESTURE' && typeof payload === 'string' && payload !== this.lastGesture) {
			this.sendNotification(payload);
			this.lastGesture = this.gesture;
			this.gesture = payload;
			this.updateStatus();

			clearTimeout(timer);
			timer = setTimeout(function () {
				self.sendNotification('LEAP_MOTION_HAND_MISSING');
				self.lastGesture = self.gesture;
				self.gesture = 'LEAP_MOTION_HAND_MISSING';
				self.updateStatus();
			}, 1000)
		}
	}
})
