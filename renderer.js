// This is the RENDERER PROCESS - Now with quality settings!

console.log('🎨 Renderer process loaded!');

// Check if our secure API bridge is available
if (window.electronAPI) {
  console.log('✅ Electron API bridge is available');
} else {
  console.error('❌ Electron API bridge is not available');
}

// UI state management
let isRecording = false;
let selectedSourceId = null;
let previewStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let timerInterval = null;

// Quality presets
const QUALITY_PRESETS = {
  low: {
    name: 'Low (720p)',
    width: 1280,
    height: 720,
    frameRate: 30,
    bitrate: 2500000, // 2.5 Mbps
  },
  medium: {
    name: 'Medium (1080p)',
    width: 1920,
    height: 1080,
    frameRate: 30,
    bitrate: 5000000, // 5 Mbps
  },
  high: {
    name: 'High (1080p 60fps)',
    width: 1920,
    height: 1080,
    frameRate: 60,
    bitrate: 8000000, // 8 Mbps
  },
  ultra: {
    name: 'Ultra (4K)',
    width: 3840,
    height: 2160,
    frameRate: 30,
    bitrate: 20000000, // 20 Mbps
  },
};

let selectedQuality = 'high'; // Default quality

// Get DOM elements
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('statusText');
const indicator = document.getElementById('indicator');
const logArea = document.getElementById('logArea');
const sourceGrid = document.getElementById('sourceGrid');
const previewVideo = document.getElementById('previewVideo');
const previewPlaceholder = document.getElementById('previewPlaceholder');
const recordingInfo = document.getElementById('recordingInfo');
const recordingTimer = document.getElementById('recordingTimer');
const saveLocation = document.getElementById('saveLocation');
const currentQuality = document.getElementById('currentQuality');

// Function to log messages with timestamp
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : '🔵';
  logEntry.innerHTML = `[${timestamp}] ${icon} ${message}`;
  logArea.appendChild(logEntry);
  logArea.scrollTop = logArea.scrollHeight; // Auto-scroll to bottom
}

// Function to set recording quality
function setQuality(quality) {
  selectedQuality = quality;
  const preset = QUALITY_PRESETS[quality];
  log(`🎬 Quality changed to: ${preset.name}`);

  // Update the quality display
  if (currentQuality) {
    currentQuality.textContent = preset.name;
  }

  // If we have an active preview, restart it with new quality
  if (selectedSourceId && previewStream) {
    // Stop current preview
    previewStream.getTracks().forEach((track) => track.stop());
    // Start new preview with updated quality
    startPreview(selectedSourceId);
  }
}

// Function to update recording timer
function updateTimer() {
  if (!recordingStartTime) return;

  const elapsed = Date.now() - recordingStartTime;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);

  recordingTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

// Function to update UI based on recording state
function updateUI(recording) {
  isRecording = recording;

  if (recording) {
    recordBtn.textContent = '🔴 Recording...';
    recordBtn.classList.add('recording');
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    statusText.textContent = 'Recording in progress';
    indicator.classList.add('recording');
    recordingInfo.style.display = 'block';

    // Start timer
    recordingStartTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
  } else {
    recordBtn.textContent = '📹 Start Recording';
    recordBtn.classList.remove('recording');
    recordBtn.disabled = !selectedSourceId;
    stopBtn.disabled = true;
    statusText.textContent = selectedSourceId
      ? 'Ready to record'
      : 'Select a source to record';
    indicator.classList.remove('recording');
    recordingInfo.style.display = 'none';

    // Stop timer
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    recordingStartTime = null;
  }
}

// REFRESH SOURCES - Get available screens and windows
async function refreshSources() {
  try {
    log('🔄 Refreshing available sources...');

    const result = await window.electronAPI.getSources();

    if (result.success) {
      log(`📱 Found ${result.sources.length} sources`, 'success');
      displaySources(result.sources);
    } else {
      log(`❌ Failed to get sources: ${result.error}`, 'error');
    }
  } catch (error) {
    log(`❌ Error refreshing sources: ${error.message}`, 'error');
    console.error('Refresh sources error:', error);
  }
}

// DISPLAY SOURCES - Show available sources in the grid
function displaySources(sources) {
  sourceGrid.innerHTML = '';

  if (sources.length === 0) {
    sourceGrid.innerHTML =
      '<div class="preview-placeholder">No sources found</div>';
    return;
  }

  sources.forEach((source) => {
    const sourceElement = document.createElement('div');
    sourceElement.className = 'source-item';
    sourceElement.onclick = () => selectSource(source);

    // Determine source type and icon
    const isScreen = source.id.startsWith('screen:');
    const sourceType = isScreen ? 'Screen' : 'Window';

    sourceElement.innerHTML = `
            <img src="${source.thumbnail}" alt="${
      source.name
    }" class="source-thumbnail">
            <div class="source-info">
                ${
                  source.appIcon
                    ? `<img src="${source.appIcon}" alt="App icon" class="source-icon">`
                    : ''
                }
                <div class="source-name" title="${source.name}">${
      source.name
    }</div>
                <div class="source-type">${sourceType}</div>
            </div>
        `;

    sourceGrid.appendChild(sourceElement);
  });
}

