const NodeHelper = require("node_helper");
var Cylon = require('cylon');
const Log = require("../../js/logger.js");
const tf = require('@tensorflow/tfjs-node-gpu');
const fs = require('fs');
const fastCsv = require('fast-csv');

module.exports = NodeHelper.create({
	start: function () {
		Log.log("Starting node helper for: " + this.name);
		this.config = null;
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "SET_CONFIG" && typeof payload === 'object') {
			this.config = payload;
			var self = this;

			var handDetected = false;
			var grabStrengthDetected = false;
			var startTime = 0;
			var fingersData = [];
			var recordStatus = false;
			var secCount = true;


			Cylon.robot({
				connections: {
					leapmotion: {
						adaptor: 'leapmotion'
					}
				},

				devices: {
					leapmotion: {
						driver: 'leapmotion'
					}
				},

				work: function (device) {

					device.leapmotion.on('frame', function (frame) {

						var hands = frame.hands;
						// When the hand disappeared but finger Record has some value, which means that we need to do data processing and prediction
						if (hands.length === 0) {

							var numRows = fingersData.length;
							if (numRows > 0 && numRows < 80) {
								Log.log("Not enough data rows, please record again");
								fingersData = [];
								return;
							}
							else if (numRows >= 80 && numRows < 100) {
								Log.log("Repeating last row to reach 100");
								var lastRow = fingersData[numRows - 1];
								for (var i = numRows; i < 100; i++) {
									fingersData.push(lastRow);
									return
								}
								doPredictionForRealTimeRecord(fingersData)
							}
							else if (numRows >= 101) {
								Log.log("Trimming redundant rows if applicable");
								fingersData = fingersData.slice(numRows - 100, numRows);
								doPredictionForRealTimeRecord(fingersData)
								return

							}

							// If the hand is detected before but now it disappears, hand is disapppeared. Reset all the global variables.
							else if (handDetected === true) {
								Log.log("Hand disappeared");
								handDetected = false;
								grabStrengthDetected = false;
								recordStatus = false;
								secCount = true;
								// Log.log("Fingers data:", fingersData);
								fingersData = [];
							}
							recordStatus = false
						}


						hands.forEach(function (hand) {

							if (handDetected === false && recordStatus === false) {
								Log.log("Hand detected");
								handDetected = true;
							}

							if (hand.grabStrength >= 0.85 && grabStrengthDetected === false) {
								Log.log("Grab strength detected");
								grabStrengthDetected = true;
								startTime = new Date().getTime();
							}

							if (grabStrengthDetected === true && secCount === true) {

								var currentTime = new Date().getTime();

								if (currentTime - startTime >= 2000) {
									Log.log("Grab strength sustained for 2 seconds");
									secCount = false;
									async function countdown() {
										var count = 3;
										Log.log("Recording will start in:");
										await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
										for (let i = count; i > 0; i--) {
											Log.log(i);
											await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
										}
										Log.log("Start recording");
										recordStatus = true;
									}
									countdown();
								}
							}

							if (hand.grabStrength < 0.5 && grabStrengthDetected === true && recordStatus === false) {

								Log.log("Grab released");
								grabStrengthDetected = false;
								//    handDetected = false;
							}

							if (recordStatus === true) {

								var pointableString = "";

								for (var i = 0; i < frame.pointables.length; i++) {
									var pointable = frame.pointables[i];
									poinTable = []
									pointableString += pointable.tipPosition[0].toString() + ',' + pointable.tipPosition[1].toString() + ',' + pointable.tipPosition[2].toString() + ','
									var speed = pointable.tipVelocity.toString() + ','
									pointableString += speed
								};

								//Remove the last comma
								poinTable.push(pointableString.slice(0, -1));
								//Split the string into an array of strings and push to fingersData array
								poinTableSplits = poinTable[0].split(',')
								//Map elements to float
								poinTableMapping = poinTableSplits.map(str => parseFloat(str))
								//Push the final result to fingersData
								fingersData.push(poinTableMapping);

								if (handDetected = false) {
									recordStatus = false;
									return
								}
								//Set a lenth limitation
								if (fingersData.length > 200) {
									recordStatus = false;
									return
								};
								return fingersData
							}
						});
					});
				}
			}).start();
		}
	}
});


const gesture = ['Swipe_Left', 'Swipe_Right', 'Push', 'Clockwise-Circle', 'Anti-Clockwise-Circle'];
const prob_bound = 0.3;

async function doPredictionForRealTimeRecord(data) {

	var self = this;
	var inputData = tf.tensor(data)
	var reshapedData = tf.reshape(inputData, [1, 100, 30]);

	const handler = tf.io.fileSystem('tfjs_files/model.json');
	const model = await tf.loadLayersModel(handler);
	var result = model.predict(reshapedData);

	var Argmax = tf.argMax(tf.tensor1d(result.dataSync()).dataSync());

	if (result.dataSync()[0] >= prob_bound || result.dataSync()[1] >= prob_bound || result.dataSync()[2] >= prob_bound || result.dataSync()[3] >= prob_bound || result.dataSync()[4] >= prob_bound) {

		predResult = gesture[Argmax.dataSync()];

		if (predResult === gesture[0]) {
			self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_SWIPE_LEFT');
		}
		else if (predResult === gesture[1]) {
			self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_SWIPE_RIGHT');
		}
		else if (predResult === gesture[2]){
			self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_SWIPE_PUSH');
		}
		else if (predResult === gesture[3]){
			self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_SWIPE_CLK_CIR');
		}
		else if (predResult === gesture[4]){
			self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_SWIPE_ACLK_CIR');
		}
	} else {
		Log.log("try again");
	}
}
