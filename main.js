// This is the MAIN PROCESS - it runs Node.js and controls the app lifecycle
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Keep a global reference of the window object
let mainWindow;
let isRecording = false; // Track recording state

function createWindow() {
  // Create the browser window (this is like opening a Chrome tab, but as a desktop window)
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      // Enable context isolation for better security
      contextIsolation: true,
      // Disable node integration in renderer for security
      nodeIntegration: false,
      // Load our preload script to safely expose APIs
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load our HTML file (like opening a webpage)
  mainWindow.loadFile('index.html');

  // Open DevTools automatically in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Handle when window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Helper function to get recordings directory
function getRecordingsDirectory() {
  // Create a 'Recordings' folder in the user's Videos directory
  const videosPath = app.getPath('videos');
  const recordingsPath = path.join(videosPath, 'ScreenRecordings');
  return recordingsPath;
}

// Helper function to ensure recordings directory exists
async function ensureRecordingsDirectory() {
  const dir = getRecordingsDirectory();
  try {
    await fs.mkdir(dir, { recursive: true });
    return dir;
  } catch (error) {
    console.error('Error creating recordings directory:', error);
    throw error;
  }
}

// Helper function to generate unique filename
function generateFilename() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `Recording_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.webm`;
}

// IPC HANDLERS - These respond to messages from the renderer process

// Handle getting available sources (screens/windows)
ipcMain.handle('get-sources', async () => {
  console.log('🖥️ Main: Getting available sources');

  try {
    const { desktopCapturer } = require('electron');

    // Get available screens and windows
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 300, height: 200 },
    });

    // Convert sources to a format the renderer can use
    const sourcesData = sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(), // Convert to base64 image
      display_id: source.display_id,
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
    }));

    console.log(`📱 Found ${sourcesData.length} sources`);
    return { success: true, sources: sourcesData };
  } catch (error) {
    console.error('❌ Error getting sources:', error);
    return { success: false, error: error.message };
  }
});

// Handle start recording request
ipcMain.handle('start-recording', async (event, sourceId) => {
  console.log('📹 Main: Start recording requested for source:', sourceId);

  if (isRecording) {
    return { success: false, error: 'Already recording' };
  }

  if (!sourceId) {
    return { success: false, error: 'No source selected' };
  }

  // Store the selected source ID for later use
  global.selectedSourceId = sourceId;
  isRecording = true;

  // Send status update to renderer
  mainWindow.webContents.send('recording-status', {
    isRecording: true,
    message: `Recording started for source: ${sourceId}`,
  });

  return { success: true, message: 'Recording started successfully' };
});

// Handle stop recording request
ipcMain.handle('stop-recording', async () => {
  console.log('⏹️ Main: Stop recording requested');

  if (!isRecording) {
    return { success: false, error: 'Not currently recording' };
  }

  // Clear selected source
  global.selectedSourceId = null;
  isRecording = false;

  // Send status update to renderer
  mainWindow.webContents.send('recording-status', {
    isRecording: false,
    message: 'Recording stopped!',
  });

  return { success: true, message: 'Recording stopped successfully' };
});

// Handle get status request
ipcMain.handle('get-recording-status', async () => {
  return { isRecording, sourceId: global.selectedSourceId };
});

// Handle save recording request - THIS IS THE MISSING HANDLER!
ipcMain.handle('save-recording', async (event, videoData) => {
  console.log('💾 Main: Save recording requested');

  try {
    // Ensure recordings directory exists
    const recordingsDir = await ensureRecordingsDirectory();

    // Generate unique filename
    const filename = generateFilename();
    const filePath = path.join(recordingsDir, filename);

    // Convert array back to Buffer
    const buffer = Buffer.from(videoData);

    console.log(`📝 Saving ${buffer.length} bytes to ${filePath}`);

    // Write file
    await fs.writeFile(filePath, buffer);

    // Get file size for display
    const stats = await fs.stat(filePath);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`✅ File saved successfully: ${filename} (${fileSizeMB}MB)`);

    return {
      success: true,
      filename: filename,
      path: filePath,
      size: `${fileSizeMB} MB`,
      directory: recordingsDir,
    };
  } catch (error) {
    console.error('❌ Error saving recording:', error);
    return { success: false, error: error.message };
  }
});

// Handle open recordings folder request
ipcMain.handle('open-recordings-folder', async () => {
  console.log('📁 Main: Open recordings folder requested');

  try {
    const recordingsDir = await ensureRecordingsDirectory();

    // Open the folder in the system file explorer
    shell.openPath(recordingsDir);

    return { success: true };
  } catch (error) {
    console.error('❌ Error opening recordings folder:', error);
    return { success: false, error: error.message };
  }
});

// Handle get recordings directory request
ipcMain.handle('get-recordings-directory', async () => {
  try {
    const recordingsDir = await ensureRecordingsDirectory();
    return { success: true, directory: recordingsDir };
  } catch (error) {
    console.error('❌ Error getting recordings directory:', error);
    return { success: false, error: error.message };
  }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, re-create window when dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

console.log('Main process started! 🚀');
