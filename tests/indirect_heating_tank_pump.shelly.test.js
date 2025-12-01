/**
 * @file Test suite for indirect_heating_tank_pump.shelly.js
 *
 * To run these tests, you would typically use a JavaScript testing framework
 * in a Node.js environment. For simplicity, this file can be run as-is
 * and will print test results to the console. It includes mocks for the
 * Shelly-specific APIs.
 */

// --- Mocks for Shelly Environment ---

// This object will hold the mock state and spies.
const mockState = {
  switchStatus: { output: false },
  temperatures: {},
  kvs: {},
  shellyCallLog: [],
  printLog: [],
  timer: null,
};

// Mock implementation of the global 'Shelly' object.
const Shelly = {
  getComponentStatus: function (component, id) {
    if (component === 'Switch' && id === 0) {
      return mockState.switchStatus;
    }
    if (component === 'Temperature') {
      if (mockState.temperatures[id]) {
        return mockState.temperatures[id];
      }
      throw new Error('Mock Error: Temperature sensor with id ' + id + ' not found.');
    }
    return {};
  },
  call: function (method, params, callback) {
    mockState.shellyCallLog.push({ method, params });
    if (method === 'KVS.Get' && params.key === KVS_CONFIG_KEY) {
      const value = mockState.kvs[params.key] || null;
      // The KVS.Get in init() is async, so we simulate that with a timeout.
      if (callback) setTimeout(() => callback({ value: value }, 0, null), 0);
    } else if (method === 'Switch.Set') {
      mockState.switchStatus.output = params.on;
      // For synchronous tests, we execute the callback immediately.
      if (callback) callback({ was_on: !params.on }, 0, null); // This is already synchronous
    }
  },
};

// Mock implementation of the global 'Timer' object.
const Timer = {
  set: function (timeout, repeat, callback) {
    mockState.timer = { timeout, repeat, callback };
    return 1; // Return a dummy timer ID.
  },
  clear: function() {
    mockState.timer = null;
  }
};

// Mock implementation of the global 'print' function.
global.print = function (message) {
  mockState.printLog.push(message);
  // console.log("PRINT: " + message); // Uncomment for debugging tests
};

// --- Test Runner Setup ---

let tests = [];
let currentTestName = '';

/**
 * @description Defines a new test case and adds it to the test suite.
 * @param {string} name The name of the test.
 * @param {function} fn The function that contains the test logic and assertions.
 */
function test(name, fn) {
  tests.push({ name, fn });
};

let beforeEachFn = () => {};
/**
 * @description Defines a function to run before each test.
 * @param {function} fn The setup function.
 */
function beforeEach(fn) {
  beforeEachFn = fn;
}

/**
 * @description Assertion helper that checks for strict equality.
 * Throws an error if the actual value is not strictly equal to the expected value.
 * @param {*} expected The expected value.
 * @param {*} actual The actual value to check.
 * @param {string} message The message to display if the assertion fails.
 */
function assertEquals(expected, actual, message) {
  if (expected !== actual) {
    throw new Error(`'${currentTestName}' failed: ${message}. Expected '${expected}', but got '${actual}'.`);
  }
}

/**
 * @description Assertion helper that checks if a value is true.
 * Throws an error if the actual value is not strictly true.
 * @param {boolean} actual The value to check.
 * @param {string} message The message to display if the assertion fails.
 */
function assertTrue(actual, message) {
  assertEquals(true, actual, message);
}

/**
 * @description A simple synchronous test runner.
 * It iterates through all registered tests, executes them, and reports the results.
 * It resets the mock state before each test.
 * Note: This runner does not handle asynchronous tests.
 */
