(() => {
  "use strict";

  const TEMP_ON_THRESHOLD = 8;
  const TEMP_OFF_THRESHOLD = 4;
  const TEMP_HIGH_ALARM = 15;
  const DOOR_ALARM_MS = 30_000;
  const UPDATE_INTERVAL_MS = 1_000;
  const MAX_LOG_ENTRIES = 200;
  const MAX_HISTORY_POINTS = 120;
  const INITIAL_TEMPERATURE = 6;

  const elements = {
    statusBadge: document.querySelector(".simulation-badge"),
    simulationStatus: document.getElementById("simulation-status"),
    startButton: document.getElementById("start-button"),
    startLabel: document.getElementById("start-label"),
    pauseButton: document.getElementById("pause-button"),
    resetButton: document.getElementById("reset-button"),
    summaryTemperature: document.getElementById("summary-temperature"),
    temperatureSummaryCard: document.querySelector(".temperature-summary"),
    temperatureRangeIndicator: document.getElementById("temperature-range-indicator"),
    temperatureStateLabel: document.getElementById("temperature-state-label"),
    temperatureWarning: document.getElementById("temperature-warning"),
    temperatureWarningText: document.getElementById("temperature-warning-text"),
    miniMeterFill: document.getElementById("mini-meter-fill"),
    coolingCard: document.querySelector(".summary-card:nth-child(2)"),
    coolingState: document.getElementById("cooling-state"),
    coolingDescription: document.getElementById("cooling-description"),
    relayOutput: document.getElementById("relay-output"),
    doorCard: document.querySelector(".summary-card:nth-child(3)"),
    doorState: document.getElementById("door-state"),
    doorDuration: document.getElementById("door-duration"),
    doorSummaryNote: document.getElementById("door-summary-note"),
    buzzerCard: document.getElementById("buzzer-card"),
    buzzerState: document.getElementById("buzzer-state"),
    muteState: document.getElementById("mute-state"),
    alarmReason: document.getElementById("alarm-reason"),
    audioState: document.getElementById("audio-state"),
    alarmCount: document.getElementById("alarm-count"),
    gaugeProgress: document.getElementById("gauge-progress"),
    gaugeTemperature: document.getElementById("gauge-temperature"),
    temperatureContext: document.getElementById("temperature-context"),
    fridgeBody: document.getElementById("fridge-body"),
    fridgeCaptionText: document.getElementById("fridge-caption-text"),
    doorVisualDot: document.getElementById("door-visual-dot"),
    doorToggle: document.getElementById("door-toggle"),
    temperatureSlider: document.getElementById("temperature-slider"),
    temperatureOutput: document.getElementById("temperature-output"),
    decreaseTemperature: document.getElementById("decrease-temperature"),
    increaseTemperature: document.getElementById("increase-temperature"),
    sensorFailureToggle: document.getElementById("sensor-failure-toggle"),
    sensorPill: document.getElementById("sensor-pill"),
    sensorLabel: document.getElementById("sensor-label"),
    sensorError: document.getElementById("sensor-error"),
    chartCanvas: document.getElementById("temperature-chart"),
    chartCurrentTemperature: document.getElementById("chart-current-temperature"),
    chartReadingCaption: document.getElementById("chart-reading-caption"),
    chartFootnote: document.getElementById("chart-footnote"),
    volumeSlider: document.getElementById("volume-slider"),
    volumeOutput: document.getElementById("volume-output"),
    testBuzzer: document.getElementById("test-buzzer"),
    muteToggle: document.getElementById("mute-toggle"),
    muteLabel: document.getElementById("mute-label"),
    alarmBadge: document.getElementById("alarm-badge"),
    alarmStateNote: document.getElementById("alarm-state-note"),
    clearLog: document.getElementById("clear-log"),
    eventLog: document.getElementById("event-log"),
    themeToggle: document.getElementById("theme-toggle"),
  };

  const state = {
    temperature: INITIAL_TEMPERATURE,
    cooling: false,
    doorOpen: false,
    doorOpenedAt: null,
    doorAlarm: false,
    temperatureAlarm: false,
    reportedBuzzerActive: false,
    sensorFailure: false,
    muted: false,
    volume: 0.35,
    status: "idle",
    simulationSeconds: 0,
    history: [{ elapsed: 0, temperature: INITIAL_TEMPERATURE }],
    logEntries: [],
  };

  let simulationTimerId = null;
  let audioContext = null;
  let buzzerOscillator = null;
  let buzzerGain = null;
  let alarmPulseTimerId = null;
  let testToneTimeoutId = null;
  let pauseTimestamp = null;

  function formatTemperature(value) {
    return Number.isFinite(value) ? value.toFixed(1) : "--.-";
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function formatElapsed(seconds) {
    if (seconds < 60) return `00:${String(seconds).padStart(2, "0")}`;
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function currentDoorDurationMs(now = Date.now()) {
    if (!state.doorOpen || state.doorOpenedAt === null) return 0;
    if (state.status === "paused" && pauseTimestamp !== null) now = pauseTimestamp;
    return Math.max(0, now - state.doorOpenedAt);
  }

  function addLog(message, kind = "info") {
    const entry = { time: new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }), message, kind };
    state.logEntries.unshift(entry);
    if (state.logEntries.length > MAX_LOG_ENTRIES) state.logEntries.length = MAX_LOG_ENTRIES;
    renderLog();
  }

  function renderLog() {
    const fragment = document.createDocumentFragment();
    state.logEntries.forEach((entry) => {
      const item = document.createElement("li");
      item.className = `event-item${entry.kind === "info" ? "" : ` is-${entry.kind}`}`;
      const time = document.createElement("time");
      time.className = "event-time";
      time.textContent = entry.time;
      const message = document.createElement("span");
      message.className = "event-message";
      message.textContent = entry.message;
      item.append(time, message);
      fragment.append(item);
    });
    elements.eventLog.replaceChildren(fragment);
  }

  function activeAlarmReasons() {
    const reasons = [];
    if (state.temperatureAlarm) reasons.push("High temperature");
    if (state.doorAlarm) reasons.push("Door open 30+ seconds");
    return reasons;
  }

  function buzzerIsActive() {
    return state.temperatureAlarm || state.doorAlarm;
  }

  function updateCoolingFromTemperature() {
    const previous = state.cooling;
    if (state.temperature > TEMP_ON_THRESHOLD) state.cooling = true;
    else if (state.temperature <= TEMP_OFF_THRESHOLD) state.cooling = false;

    if (previous !== state.cooling) {
      addLog(state.cooling ? "Cooling turned ON" : "Cooling turned OFF", state.cooling ? "success" : "info");
    }
  }

  function updateTemperatureAlarm() {
    const wasActive = state.temperatureAlarm;
    state.temperatureAlarm = state.temperature > TEMP_HIGH_ALARM;
    if (wasActive !== state.temperatureAlarm) {
      addLog(state.temperatureAlarm ? "High-temperature alarm activated" : "High-temperature alarm cleared", state.temperatureAlarm ? "error" : "success");
    }
  }

  function setTemperature(nextValue) {
    if (state.sensorFailure) return;
    const clamped = Math.min(30, Math.max(-5, Math.round(Number(nextValue) * 2) / 2));
    if (!Number.isFinite(clamped) || clamped === state.temperature) return;
    state.temperature = clamped;
    addLog(`Temperature changed to ${formatTemperature(clamped)}°C`);
    updateCoolingFromTemperature();
    updateTemperatureAlarm();
    if (state.temperatureAlarm && state.status === "idle") ensureAudioContext();
    recordHistoryPoint();
    renderUI();
  }

  function recordHistoryPoint() {
    const value = state.sensorFailure ? null : state.temperature;
    const lastPoint = state.history[state.history.length - 1];
    if (lastPoint && lastPoint.elapsed === state.simulationSeconds) {
      lastPoint.temperature = value;
    } else {
      state.history.push({ elapsed: state.simulationSeconds, temperature: value });
    }
    if (state.history.length > MAX_HISTORY_POINTS) state.history.splice(0, state.history.length - MAX_HISTORY_POINTS);
    drawChart();
  }

  function setDoor(open) {
    if (state.doorOpen === open) return;
    state.doorOpen = open;
    if (open) {
      state.doorOpenedAt = Date.now();
      state.doorAlarm = false;
      addLog("Door OPEN", "warning");
    } else {
      state.doorOpenedAt = null;
      if (state.doorAlarm) {
        state.doorAlarm = false;
        addLog("Door alarm cleared", "success");
      }
      addLog("Door CLOSED", "success");
    }
    syncBuzzerAudio();
    renderUI();
  }

  function toggleSensorFailure(enabled) {
    if (state.sensorFailure === enabled) return;
    state.sensorFailure = enabled;
    if (enabled) {
      addLog("DHT22 sensor failure", "error");
      recordHistoryPoint();
    } else {
      addLog("Sensor reading restored", "success");
      recordHistoryPoint();
    }
    renderUI();
  }

  function checkDoorAlarm() {
    if (!state.doorOpen || state.doorAlarm || currentDoorDurationMs() < DOOR_ALARM_MS) return;
    state.doorAlarm = true;
    addLog("Door open for 30+ seconds", "error");
  }

  function simulationTick() {
    if (state.status !== "running") return;
    state.simulationSeconds += 1;
    checkDoorAlarm();
    updateCoolingFromTemperature();
    updateTemperatureAlarm();
    recordHistoryPoint();
    renderUI();
  }

  function startTimer() {
    if (simulationTimerId !== null) return;
    simulationTimerId = window.setInterval(simulationTick, UPDATE_INTERVAL_MS);
  }

  function stopTimer() {
    if (simulationTimerId === null) return;
    window.clearInterval(simulationTimerId);
    simulationTimerId = null;
  }

  function startSimulation() {
    if (state.status === "running") return;
    const wasPaused = state.status === "paused";
    if (wasPaused && pauseTimestamp !== null && state.doorOpenedAt !== null) {
      state.doorOpenedAt += Date.now() - pauseTimestamp;
    }
    pauseTimestamp = null;
    state.status = "running";
    ensureAudioContext();
    if (wasPaused) addLog("Simulation resumed", "success");
    else addLog("Smart Refrigerator Simulation Started", "success");
    startTimer();
    renderUI();
    syncBuzzerAudio();
  }

  function pauseSimulation() {
    if (state.status !== "running") return;
    state.status = "paused";
    pauseTimestamp = Date.now();
    stopTimer();
    stopAlarmAudio();
    addLog("Simulation paused", "warning");
    renderUI();
  }

  function resetSimulation() {
    stopTimer();
    stopAllAudio();
    pauseTimestamp = null;
    state.temperature = INITIAL_TEMPERATURE;
    state.cooling = false;
    state.doorOpen = false;
    state.doorOpenedAt = null;
    state.doorAlarm = false;
    state.temperatureAlarm = false;
    state.reportedBuzzerActive = false;
    state.sensorFailure = false;
    state.muted = false;
    state.volume = 0.35;
    state.status = "idle";
    state.simulationSeconds = 0;
    state.history = [{ elapsed: 0, temperature: INITIAL_TEMPERATURE }];
    state.logEntries = [];
    elements.temperatureSlider.value = String(INITIAL_TEMPERATURE);
    elements.sensorFailureToggle.checked = false;
    elements.volumeSlider.value = "35";
    document.body.removeAttribute("data-theme");
    elements.themeToggle.setAttribute("aria-label", "Switch to dark theme");
    addLog("Simulation reset", "info");
    renderUI();
  }

  function ensureAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      elements.audioState.textContent = "Web Audio unavailable";
      elements.alarmStateNote.textContent = "This browser does not support Web Audio; visual alarms still work.";
      return false;
    }

    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextClass();
      buzzerOscillator = null;
      buzzerGain = null;
    }
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {
        elements.audioState.textContent = "Click to enable speaker audio";
      });
    }
    elements.audioState.textContent = "Laptop speaker audio";
    return true;
  }

  function ensureToneNodes() {
    if (!audioContext || audioContext.state === "closed") return false;
    if (!buzzerOscillator || !buzzerGain) {
      buzzerOscillator = audioContext.createOscillator();
      buzzerGain = audioContext.createGain();
      buzzerOscillator.type = "sine";
      buzzerOscillator.frequency.setValueAtTime(1_000, audioContext.currentTime);
      buzzerGain.gain.setValueAtTime(0, audioContext.currentTime);
      buzzerOscillator.connect(buzzerGain);
      buzzerGain.connect(audioContext.destination);
      buzzerOscillator.start();
    }
    return true;
  }

  function scheduleTonePulse() {
    if (!audioContext || !buzzerGain || audioContext.state !== "running") return;
    const now = audioContext.currentTime;
    const peak = Math.max(0, state.volume * 0.22);
    buzzerGain.gain.cancelScheduledValues(now);
    buzzerGain.gain.setValueAtTime(0, now);
    buzzerGain.gain.linearRampToValueAtTime(peak, now + 0.018);
    buzzerGain.gain.setValueAtTime(peak, now + 0.13);
    buzzerGain.gain.linearRampToValueAtTime(0, now + 0.2);
  }

  function startAlarmAudio() {
    if (alarmPulseTimerId !== null || !ensureToneNodes()) return;
    scheduleTonePulse();
    alarmPulseTimerId = window.setInterval(scheduleTonePulse, 850);
  }

  function stopAlarmAudio() {
    if (alarmPulseTimerId !== null) {
      window.clearInterval(alarmPulseTimerId);
      alarmPulseTimerId = null;
    }
    if (testToneTimeoutId !== null) {
      window.clearTimeout(testToneTimeoutId);
      testToneTimeoutId = null;
    }
    if (audioContext && buzzerGain && audioContext.state === "running") {
      const now = audioContext.currentTime;
      buzzerGain.gain.cancelScheduledValues(now);
      buzzerGain.gain.setTargetAtTime(0, now, 0.025);
    }
  }

  function stopAllAudio() {
    stopAlarmAudio();
    if (audioContext && audioContext.state !== "closed") {
      audioContext.close().catch(() => {});
    }
    audioContext = null;
    buzzerOscillator = null;
    buzzerGain = null;
  }

  function syncBuzzerAudio() {
    const shouldSound = buzzerIsActive() && !state.muted && state.status !== "paused";
    if (shouldSound) startAlarmAudio();
    else stopAlarmAudio();
  }

  function playTestBuzzer() {
    if (state.muted) {
      addLog("Test buzzer skipped while muted", "warning");
      return;
    }
    if (!ensureAudioContext() || !ensureToneNodes()) {
      addLog("Web Audio is unavailable in this browser", "warning");
      return;
    }
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    scheduleTonePulse();
    if (alarmPulseTimerId === null) {
      if (testToneTimeoutId !== null) window.clearTimeout(testToneTimeoutId);
      testToneTimeoutId = window.setTimeout(() => {
        testToneTimeoutId = null;
        if (!buzzerIsActive() || state.status === "paused" || state.muted) stopAlarmAudio();
      }, 250);
    }
    addLog("Buzzer test tone played", "info");
  }

  function setMute(muted) {
    if (state.muted === muted) return;
    state.muted = muted;
    addLog(muted ? "Buzzer muted" : "Buzzer unmuted", muted ? "warning" : "success");
    if (!muted && buzzerIsActive() && state.status !== "paused") ensureAudioContext();
    syncBuzzerAudio();
    renderUI();
  }

  function renderUI() {
    const hasTemperature = Number.isFinite(state.temperature);
    const formatted = formatTemperature(state.temperature);
    const doorDurationMs = currentDoorDurationMs();
    const alarmReasons = activeAlarmReasons();
    const alarmActive = alarmReasons.length > 0;
    if (alarmActive !== state.reportedBuzzerActive) {
      state.reportedBuzzerActive = alarmActive;
      addLog(alarmActive ? "Buzzer activated" : "Buzzer cleared", alarmActive ? "warning" : "success");
    }

    elements.simulationStatus.textContent = state.status === "running" ? "Running" : state.status === "paused" ? "Paused" : "Ready";
    elements.statusBadge.classList.toggle("is-running", state.status === "running");
    elements.statusBadge.classList.toggle("is-paused", state.status === "paused");
    elements.startLabel.textContent = state.status === "paused" ? "Resume Simulation" : "Start Simulation";
    elements.startButton.disabled = state.status === "running";
    elements.pauseButton.disabled = state.status !== "running";

    elements.summaryTemperature.textContent = hasTemperature ? formatted : "No reading";
    elements.temperatureSummaryCard.classList.toggle("is-warning", state.temperatureAlarm);
    elements.temperatureRangeIndicator.classList.toggle("is-warning", state.temperature < 4 || state.temperature > 8);
    elements.temperatureRangeIndicator.classList.toggle("is-alarm", state.temperatureAlarm);
    elements.temperatureStateLabel.textContent = state.temperatureAlarm ? "High temperature" : state.temperature > 8 ? "Above target" : state.temperature < 4 ? "Below target" : "Normal range";
    elements.temperatureWarning.hidden = !state.temperatureAlarm;
    elements.temperatureWarningText.textContent = state.sensorFailure
      ? `Last valid reading ${formatted}°C exceeds the ${TEMP_HIGH_ALARM}°C alarm threshold. The sensor is currently offline.`
      : `Temperature is ${formatted}°C, above the ${TEMP_HIGH_ALARM}°C high-temperature alarm threshold.`;
    elements.gaugeTemperature.textContent = formatted;
    elements.temperatureOutput.textContent = `${formatted}°C`;
    elements.temperatureSlider.value = String(state.temperature);
    elements.miniMeterFill.style.width = `${Math.min(100, Math.max(0, ((state.temperature + 5) / 35) * 100))}%`;
    elements.miniMeterFill.style.background = state.temperature > TEMP_HIGH_ALARM ? "linear-gradient(90deg, #e99350, #df5b5f)" : "linear-gradient(90deg, #2db69a, #6fc5be)";
    const arcLength = 289;
    const progress = Math.min(1, Math.max(0, (state.temperature + 5) / 35));
    elements.gaugeProgress.style.strokeDasharray = `${arcLength} ${arcLength}`;
    elements.gaugeProgress.style.strokeDashoffset = String(arcLength * (1 - progress));
    elements.temperatureContext.textContent = state.temperature > TEMP_HIGH_ALARM ? "High-temperature alarm" : state.temperature > 8 ? "Cooling required" : state.temperature < 4 ? "Below normal range" : state.temperature === TEMP_OFF_THRESHOLD ? "At cooling OFF threshold" : "Within target range";

    elements.coolingCard.classList.toggle("is-on", state.cooling);
    elements.coolingState.textContent = state.cooling ? "ON" : "OFF";
    elements.coolingDescription.textContent = state.cooling ? "Compressor running · relay energized" : "Compressor idle · ready to cool";
    elements.relayOutput.textContent = state.cooling ? "HIGH" : "LOW";

    elements.doorCard.classList.toggle("is-open", state.doorOpen);
    elements.doorCard.classList.toggle("is-alarm", state.doorAlarm);
    elements.doorState.textContent = state.doorOpen ? "OPEN" : "CLOSED";
    elements.doorDuration.textContent = `Open duration · ${formatDuration(doorDurationMs)}`;
    elements.doorSummaryNote.textContent = state.doorAlarm ? "Door alarm active" : state.doorOpen ? "Close before 00:30" : "Door sensor normal";
    elements.doorToggle.textContent = state.doorOpen ? "Close refrigerator door" : "Open refrigerator door";
    elements.doorToggle.setAttribute("aria-pressed", String(state.doorOpen));
    elements.fridgeBody.classList.toggle("is-open", state.doorOpen);
    elements.doorVisualDot.classList.toggle("is-open", state.doorOpen);
    elements.fridgeCaptionText.textContent = state.doorOpen ? (state.doorAlarm ? "Door open · alarm active" : "Door is open") : "Door securely closed";

    elements.buzzerCard.classList.toggle("is-alarm", alarmActive);
    elements.buzzerCard.classList.toggle("is-warning", alarmActive);
    elements.buzzerState.textContent = alarmActive ? "ON" : "OFF";
    elements.muteState.textContent = state.muted ? "MUTED" : "UNMUTED";
    elements.muteState.classList.toggle("is-muted", state.muted);
    elements.alarmReason.textContent = alarmActive ? alarmReasons.join(" · ") : "No active alarms";
    elements.alarmCount.textContent = `${alarmReasons.length} ${alarmReasons.length === 1 ? "alarm" : "alarms"}`;
    elements.alarmBadge.classList.toggle("is-active", alarmActive);
    elements.alarmBadge.querySelector("span").textContent = alarmActive ? `${alarmReasons.length} active ${alarmReasons.length === 1 ? "alarm" : "alarms"}` : "All clear";
    elements.alarmStateNote.textContent = alarmActive && state.muted ? "Visual warning active; buzzer audio is muted." : "The visual alarm remains active if audio is muted.";
    elements.muteLabel.textContent = state.muted ? "Unmute" : "Mute";
    elements.muteToggle.setAttribute("aria-pressed", String(state.muted));

    elements.sensorFailureToggle.checked = state.sensorFailure;
    elements.temperatureSlider.disabled = state.sensorFailure;
    elements.decreaseTemperature.disabled = state.sensorFailure;
    elements.increaseTemperature.disabled = state.sensorFailure;
    elements.sensorPill.classList.toggle("is-error", state.sensorFailure);
    elements.sensorLabel.textContent = state.sensorFailure ? "Sensor error · last value" : "DHT22 simulated";
    elements.sensorError.hidden = !state.sensorFailure;
    elements.chartCurrentTemperature.textContent = `${formatted}°C`;
    elements.chartReadingCaption.textContent = state.sensorFailure ? "Last valid reading" : "Current reading";
    elements.chartFootnote.textContent = state.sensorFailure ? "Sensor offline · unavailable readings appear as gaps in history." : "History updates every second while the simulation runs.";

    elements.muteToggle.title = state.muted ? "Unmute the browser buzzer" : "Mute the browser buzzer";
    elements.volumeOutput.textContent = `${Math.round(state.volume * 100)}%`;
    drawChart();
    syncBuzzerAudio();
  }

  function drawChart() {
    const canvas = elements.chartCanvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const dark = document.body.dataset.theme === "dark";
    const colors = dark
      ? { grid: "#2b394a", text: "#8494a9", line: "#6aabed", band: "rgba(83, 166, 147, .10)", target: "#58aa99", alarm: "#d49a42", point: "#b7d8fa" }
      : { grid: "#edf1f5", text: "#93a0af", line: "#4489dc", band: "rgba(75, 172, 149, .09)", target: "#65b9a6", alarm: "#db9d42", point: "#ffffff" };
    const margin = { top: 13, right: 9, bottom: 30, left: 39 };
    const plotWidth = Math.max(1, width - margin.left - margin.right);
    const plotHeight = Math.max(1, height - margin.top - margin.bottom);
    const x = (index) => margin.left + (state.history.length <= 1 ? plotWidth / 2 : (index / (state.history.length - 1)) * plotWidth);
    const y = (value) => margin.top + ((30 - value) / 35) * plotHeight;

    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.band;
    context.fillRect(margin.left, y(8), plotWidth, y(4) - y(8));

    context.font = "9px system-ui, sans-serif";
    context.textAlign = "right";
    context.textBaseline = "middle";
    [-5, 0, 5, 10, 15, 20, 25, 30].forEach((value) => {
      const py = y(value);
      context.beginPath();
      context.strokeStyle = colors.grid;
      context.lineWidth = 1;
      context.setLineDash([]);
      context.moveTo(margin.left, py);
      context.lineTo(width - margin.right, py);
      context.stroke();
      context.fillStyle = colors.text;
      context.fillText(String(value), margin.left - 8, py);
    });

    [4, 8, 15].forEach((value) => {
      const py = y(value);
      context.beginPath();
      context.strokeStyle = value === 15 ? colors.alarm : colors.target;
      context.lineWidth = 1;
      context.setLineDash(value === 15 ? [4, 3] : [2, 3]);
      context.moveTo(margin.left, py);
      context.lineTo(width - margin.right, py);
      context.stroke();
    });
    context.setLineDash([]);

    context.fillStyle = colors.text;
    context.textAlign = "center";
    context.textBaseline = "top";
    const first = state.history[0]?.elapsed ?? 0;
    const last = state.history[state.history.length - 1]?.elapsed ?? 0;
    context.fillText(formatElapsed(first), margin.left, height - margin.bottom + 8);
    if (last !== first) context.fillText(formatElapsed(Math.floor((first + last) / 2)), margin.left + plotWidth / 2, height - margin.bottom + 8);
    context.fillText(formatElapsed(last), margin.left + plotWidth, height - margin.bottom + 8);
    context.save();
    context.translate(10, margin.top + plotHeight / 2);
    context.rotate(-Math.PI / 2);
    context.textBaseline = "top";
    context.fillText("Temperature °C", 0, 0);
    context.restore();
    context.textAlign = "right";
    context.textBaseline = "bottom";
    context.fillText("Elapsed time", width - margin.right, height - 2);

    context.beginPath();
    context.strokeStyle = colors.line;
    context.lineWidth = 2;
    context.lineJoin = "round";
    context.lineCap = "round";
    let drawingSegment = false;
    state.history.forEach((point, index) => {
      if (!Number.isFinite(point.temperature)) {
        drawingSegment = false;
        return;
      }
      const px = x(index);
      const py = y(point.temperature);
      if (!drawingSegment) {
        context.moveTo(px, py);
        drawingSegment = true;
      } else {
        context.lineTo(px, py);
      }
    });
    context.stroke();
    const latest = state.history[state.history.length - 1];
    if (latest && Number.isFinite(latest.temperature)) {
      context.beginPath();
      context.fillStyle = colors.line;
      context.arc(x(state.history.length - 1), y(latest.temperature), 4, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.fillStyle = colors.point;
      context.arc(x(state.history.length - 1), y(latest.temperature), 1.8, 0, Math.PI * 2);
      context.fill();
    }
  }

  elements.startButton.addEventListener("click", startSimulation);
  elements.pauseButton.addEventListener("click", pauseSimulation);
  elements.resetButton.addEventListener("click", resetSimulation);
  elements.temperatureSlider.addEventListener("input", (event) => setTemperature(event.currentTarget.value));
  elements.decreaseTemperature.addEventListener("click", () => setTemperature(state.temperature - 0.5));
  elements.increaseTemperature.addEventListener("click", () => setTemperature(state.temperature + 0.5));
  elements.doorToggle.addEventListener("click", () => setDoor(!state.doorOpen));
  elements.sensorFailureToggle.addEventListener("change", (event) => toggleSensorFailure(event.currentTarget.checked));
  elements.volumeSlider.addEventListener("input", (event) => {
    state.volume = Number(event.currentTarget.value) / 100;
    elements.volumeOutput.textContent = `${Math.round(state.volume * 100)}%`;
  });
  elements.testBuzzer.addEventListener("click", playTestBuzzer);
  elements.muteToggle.addEventListener("click", () => setMute(!state.muted));
  elements.clearLog.addEventListener("click", () => {
    state.logEntries = [];
    renderLog();
  });
  elements.themeToggle.addEventListener("click", () => {
    const dark = document.body.dataset.theme !== "dark";
    if (dark) document.body.dataset.theme = "dark";
    else document.body.removeAttribute("data-theme");
    elements.themeToggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    drawChart();
  });
  window.addEventListener("resize", drawChart);
  window.addEventListener("pagehide", stopAllAudio, { once: true });

  addLog(`Simulation initialized at ${formatTemperature(INITIAL_TEMPERATURE)}°C`, "info");
  renderUI();
})();
