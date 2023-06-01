const NodeHelper = require("node_helper");
var Cylon = require('cylon');
const Log = require("../../js/logger.js");
const tf = require('@tensorflow/tfjs-node-gpu');
const fs = require('fs');
const fastCsv = require('fast-csv');

const gesture = ['Swipe_Left', 'Swipe_Right', 'Push', 'Clockwise-Circle', 'Anti-Clockwise-Circle', 'Up', 'Down'];
const prob_bound = 0.4;

module.exports = NodeHelper.create({
	start: function () {
		Log.log("Starting node helper for: " + this.name);
		this.config = null;
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "SET_CONFIG" && typeof payload === 'object') {
			this.config = payload;
			var self = this;
            var lastGesture = '' ;
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
                                console.log("Not enough data rows, please record again");
                                fingersData = [];
                                return;
                            }
                            else if (numRows >= 80 && numRows < 100) {
                                console.log("Repeating last row to reach 100");
                                var lastRow = fingersData[numRows - 1];
                                for (var i = numRows; i < 100; i++) {
                                    fingersData.push(lastRow);
                                }
                                self.doPredictionForRealTimeRecord(fingersData)
                            }
                            else if (numRows >= 101) {
                                console.log("Trimming redundant rows if applicable");
                                fingersData = fingersData.slice(numRows - 100, numRows);
                                self.doPredictionForRealTimeRecord(fingersData)
                                return
                            }

                            // If the hand is detected before but now it disappears, hand is disapppeared. Reset all the global variables.
                            else if (handDetected === true) {
                                console.log("Hand disappeared");
                                handDetected = false;
                                grabStrengthDetected = false;
                                recordStatus = false;
                                secCount = true;
                                lastGesture = 'hand_gone';
                                self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_HAND_MISSING');
                                fingersData = [];
                            }
                            recordStatus = false
                        }


                        hands.forEach(function (hand) {

                            if (handDetected === false && recordStatus === false) {
                                console.log("Hand detected");
                                handDetected = true;
                                lastGesture = 'hand_present';
                                self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_HAND_DETECTED');
                            }

                            if (hand.grabStrength >= 0.85 && grabStrengthDetected === false) {
                                console.log("Grab fully detected");
                                grabStrengthDetected = true;
                                startTime = new Date().getTime();
                            }

                            if (grabStrengthDetected === true && secCount === true) {

                                var currentTime = new Date().getTime();

                                if (currentTime - startTime >= 1000) {
                                    console.log("Grab strength sustained for 2 seconds");
                                    secCount = false;
                                    async function countdown() {
                                        var count = 1;
                                        console.log("Recording will start in:");
                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                        for (let i = count; i > 0; i--) {
                                            console.log(i);
                                            await new Promise(resolve => setTimeout(resolve, 1000));
                                        }
                                        console.log("Start recording");
                                        recordStatus = true;
                                    }
                                    countdown();
                                }
                            }

                            if (hand.grabStrength < 0.5 && grabStrengthDetected === true && recordStatus === false) {

                                console.log("Grab released");
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

                                if (handDetected === false) {
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
    },

	doPredictionForRealTimeRecord: async function (data) {
        var self = this;
        var inputData = tf.tensor(data)
        var reshapedData = tf.reshape(inputData, [1, 100, 30]);

        const handler = tf.io.fileSystem('modules/MMM-LMC-Prediction/tfjs_file2/model.json');
        const model = await tf.loadLayersModel(handler);
        var result = model.predict(reshapedData);

        var Argmax = tf.argMax(tf.tensor1d(result.dataSync()).dataSync());
		console.log(result.dataSync());
		if (result.dataSync()[0] >= prob_bound || result.dataSync()[1] >= prob_bound || result.dataSync()[2] >= prob_bound || result.dataSync()[3] >= prob_bound ||result.dataSync()[4] >= prob_bound ||result.dataSync()[5] >= prob_bound ||result.dataSync()[6] >= prob_bound){

			predResult = gesture[Argmax.dataSync()];
			if (predResult === gesture[0]) {
				// Swipe left -> To previous page
				console.log(gesture[0]);
				self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_SWIPE_LEFT');
			}
			else if (predResult === gesture[1]) {
				// Swipe right -> To next page
				console.log(gesture[1]);
				self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_SWIPE_RIGHT');
			}
			else if (predResult === gesture[2]){
				console.log(gesture[2]);
				self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_PUSH');
			}
			else if (predResult === gesture[3]){
				// Clockwise circle -> To the first page
				console.log(gesture[3]);
				self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_CLK_CIR');
			}
			else if (predResult === gesture[4]){
				// Anti-clockwise circle -> To the last page
				console.log(gesture[4]);
				self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_ACLK_CIR');
			}
			else if (predResult === gesture[5]){
				// Swipe up -> Display the next day weather forecast
				console.log(gesture[6]);
				self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_UP');
			}
			else if (predResult === gesture[6]){
				console.log(gesture[5]);
				self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_DOWN');
			}
			else if (predResult === gesture[7]){
				console.log(gesture[7]);
				self.sendSocketNotification('LEAP_MOTION_GESTURE', 'LEAP_MOTION_GRAB');
			}
		}else{
			console.log("try again");
		}
	}
});