// SELECT SOURCE - Choose a source and start preview
async function selectSource(source) {
  try {
    log(`🖥️ Selecting source: ${source.name}`);

    // Update selected source
    selectedSourceId = source.id;

    // Update UI - highlight selected source
    document.querySelectorAll('.source-item').forEach((item) => {
      item.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');

    // Stop previous preview if any
    if (previewStream) {
      previewStream.getTracks().forEach((track) => track.stop());
    }

    // Start new preview
    await startPreview(source.id);

    // Update button states
    updateUI(false);
  } catch (error) {
    log(`❌ Error selecting source: ${error.message}`, 'error');
    console.error('Select source error:', error);
  }
}

// START PREVIEW - Show live preview of selected source
async function startPreview(sourceId) {
  try {
    log('👀 Starting preview...');

    const quality = QUALITY_PRESETS[selectedQuality];
    log(`🎬 Using quality preset: ${quality.name}`);

    // Get user media with the selected source - WITH QUALITY SETTINGS
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false, // We'll add audio in next step
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          // Quality settings based on preset
          minWidth: quality.width,
          maxWidth: quality.width,
          minHeight: quality.height,
          maxHeight: quality.height,
          minFrameRate: quality.frameRate,
          maxFrameRate: quality.frameRate,
        },
      },
    });

    // Store the stream for cleanup and recording
    previewStream = stream;

    // Display the preview
    previewVideo.srcObject = stream;
    previewVideo.style.display = 'block';
    previewPlaceholder.style.display = 'none';

    // Log the actual video track settings
    const videoTrack = stream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    log(
      `📺 Video resolution: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`,
      'success'
    );

    log('✅ Preview started successfully!', 'success');
  } catch (error) {
    log(`❌ Error starting preview: ${error.message}`, 'error');
    console.error('Preview error:', error);

    // Show placeholder on error
    previewVideo.style.display = 'none';
    previewPlaceholder.style.display = 'flex';
    previewPlaceholder.textContent = `Error: ${error.message}`;
  }
}

// START RECORDING - Begin actual video recording
async function startRecording() {
  if (!selectedSourceId || !previewStream) {
    log('❌ No source selected or preview not available!', 'error');
    return;
  }

  try {
    log('📹 Starting recording...');

    // Reset recorded chunks
    recordedChunks = [];

    // Determine best codec and bitrate based on system
    let mimeType;
    const codecs = [
      'video/webm;codecs=vp9,opus', // Best quality
      'video/webm;codecs=vp9', // Good quality
      'video/webm;codecs=vp8,opus', // Fallback
      'video/webm;codecs=vp8', // Basic fallback
      'video/webm', // Last resort
    ];

    // Find the first supported codec
    for (const codec of codecs) {
      if (MediaRecorder.isTypeSupported(codec)) {
        mimeType = codec;
        log(`🎬 Using codec: ${codec}`, 'success');
        break;
      }
    }

    // Create MediaRecorder with quality settings
    const quality = QUALITY_PRESETS[selectedQuality];
    const recorderOptions = {
      mimeType: mimeType,
      videoBitsPerSecond: quality.bitrate,
    };

    log(`📹 Recording at ${(quality.bitrate / 1000000).toFixed(1)} Mbps`);
    mediaRecorder = new MediaRecorder(previewStream, recorderOptions);

    // Handle data available event
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
        log(`📦 Recorded chunk: ${(event.data.size / 1024).toFixed(1)}KB`);
      }
    };

    // Handle recording stop event
    mediaRecorder.onstop = async () => {
      log('💾 Recording stopped, saving file...');
      await saveRecording();
    };

    // Handle errors
    mediaRecorder.onerror = (event) => {
      log(`❌ Recording error: ${event.error}`, 'error');
    };

    // Start recording (collect data every 100ms for smoother recording)
    mediaRecorder.start(100);

    // Update main process state
    const result = await window.electronAPI.startRecording(selectedSourceId);

    if (result.success) {
      log('✅ Recording started successfully!', 'success');
      updateUI(true);
    } else {
      log(`❌ Failed to start recording: ${result.error}`, 'error');
      mediaRecorder.stop();
    }
  } catch (error) {
    log(`❌ Error starting recording: ${error.message}`, 'error');
    console.error('Start recording error:', error);
  }
}

