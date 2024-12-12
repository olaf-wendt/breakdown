import { ipcMain, dialog } from 'electron';
import path from 'path';
import log from 'electron-log';
import { parseScript, tokensToHtml, htmlToTokens } from './utils/parser.js';
import { readPdf, backgroundOcrTask, readScript } from './utils/readpdf.js';
import { 
    writeScriptCsv, 
    writeScenesCsv, 
    writeTokens, 
    writeHtml, 
    writeScriptRaw,
    exportAll,
    getUniqueFilename 
} from './utils/savescript.js';

// Store application state
const appState = {
    currentScript: null,
    currentTokens: null,
    currentEntities: null
};

export function setupIpcHandlers(mainWindow) {
    // File operations handlers
    ipcMain.handle('parse-script', async (_, { text }) => {
        try {
            const [tokens, entities] = parseScript(text);
            appState.currentScript = text;
            appState.currentTokens = tokens;
            appState.currentEntities = entities;

            return {
                tokens,
                entities,
                html: tokensToHtml(tokens)
            };
        } catch (error) {
            log.error('Error parsing script:', error);
            throw error;
        }
    });

    ipcMain.handle('parse-html', async (_, { html }) => {
        try {
            const [tokens, entities] = htmlToTokens(html);
            appState.currentTokens = tokens;
            appState.currentEntities = entities;
            return { tokens, entities };
        } catch (error) {
            log.error('Error parsing HTML:', error);
            throw error;
        }
    });

    // Export handlers
    ipcMain.handle('export-csv', async (_, { tokens, filename }) => {
        try {
            const savePath = await dialog.showSaveDialog({
                defaultPath: filename,
                filters: [{ name: 'CSV Files', extensions: ['csv'] }]
            });

            if (!savePath.filePath) return null;

            await writeScriptCsv(tokens, savePath.filePath);
            return savePath.filePath;
        } catch (error) {
            log.error('Error exporting CSV:', error);
            throw error;
        }
    });

    ipcMain.handle('export-scenes', async (_, { tokens, filename }) => {
        try {
            const savePath = await dialog.showSaveDialog({
                defaultPath: filename,
                filters: [{ name: 'CSV Files', extensions: ['csv'] }]
            });

            if (!savePath.filePath) return null;

            await writeScenesCsv(tokens, savePath.filePath);
            return savePath.filePath;
        } catch (error) {
            log.error('Error exporting scenes:', error);
            throw error;
        }
    });

    ipcMain.handle('export-html', async (_, { html, filename }) => {
        try {
            const savePath = await dialog.showSaveDialog({
                defaultPath: filename,
                filters: [{ name: 'HTML Files', extensions: ['html'] }]
            });

            if (!savePath.filePath) return null;

            await writeHtml(html, savePath.filePath);
            return savePath.filePath;
        } catch (error) {
            log.error('Error exporting HTML:', error);
            throw error;
        }
    });

    ipcMain.handle('export-all', async (_, { baseFilename }) => {
        try {
            if (!appState.currentTokens || !appState.currentEntities) {
                throw new Error('No script loaded');
            }

            const exportPath = await exportAll(
                appState.currentTokens,
                appState.currentEntities,
                baseFilename
            );

            return exportPath;
        } catch (error) {
            log.error('Error exporting all files:', error);
            throw error;
        }
    });

    // Cleanup function
    const cleanup = () => {
        // Export handlers
        ipcMain.removeHandler('export-csv');
        ipcMain.removeHandler('export-scenes');
        ipcMain.removeHandler('export-html');
        ipcMain.removeHandler('export-all');

        // Parse handlers
        ipcMain.removeHandler('parse-script');
        ipcMain.removeHandler('parse-html');
    };

    return cleanup;
}