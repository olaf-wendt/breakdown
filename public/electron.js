/**
 * Main Electron process configuration
 * Handles window management, IPC setup, and application lifecycle
 * Implements graceful shutdown and error handling patterns
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;
const log = require('electron-log');
const { setupIPC } = require('./ipc.js');
const { createMenu } = require('./menu.js');

// Configure logging for both main and renderer processes
log.initialize({ preload: true });
log.transports.file.level = isDev ? 'debug' : 'info';
log.transports.console.level = isDev ? 'debug' : 'info';

// Configure main process logging
log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs/main.log');

// Ensure consistent app name across platforms
app.name = 'Breakdown';

// Global references to prevent garbage collection
let mainWindow = null;
let cleanupIPC = null;
let isQuitting = false;

/**
 * Creates and configures the main application window
 * Handles window state, security settings, and error cases
 * 
 * @throws {Error} When window creation or content loading fails
 */
async function createWindow() {
    log.info('Creating window...');

    // Configure window with security-conscious defaults
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'Breakdown',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: !isDev // Disable webSecurity only in development
        },
    });

    // Load appropriate content source based on environment
    const startUrl = isDev 
        ? 'http://localhost:3001'  // Development server
        : `file://${path.join(__dirname, '../build/index.html')}`; // Production build

    try {
        await mainWindow.loadURL(startUrl);
        log.info('Window loaded successfully');

        // Initialize application components
        const menu = createMenu(mainWindow);
        Menu.setApplicationMenu(menu);
        cleanupIPC = setupIPC(mainWindow);

        // Configure renderer process logging
        mainWindow.webContents.on('did-finish-load', () => {
            mainWindow.webContents.send('configure-logger', {
                isDev,
                logPath: path.join(app.getPath('userData'), 'logs/renderer.log')
            });
        });

        // Prevent dangling references
        mainWindow.on('closed', () => {
            mainWindow = null;
        });

        // Enable DevTools in development
        if (isDev) {
            mainWindow.webContents.openDevTools();
        }

    } catch (error) {
        log.error('Error loading window:', error);
        throw error;
    }
}

/**
 * Application Lifecycle Management
 * 
 * Implements graceful startup with error recovery:
 * - Attempts window creation
 * - Shows error messages on failure
 * - Delays quit to ensure error messages are visible
 */
app.on('ready', async () => {
    try {
        log.info('App is ready, creating window...');
        await createWindow();
        log.info('Window created successfully');
    } catch (error) {
        log.error('Startup error:', error);
        if (mainWindow) {
            mainWindow.webContents.send('show-error', 'Failed to start application');
        }
        // Delay quit to ensure error message visibility
        setTimeout(() => app.quit(), 3000);
    }
});

// Handle macOS dock click behavior
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

/**
 * Graceful Shutdown Implementation
 * 
 * Ensures proper cleanup before exit:
 * - Prevents multiple quit attempts
 * - Runs cleanup handlers
 * - Forces quit after timeout
 * - Logs cleanup errors
 */
app.on('before-quit', (event) => {
    if (isQuitting) return;
    
    log.info('App is about to quit');
    event.preventDefault();
    isQuitting = true;
    
    try {
        // Run cleanup tasks
        if (typeof cleanupIPC === 'function') {
            cleanupIPC();
        }
        
        if (mainWindow) {
            mainWindow.close();
        }
        
        // Force quit after brief delay to ensure cleanup completes
        setTimeout(() => {
            app.exit(0);
        }, 100);
    } catch (error) {
        log.error('Error during cleanup:', error);
        app.exit(1);
    }
});

/**
 * Global Error Handling
 * 
 * Catches unhandled errors and rejections:
 * - Logs errors for debugging
 * - Shows user-friendly messages
 * - Maintains application stability
 */
process.on('uncaughtException', (error) => {
    log.error('Uncaught exception:', error);
    if (mainWindow) {
        mainWindow.webContents.send('show-error', {
            message: 'An unexpected error occurred',
            details: error.message
        });
    }
});

process.on('unhandledRejection', (error) => {
    log.error('Unhandled rejection:', error);
    if (mainWindow) {
        mainWindow.webContents.send('show-error', {
            message: 'An unexpected error occurred',
            details: error.message
        });
    }
});