// STOP RECORDING - End recording and save file
async function stopRecording() {
  try {
    log('⏹️ Stopping recording...');

    // Stop the MediaRecorder
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    // Update main process state
    const result = await window.electronAPI.stopRecording();

    if (result.success) {
      log('✅ Recording stopped successfully!', 'success');
      updateUI(false);
    } else {
      log(`❌ Failed to stop recording: ${result.error}`, 'error');
    }
  } catch (error) {
    log(`❌ Error stopping recording: ${error.message}`, 'error');
    console.error('Stop recording error:', error);
  }
}

// SAVE RECORDING - Convert recorded chunks to file and save
async function saveRecording() {
  try {
    if (recordedChunks.length === 0) {
      log('❌ No recorded data to save', 'error');
      return;
    }

    log(`💾 Processing ${recordedChunks.length} chunks...`);

    // Create blob from recorded chunks
    const blob = new Blob(recordedChunks, {
      type: 'video/webm',
    });

    const fileSizeMB = (blob.size / 1024 / 1024).toFixed(2);
    log(`📦 Created video blob: ${fileSizeMB}MB`);

    // Convert blob to array buffer for IPC
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    log(`🔄 Converting to transferable format: ${uint8Array.length} bytes`);

    // Convert Uint8Array to regular array for IPC transfer
    const dataArray = Array.from(uint8Array);

    log('📤 Sending data to main process...');

    // Send to main process to save
    const result = await window.electronAPI.saveRecording(dataArray);

    if (result.success) {
      log(`✅ File saved successfully: ${result.filename}`, 'success');
      showSaveSuccess(result);
    } else {
      log(`❌ Failed to save file: ${result.error}`, 'error');
    }

    // Clear recorded chunks
    recordedChunks = [];
  } catch (error) {
    log(`❌ Error saving recording: ${error.message}`, 'error');
    console.error('Save recording error:', error);
  }
}

// SHOW SAVE SUCCESS - Display success message with file info
function showSaveSuccess(fileInfo) {
  // Remove any existing success messages
  const existingSuccess = document.querySelector('.save-success');
  if (existingSuccess) {
    existingSuccess.remove();
  }

  // Create success message
  const successDiv = document.createElement('div');
  successDiv.className = 'save-success';
  successDiv.innerHTML = `
        <h3>🎉 Recording Saved Successfully!</h3>
        <div class="file-info">
            <p><strong>📁 File:</strong> ${fileInfo.filename}</p>
            <p><strong>📏 Size:</strong> ${fileInfo.size}</p>
            <p><strong>📂 Location:</strong> ${fileInfo.directory}</p>
        </div>
        <button class="btn-open-folder" onclick="openRecordingsFolder()">
            📁 Open Recordings Folder
        </button>
    `;

  // Insert after controls
  const controls = document.querySelector('.controls');
  controls.insertAdjacentElement('afterend', successDiv);

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (successDiv.parentNode) {
      successDiv.remove();
    }
  }, 10000);
}

// OPEN RECORDINGS FOLDER - Open the folder where recordings are saved
async function openRecordingsFolder() {
  try {
    log('📁 Opening recordings folder...');

    const result = await window.electronAPI.openRecordingsFolder();

    if (result.success) {
      log('✅ Opened recordings folder', 'success');
    } else {
      log(`❌ Failed to open folder: ${result.error}`, 'error');
    }
  } catch (error) {
    log(`❌ Error opening folder: ${error.message}`, 'error');
    console.error('Open folder error:', error);
  }
}

// CHECK STATUS - Query the main process for current state
async function checkStatus() {
  try {
    log('📊 Checking recording status...');

    const status = await window.electronAPI.getRecordingStatus();
    log(
      `Current status: ${status.isRecording ? 'Recording' : 'Not recording'}`
    );

    if (status.sourceId) {
      log(`Selected source: ${status.sourceId}`);
    }

    // Update UI to match actual state
    updateUI(status.isRecording);
  } catch (error) {
    log(`❌ Error checking status: ${error.message}`, 'error');
    console.error('Check status error:', error);
  }
}

// LISTEN FOR STATUS UPDATES from main process
window.electronAPI.onRecordingStatus((data) => {
  log(`📡 Status update received: ${data.message}`);
  updateUI(data.isRecording);
});

// CLEANUP - Stop preview and recording when page unloads
window.addEventListener('beforeunload', () => {
  if (previewStream) {
    previewStream.getTracks().forEach((track) => track.stop());
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (timerInterval) {
    clearInterval(timerInterval);
  }
});

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  log('✅ App initialized and ready!');

  // Get and display save location
  try {
    const dirInfo = await window.electronAPI.getRecordingsDirectory();
    saveLocation.textContent = dirInfo.directory;
  } catch (error) {
    saveLocation.textContent = 'Unable to determine save location';
  }

  // Update quality display
  const preset = QUALITY_PRESETS[selectedQuality];
  if (currentQuality) {
    currentQuality.textContent = preset.name;
  }

  // Check initial status
  checkStatus();

  // Load sources automatically
  refreshSources();
});
