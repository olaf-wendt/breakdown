const { dialog, ipcMain } = require('electron');
const axios = require('axios');
const path = require('path');
const log = require('electron-log');

const API_URL = "http://127.0.0.1:3002/api";

let currentFileName = null;

async function handleFileOpen(mainWindow, useOCR) {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: useOCR ? [{ name: 'PDF Files', extensions: ['pdf'] }] : undefined
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    currentFileName = path.basename(filePath);
    mainWindow.setTitle(path.basename(filePath));

    if (useOCR && path.extname(filePath).toLowerCase() === '.pdf') {
      mainWindow.webContents.send('file-open-ocr', filePath);
    } else {
      try {
        const response = await axios.post(`${API_URL}/loadfile`, { filePath });
        mainWindow.webContents.send('set-editor-content', response.data.content);
      } catch (err) {
        console.error(`Error opening file:`, err);
        mainWindow.webContents.send('file-open-error', err.message);
      }
    }
  }
}

async function handleFileSave(mainWindow) {
  try {
    return new Promise((resolve, reject) => {
      mainWindow.webContents.send('get-editor-content');
      
      ipcMain.once('editor-content', async (event, content) => {
        if (!content) {
          reject(new Error('Failed to get editor content'));
          return;
        }

        const defaultName = currentFileName
        ? path.basename(currentFileName, path.extname(currentFileName)) + '.txt'
        : 'untitled.txt';

        const result = await dialog.showSaveDialog(mainWindow, {
          defaultPath: defaultName,
          filters: [
            { name: 'Text File', extensions: ['txt'] },
            { name: 'CSV File', extensions: ['csv'] },
          ],
        });

        if (!result.canceled && result.filePath) {
          await saveFileHandler({ filePath: result.filePath, content, full: true }, mainWindow);
          if (result.filePath.endsWith('.csv')) {
            await saveFileHandler({ filePath: result.filePath.replace('.csv', '-vfx.csv'), content, full: false }, mainWindow);
          }

          currentFileName = path.basename(result.filePath);
          mainWindow.setTitle(path.basename(result.filePath));
          mainWindow.webContents.send('file-saved', result.filePath);
          resolve(result.filePath);
        } else {
          resolve(null);
        }
      });

      // Set a timeout in case we don't receive the content
      setTimeout(() => {
        reject(new Error('Timeout waiting for editor content'));
      }, 5000);
    });
  } catch (error) {
    console.error('Error saving file:', error);
    mainWindow.webContents.send('file-save-error', error.message);
    throw error;
  }
}

async function saveFileHandler({ filePath, content, full }, mainWindow) {
  log.info(`Saving file: ${filePath}`);
  if (!filePath) {
    throw new Error('File path is not set');
  }
  const fileExtension = path.extname(filePath);
  let apiEndpoint;
  switch (fileExtension) {
    case '.txt':
      apiEndpoint = 'savetxt';
      break;
    case '.csv':
      apiEndpoint = 'savecsv';
      break;
    default:
      throw new Error(`Unsupported file type: ${fileExtension}`);
  }
  const response = await axios.post(`${API_URL}/${apiEndpoint}`, { filePath, content, full });
  log.info(`File saved: ${response.data}`);
  mainWindow.webContents.send('file-saved', response.data);
  return response.data;
}

module.exports = { handleFileOpen, handleFileSave, saveFileHandler };