function runTests() {
  console.log("Running tests...");
  const failedTests = [];
  tests.forEach(t => {
    currentTestName = t.name;
    // Reset mock state before each test
    mockState.switchStatus = { output: false };
    mockState.temperatures = {};
    mockState.kvs = {};
    mockState.shellyCallLog = [];
    mockState.printLog = [];
    mockState.timer = null;
    try {
      t.fn();
      console.log(`✅ ${t.name}`);
    } catch (e) {
      failedTests.push({ name: t.name, error: e.message });
      console.error(`❌ ${t.name}`);
      console.error(e);
    }
  });

  if (failedTests.length > 0) {
    console.error(`\n${failedTests.length} test(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll tests passed!");
    process.exit(0);
  }
}

// --- Loading The Script Under Test ---

// To test the script, we need to load its content. In a real test environment (like Jest),
// you would import it. Here, we'll use Node.js's 'fs' module to read it.
const fs = require('fs');
const path = require('path');

// We need to trick the script into thinking it's in the Shelly environment.
// We can do this by wrapping its content in a function and calling it.
const scriptContent = fs.readFileSync(path.join(__dirname, '../scripts', 'indirect_heating_tank_pump.shelly.js'), 'utf8');

// This is a bit of a hack to make the script testable. It replaces the final `init()` call
// with an export so we can call it from our tests.
const scriptToEvaluate = scriptContent.replace('init(); // Start the initialization process.', 'module.exports = { init, checkAndAdjust, startWaterPump, stopWaterPump, waterPumpRunning, debugLog, DEFAULT_CONFIG, KVS_CONFIG_KEY, getCONFIG: () => CONFIG, setCONFIG: (c) => { CONFIG = c; } };');

// By using 'eval', we execute the script in the current scope where our mocks are defined.
// Caution: 'eval' can be dangerous if used with untrusted code.
const { init, checkAndAdjust, startWaterPump, stopWaterPump, waterPumpRunning, debugLog, DEFAULT_CONFIG, KVS_CONFIG_KEY, getCONFIG, setCONFIG } = eval(`(function(Shelly, Timer, module, global) { ${scriptToEvaluate}; return module.exports; })`)(Shelly, Timer, { exports: {} }, global);

// Enable debugging for all tests by default.
DEFAULT_CONFIG.debuggingOn = true;

// --- Test Cases ---

beforeEach(() => {
  // This function will run before each test, resetting the state.
  mockState.switchStatus = { output: false };
  mockState.temperatures = {};
  mockState.kvs = {};
  mockState.shellyCallLog = [];
  mockState.printLog = [];
  mockState.timer = null;
});

test('waterPumpRunning should return correct pump status', () => {
  mockState.switchStatus.output = true;
  assertTrue(waterPumpRunning(), 'Should return true when pump is on');

  mockState.switchStatus.output = false;
  assertEquals(false, waterPumpRunning(), 'Should return false when pump is off');
});

test('startWaterPump should turn on the switch', () => {
  mockState.switchStatus.output = false;
  startWaterPump();
  assertTrue(mockState.switchStatus.output, 'Switch output should be true');
  assertEquals(1, mockState.shellyCallLog.length, 'Shelly.call should be invoked once');
  assertEquals('Switch.Set', mockState.shellyCallLog[0].method, 'Should call Switch.Set');
  assertTrue(mockState.shellyCallLog[0].params.on, 'Switch should be set to on');
});

test('stopWaterPump should turn off the switch', () => {
  mockState.switchStatus.output = true;
  stopWaterPump();
  assertEquals(false, mockState.switchStatus.output, 'Switch output should be false');
  assertEquals(1, mockState.shellyCallLog.length, 'Shelly.call should be invoked once');
  assertEquals('Switch.Set', mockState.shellyCallLog[0].method, 'Should call Switch.Set');
  assertEquals(false, mockState.shellyCallLog[0].params.on, 'Switch should be set to off');
});

test('checkAndAdjust should start pump when conditions are met', () => {
  // Setup: Pump is off, heating source is hot enough.
  mockState.switchStatus.output = false;
  mockState.temperatures = {
    [DEFAULT_CONFIG.hotWaterTemperatureID]: { tC: 40 },
    [DEFAULT_CONFIG.heatingSourceTemperatureID]: { tC: 48 }, // 48 >= 40 + 7
  };

  // Manually set the script's internal config for this synchronous test.
  setCONFIG(DEFAULT_CONFIG);

  checkAndAdjust(DEFAULT_CONFIG);

  assertTrue(mockState.switchStatus.output, 'Pump should be started');
  assertTrue(mockState.printLog.some(m => m.includes('Heating source is hot enough')), 'Should print starting message');
});

test('checkAndAdjust should stop pump when max temp is reached', () => {
  // Setup: Pump is on, tank temperature is at max.
  mockState.switchStatus.output = true;
  mockState.temperatures = {
    [DEFAULT_CONFIG.hotWaterTemperatureID]: { tC: 65 }, // 65 >= 65
    [DEFAULT_CONFIG.heatingSourceTemperatureID]: { tC: 80 },
  };

  // Manually set the script's internal config for this synchronous test.
  setCONFIG(DEFAULT_CONFIG);

  checkAndAdjust(DEFAULT_CONFIG);

  assertEquals(false, mockState.switchStatus.output, 'Pump should be stopped');
  assertTrue(mockState.printLog.some(m => m.includes('maximum temperature')), 'Should print max temp message');
});

test('checkAndAdjust should stop pump for efficiency', () => {
  // Setup: Pump is on, temperature difference is too low.
  mockState.switchStatus.output = true;
  mockState.temperatures = {
    [DEFAULT_CONFIG.hotWaterTemperatureID]: { tC: 50 },
    [DEFAULT_CONFIG.heatingSourceTemperatureID]: { tC: 54 }, // 54 < 50 + 5
  };

  // Manually set the script's internal config for this synchronous test.
  setCONFIG(DEFAULT_CONFIG);

  checkAndAdjust(DEFAULT_CONFIG);

  assertEquals(false, mockState.switchStatus.output, 'Pump should be stopped for efficiency');
  assertTrue(mockState.printLog.some(m => m.includes('Temperature difference is too low')), 'Should print efficiency message');
});

test('checkAndAdjust should do nothing if conditions are not met', () => {
  // Setup: Pump is off, heating source is not hot enough.
  mockState.switchStatus.output = false;
  mockState.temperatures = {
    [DEFAULT_CONFIG.hotWaterTemperatureID]: { tC: 40 },
    [DEFAULT_CONFIG.heatingSourceTemperatureID]: { tC: 45 }, // 45 < 40 + 7
  };

  // Manually set the script's internal config for this synchronous test.
  setCONFIG(DEFAULT_CONFIG);

  checkAndAdjust(DEFAULT_CONFIG);

  assertEquals(false, mockState.switchStatus.output, 'Pump should remain off');
  assertEquals(0, mockState.shellyCallLog.length, 'Shelly.call should not be invoked');
});

test('init should load default config if KVS is empty', (done) => {
  // Clear the internal config for this async test so init() can set it.
  setCONFIG({});

  init();

  // The init function is asynchronous because of Shelly.call.
  // We need to wait for the callback to execute.
  setTimeout(() => {
    try {
      assertEquals(DEFAULT_CONFIG.maxWaterTemp, getCONFIG().maxWaterTemp, 'Should use default maxWaterTemp');
      assertTrue(mockState.printLog.some(m => m.includes('No custom configuration found')), 'Should print default settings message');
      // Check that run() was called
      assertTrue(mockState.shellyCallLog.some(c => c.method === 'Switch.Set'), 'run() should have been called, stopping the pump');
      assertTrue(mockState.timer !== null, 'A timer should have been set');
      done();
    } catch (e) {
      done(e);
    }
  }, 10);
});

test('init should load and merge custom config from KVS', (done) => {
  // Clear the internal config for this async test so init() can set it.
  setCONFIG({});

  const customConfig = { maxWaterTemp: 80, scanInterval: 60 };
  mockState.kvs[KVS_CONFIG_KEY] = JSON.stringify(customConfig);

  init();

  setTimeout(() => {
    try {
      assertEquals(80, getCONFIG().maxWaterTemp, 'Should use custom maxWaterTemp from KVS');
      assertEquals(60, getCONFIG().scanInterval, 'Should use custom scanInterval from KVS');
      assertEquals(DEFAULT_CONFIG.waterPumpHysteresis, getCONFIG().waterPumpHysteresis, 'Should retain default for unspecified values');
      assertTrue(mockState.printLog.some(m => m.includes('Custom configuration loaded')), 'Should print custom config loaded message');
      done();
    } catch (e) {
      done(e);
    }
  }, 10);
});

// --- Run Tests ---

// This part is adapted for Node.js environment to run the tests.
// A simple async handling for tests with callbacks.
/**
 * @description A simple test runner that can handle both synchronous and asynchronous tests.
 * Asynchronous tests are expected to take a 'done' callback.
 * It iterates through all registered tests, executes them, and reports the results.
 */
function runAsyncTests() {
    let promise = Promise.resolve();
    const failedTests = [];

    tests.forEach(t => {
        promise = promise.then(() => new Promise((resolve, reject) => {
            currentTestName = t.name;
            beforeEachFn(); // Run the setup function.

            try {
                // Handle async tests (with a 'done' callback)
                if (t.fn.length > 0) {
                    t.fn((err) => {
                        if (err) return reject(err);
                        console.log(`✅ ${t.name}`);
                        resolve();
                    });
                } else { // Handle sync tests
                    t.fn();
                    console.log(`✅ ${t.name}`);
                    resolve();
                }
            } catch (e) {
                reject(e);
            }
        }));
    });

    promise.then(() => {
        console.log("\nAll tests passed!");
    }).catch((error) => {
        console.error(`❌ '${currentTestName}' failed`);
        console.error(error);
        process.exit(1);
    });
}

// This is a simplified runner. For a real project, consider Jest or Mocha.
// runTests(); // This is for a purely synchronous world.

// Since some tests are async (init), we need a slightly more complex runner.
console.log("Running tests for indirect_heating_tank_pump.shelly.js...");
runAsyncTests();