const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;
const log = require('electron-log');
const { setupIPC } = require('./ipc.js');
const { createMenu } = require('./menu.js');

// Configure logging
log.transports.file.level = isDev ? 'debug' : 'info';
log.transports.console.level = isDev ? 'debug' : 'info';

// Set the app name explicitly
app.name = 'Breakdown';

let mainWindow = null;
let cleanupIPC = null;
let isQuitting = false;

async function createWindow() {
    log.info('Creating window...');

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'Breakdown',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: !isDev // Enable webSecurity in production
        },
    });

    const startUrl = isDev 
        ? 'http://localhost:3001'  // React dev server
        : `file://${path.join(__dirname, '../build/index.html')}`;

    try {
        await mainWindow.loadURL(startUrl);
        log.info('Window loaded successfully');

        // Create menu
        const menu = createMenu(mainWindow);
        Menu.setApplicationMenu(menu);

        // Setup IPC handlers
        cleanupIPC = setupIPC(mainWindow);

        // Window management
        mainWindow.on('closed', () => {
            mainWindow = null;
        });

        if (isDev) {
            mainWindow.webContents.openDevTools();
        }

    } catch (error) {
        log.error('Error loading window:', error);
        throw error;
    }
}

// App event handlers
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
        // Don't quit immediately on error to allow error message to be shown
        setTimeout(() => app.quit(), 3000);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

app.on('before-quit', (event) => {
    if (isQuitting) return;
    
    log.info('App is about to quit');
    event.preventDefault();
    isQuitting = true;
    
    try {
        // Perform cleanup tasks
        if (typeof cleanupIPC === 'function') {
            cleanupIPC();
        }
        
        // Close the main window
        if (mainWindow) {
            mainWindow.close();
        }
        
        // Force quit after a short delay to ensure cleanup
        setTimeout(() => {
            app.exit(0);
        }, 100);
    } catch (error) {
        log.error('Error during cleanup:', error);
        app.exit(1);
    }
});

// Error handling
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