/**
 * @file Script for operating an electric pump for an indirect-heating tank
 * depending on the temperature difference of a heating water and water in the tank.
 * 
 * This script uses two digital thermomoters DS18B20 connected to Shelly Plus Add-on
 * and one Shelly Plus 1PM for operating the pump.
 * More at https://shelly-api-docs.shelly.cloud/gen2/Addons/ShellySensorAddon
 */

/**
 * The key used to store and retrieve custom configuration from the Shelly Key-Value Store.
 * You can set your own values in KVS using Debug -> RPC console in your device,
 * entering the following command and pressing [Send]
 * 
 * {
 *   "method": "KVS.Set",
 *   "params": {
 *     "key": "indirect_heating_config",
 *     "value": "{\"hotWaterTemperatureID\": 102, \"maxWaterTemp\": 70, \"debuggingOn\": true}"
 *   }
 * }
 * 
 * See https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/KVS
 */
const KVS_CONFIG_KEY = "indirect_heating_config";

const DEFAULT_CONFIG = {
  // secs, this will run a timer for every 30 seconds, that will fetch the voltage
  scanInterval: 30,
  // The ID of the thermometer for the water in the storage tank.
  hotWaterTemperatureID: 100,
  // The ID of the thermometer for the heating source (e.g., boiler, solar).
  heatingSourceTemperatureID: 101,
  // The water pump must not run if the temp is reached.
  maxWaterTemp: 65,
  // The water pump is waiting for this temperature difference.
  waterPumpHysteresis: 7,
  // Stop the pump when it's not efficient anymore.
  waterPumpStopDifference: 5,
  // Set to true to enable detailed logging.
  debuggingOn: false,
};

// This will hold the active configuration, merged from defaults and KVS.
let CONFIG = {};

/**
 * @description Prints a message to the console only if debugging is enabled in the config.
 * @param {string} message The message to log.
 */
function debugLog(message) {
  if (CONFIG.debuggingOn) {
    print(message);
  }
}
/**
 * @returns {boolean} Whether the water pump switch is enabled.
 */
function waterPumpRunning() {
  return Shelly.getComponentStatus('Switch', 0).output;
}

/**
 * @description Starts the water pump if it is not already running.
 * It calls the Shelly RPC to turn the switch on.
 */
function startWaterPump() {
  Shelly.call(
    "Switch.Set",
    { id: 0, on: true },
    function (result, error_code, error_message) {
      if (error_code !== 0) {
        debugLog("Error starting pump: " + error_message);
        return;
      }
      debugLog("Water pump was started successfully.");
    }
  );
}

/**
 * @description Stops the water pump if it is currently running.
 * It calls the Shelly RPC to turn the switch off.
 */
function stopWaterPump() {
  Shelly.call(
    "Switch.Set",
    { id: 0, on: false },
    function (result, error_code, error_message) {
      if (error_code !== 0) {
        debugLog("Error stopping pump: " + error_message);
        return;
      }
      debugLog("Water pump was stopped successfully.");
    }
  );
}

/**
 * @description Core logic function that is executed periodically by the timer.
 * It fetches the latest temperatures from the sensors, evaluates the heating logic
 * based on the CONFIG settings, and calls startWaterPump() or stopWaterPump()
 * accordingly. It also handles potential errors during sensor reads.
 */
function checkAndAdjust(config) {
  try {
    let hotWaterTemperature = Shelly.getComponentStatus('Temperature', config.hotWaterTemperatureID).tC;
    let heatingSourceTemperature = Shelly.getComponentStatus('Temperature', config.heatingSourceTemperatureID).tC;

    debugLog("Storage Tank Temp: " + hotWaterTemperature + "°C, Heating Source Temp: " + heatingSourceTemperature + "°C");

    // Stop Condition 1: Maximum temperature reached.
    if (hotWaterTemperature >= config.maxWaterTemp && waterPumpRunning()) {
      debugLog("Storage tank at maximum temperature (" + hotWaterTemperature + "°C), stopping pump...");
      stopWaterPump();
    // Stop Condition 2: Inefficient temperature difference.
    } else if (heatingSourceTemperature <= (hotWaterTemperature + config.waterPumpStopDifference) && waterPumpRunning()) {
      debugLog("Temperature difference is too low, stopping pump for efficiency...");
      stopWaterPump();
    // Start Condition: Heating source is sufficiently hotter than the tank.
    } else if (hotWaterTemperature < config.maxWaterTemp && heatingSourceTemperature >= (hotWaterTemperature + config.waterPumpHysteresis) && !waterPumpRunning()) {
      debugLog("Heating source is hot enough, starting pump...");
      startWaterPump();
    }
  } catch (err) {
    debugLog("Error: " + err);
  }
}

// This function contains the logic that runs after configuration is loaded.
function run() {
  stopWaterPump(); // Initialize in a known state.
  checkAndAdjust(CONFIG); // Run a check immediately.
  Timer.set(CONFIG.scanInterval * 1000, true, () => checkAndAdjust(CONFIG)); // Start the recurring timer.
}

/**
 * @description Initializes the script on startup.
 * It ensures the pump is stopped initially, runs a single check immediately,
 * and then sets up a recurring timer to periodically run the checkAndAdjust
 * function based on the scanInterval in CONFIG.
 */
function init() {
  // Try to load configuration from the Key-Value Store.
  Shelly.call(
    "KVS.Get",
    { key: KVS_CONFIG_KEY },
    function (result, error_code, error_message) {
      let loadedConfig = {};
      if (error_code === 0 && result.value !== null) {
        // Successfully loaded config from KVS
        try {
          loadedConfig = JSON.parse(result.value);
        } catch (e) {
          // Error parsing, loadedConfig remains empty, defaults will be used.
        }
      }

      // Merge the loaded configuration over the defaults.
      // This allows users to only override the values they need to.
      CONFIG = Object.assign({}, DEFAULT_CONFIG, loadedConfig);
      Object.freeze(CONFIG); // Make the final config immutable.

      // Now that CONFIG is set, we can safely log the outcome.
      if (Object.keys(loadedConfig).length > 0) {
        debugLog("Custom configuration loaded from KVS.");
      } else {
        debugLog("No custom configuration found in KVS. Using default settings.");
      }

      // Now that config is loaded, proceed with script initialization.
      run();
    }
  );
}

init(); // Start the initialization process.
