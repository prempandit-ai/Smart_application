# Smart Refrigerator Dashboard

An offline, browser-based simulation of the temperature monitoring and relay logic from an ESP32 MicroPython smart refrigerator project. It uses only HTML, CSS, vanilla JavaScript, Canvas, and the browser Web Audio API. It does not connect to an ESP32 or control a real refrigerator.

## Files

- `index.html` — dashboard structure and accessible controls
- `style.css` — responsive light/dark dashboard styling
- `script.js` — simulation state, control logic, event log, chart, and browser buzzer

## Open and run

1. In VS Code, choose **File → Open Folder…** and select the `smart-refrigerator-dashboard` folder.
2. Open `index.html` in File Explorer, or right-click it in VS Code and choose **Reveal in File Explorer** before opening it in Chrome or Edge.
3. The page can be opened directly using the `file://` URL. From PowerShell in this folder, run:

   ```powershell
   Start-Process .\index.html
   ```

No server, package installation, network access, or build step is required. The page and its local CSS/JavaScript files work together from the same folder. If a managed browser blocks opening a local file, open Chrome or Edge first and use **Ctrl+O** to select `index.html`.

## Use the dashboard

- **Start Simulation** begins the one-second update loop. **Pause** freezes the simulation timer and door-open duration. **Resume Simulation** continues from the paused state. **Reset** restores 6.0°C, cooling off, door closed, no active alarms, and a fresh history.
- Move the temperature slider or use **Increase** and **Decrease** to change the simulated sensor reading in 0.5°C steps. The cooling relay turns on above 8°C, turns off at or below 4°C, and retains its previous state between those thresholds.
- Use **Open refrigerator door** to start the door timer. The door alarm activates after 30 seconds while the simulation is running. Close the door to clear that alarm.
- Enable **Simulate sensor failure** to show a DHT22 error. The last valid temperature remains visible and drives the cooling logic; temperature adjustment is disabled until the failure is switched off. Missing samples appear as gaps in the history chart.
- The event log places the newest event first. **Clear log** removes its current entries.
- Use the sun button in the header to switch between light and dark themes.

## Buzzer and alarm demonstrations

Web browsers require a user gesture before they allow sound. Click **Start Simulation** or **Test buzzer** once to initialize/resume Web Audio. The simulated 1 kHz tone comes from the laptop's speakers; adjust **Volume** to set its level.

- **High-temperature alarm:** set the temperature to 16°C. The high-temperature alarm and buzzer activate. Return to 15°C or below to clear it.
- **Door-open alarm:** start the simulation, open the door, and wait 30 seconds. The door alarm activates; close the door to clear it.
- **Combined alarms:** set 16°C, open the door, and wait 30 seconds. Closing the door clears only the door alarm; the high-temperature alarm remains until temperature is 15°C or below.
- **Mute:** click **Mute** during an alarm. The visual warning remains active while audio is silenced. Click **Unmute** to resume the repeating alarm tone if the alarm condition remains active.
- **Sensor failure:** choose a valid temperature first, then turn on the sensor-failure switch. The last valid value is preserved and a sensor error is logged. Turn the switch off to restore readings.

## Simulation model and limitations

The displayed DHT22, door sensor, relay, and buzzer are simulated in JavaScript; the JavaScript interval models the main controller loop. The browser Web Audio API creates an oscillator and gain-controlled beep for audio alarms. The threshold panel includes the configured 2-second sensor retry delay for comparison with the MicroPython project; recovery in this demo is controlled by the sensor-failure switch so the error state can be demonstrated.

This project is a front-end simulation only. It has no Wi-Fi, API, database, persistence, or physical hardware integration. A reload returns to the initial 6.0°C state. Sound depends on browser audio support and the device's speaker volume. A browser that blocks local files can open the file with **Ctrl+O**; a local server is not otherwise needed.
