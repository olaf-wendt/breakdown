const { app, Menu, MenuItem, dialog } = require('electron');
const log = require('electron-log');


function createMenu(mainWindow) {
    const appName = 'Breakdown';
  
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => {
                        log.debug('Menu: Open clicked');
                        mainWindow.webContents.send('menu-open-file');
                    }
                },
                {
                    label: 'Open with OCR',
                    accelerator: 'CmdOrCtrl+Shift+O',
                    click: () => {
                        log.debug('Menu: Open OCR clicked');
                        mainWindow.webContents.send('menu-open-ocr');
                    }
                },
                {
                    label: 'Save',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => {
                        log.debug('Menu: Save clicked');
                        mainWindow.webContents.send('menu-save');
                    }
                },
                { type: 'separator' },
                { label: `Quit ${appName}`, role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'delete' },
                { type: 'separator' },
                { role: 'selectAll' },
                { type: 'separator' },
                {
                    label: 'Find',
                    accelerator: 'CmdOrCtrl+F',
                    click: () => {
                        log.debug('Menu: Find clicked');
                        mainWindow.webContents.send('menu-find');
                    }
                },
                {
                    label: 'Renumber VFX Shots',
                    click: () => {
                        mainWindow.webContents.send('update-shot-number');
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(process.platform === 'darwin' ? [
                    { type: 'separator' },
                    { role: 'front' },
                    { type: 'separator' },
                    { role: 'window' }
                ] : [
                    { role: 'close' }
                ])
            ]
        },
        {
            role: 'help',
            submenu: [
                {
                    label: 'Learn More',
                    click: async () => {
                        const { shell } = require('electron');
                        await shell.openExternal('https://electronjs.org');
                    }
                }
            ]
        }
    ];

    // Add macOS-specific menu
    if (process.platform === 'darwin') {
        template.unshift({
            label: appName,
            submenu: [
                { label: `About ${appName}`, role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { label: `Hide ${appName}`, role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { label: `Quit ${appName}`, role: 'quit' }
            ]
        });
    }

    const menu = Menu.buildFromTemplate(template);
  
    // Force update the app name in the menu
    if (process.platform === 'darwin') {
        menu.items[0].label = appName;
    }

    return menu;
}

module.exports = { createMenu };