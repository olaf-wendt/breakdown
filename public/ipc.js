/**
 * IPC (Inter-Process Communication) setup for Electron
 * Manages file operations, content persistence, and script parsing
 * between the main process and renderer process
 */
const { ipcMain, dialog, app } = require('electron');
const log = require('electron-log');
const path = require('path');
const { promises: fs } = require('fs');
const { parseScript, tokensToHtml, htmlToTokens } = require('../src/main/utils/parser.js');
const { readPdf, backgroundOcrTask, readScript } = require('../src/main/utils/readpdf.js');
const { writeScriptCsv, writeScenesCsv, writeTokens, writeHtml, writeScriptRaw } = require('../src/main/utils/savescript.js');
const { EDITOR_CONFIG } = require('../src/config.main.js');

/**
 * Sets up IPC handlers for the main window
 * Returns cleanup function to remove handlers on window close
 * 
 * @param {BrowserWindow} mainWindow - Electron browser window instance
 * @returns {Function} Cleanup function to remove all handlers
 */
function setupIPC(mainWindow) {
    // Tracks current file for save operations
    let currentFileName = null;

    /**
     * Handles file opening with optional OCR processing
     * Supports PDF (with/without OCR) and plain text script formats
     * 
     * @param {boolean} useOCR - Whether to process PDFs with OCR
     * @throws {Error} On file read or processing failure
     */
    const handleFileOpen = async (useOCR = false) => {
        log.debug('IPC: Handling menu-open-file');
        try {
            // Configure dialog filters based on OCR mode
            const { filePaths } = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: useOCR 
                    ? [{ name: 'PDF Files', extensions: ['pdf'] }]
                    : [{ name: 'Script Files', extensions: ['txt', 'html', 'fountain'] }]
            });

            if (!filePaths?.length) return;

            // Track file info for save operations
            const filePath = filePaths[0];
            const fileName = path.basename(filePath);
            const fileExt = path.extname(filePath).toLowerCase();
            log.info(`Opening file: ${filePath} with extension ${fileExt}`);
            currentFileName = fileName;
    
            let content;
            // Handle PDF processing with progress feedback
            if (fileExt === '.pdf' && useOCR) {
                // Show persistent toast for OCR progress
                mainWindow.webContents.send('show-info', 'Starting OCR process...', {
                    toastId: 'ocr-progress',
                    autoClose: false
                });

                // Process PDF with OCR, updating progress
                content = await backgroundOcrTask(filePath, (progress) => {
                    const { page, total } = progress;
                    mainWindow.webContents.send('update-toast', 
                        'ocr-progress',
                        `OCR in progress: page ${page} of ${total}`
                    );
                });

                // Cleanup OCR progress notifications
                mainWindow.webContents.send('dismiss-toast', 'ocr-progress');
                mainWindow.webContents.send('show-success', 'OCR completed successfully');
            } else if (fileExt === '.pdf') {
                content = await readPdf(filePath);
            } else {
                content = await readScript(filePath);
            }
    
            // Parse content and convert to editor format
            try {
                const [tokens, entities] = await parseScript(content);
                if (!tokens) {
                    log.error("Parsing failed: tokens is null");
                } else {
                    log.debug("Tokens array length:", tokens.length);
                }
                const html = await tokensToHtml(tokens, entities);

                // Update editor state
                mainWindow.webContents.send('set-file-name', fileName);
                mainWindow.webContents.send('set-editor-content', html);
                await handleSaveContent(null, { content: html }); // Ensure recovery backup
            } catch (error) {
                log.error('Error in parsing/conversion:', error);
                mainWindow.webContents.send('show-error', 'Failed to process file');
                throw error;
            }
        } catch (error) {
            log.error('Error opening file:', error);
            mainWindow.webContents.send('show-error', 'Failed to open file');
            throw error;
        }
    };

    /**
     * Handles file saving with format conversion
     * Supports multiple output formats with appropriate conversions
     * 
     * @throws {Error} On save failure or unsupported format
     */
    const handleFileSave = async () => {
        log.debug('IPC: Handling menu-save-file');
        try {
            // Request content from renderer with timeout protection
            const content = await new Promise((resolve, reject) => {
                mainWindow.webContents.send('get-editor-content');
                
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout waiting for editor content'));
                }, 5000);

                ipcMain.once('editor-content', (_, content) => {
                    clearTimeout(timeout);
                    resolve(content);
                });
            });

            // Get save location from user
            const { filePath, canceled } = await dialog.showSaveDialog({
                defaultPath: path.join(app.getPath('documents'), currentFileName || 'script'),
                filters: [
                    { name: 'Text Files', extensions: ['txt'] },
                    { name: 'CSV Files', extensions: ['csv'] },
                    { name: 'Excel Files', extensions: ['xlsx'] },
                    { name: 'HTML Files', extensions: ['html'] },
                ]
            });
    
            if (canceled || !filePath) return;
    
            // Convert and save based on chosen format
            const fileExt = path.extname(filePath).toLowerCase();
            const fileName = path.basename(filePath);
            const [tokens, entities] = htmlToTokens(content);
            currentFileName = fileName;
            
            switch (fileExt) {
                case '.txt':
                    await writeTokens(tokens, entities, filePath, false);
                    break;
                case '.csv':
                case '.xlsx':
                    await writeScriptCsv(tokens, entities, filePath, true);
                    break;
                case '.html':
                    await writeHtml(content, filePath);
                    break;
                default:
                    throw new Error(`Unsupported file extension: ${fileExt}`);
            }
            mainWindow.webContents.send('set-file-name', fileName);
            mainWindow.webContents.send('show-success', 'File saved successfully');
        } catch (error) {
            log.error('Error saving file:', error);
            mainWindow.webContents.send('show-error', 'Failed to save file');
            throw error;
        }
    };

    /**
     * Auto-recovery content handlers
     * Maintains a backup of editor content in app's user data directory
     */
    const handleLoadContent = async () => {
        try {
            const filePath = path.join(app.getPath('userData'), 'content.html');
            try {
                const content = await fs.readFile(filePath, 'utf8');
                return content;
            } catch (err) {
                // Return default content if no backup exists
                if (err.code === 'ENOENT') {
                    return EDITOR_CONFIG.defaultContent;
                }
                throw err;
            }
        } catch (err) {
            log.error('Error loading content:', err);
            throw err;
        }
    };

    const handleSaveContent = async (_, { content }) => {
        try {
            const filePath = path.join(app.getPath('userData'), 'content.html');
            await fs.writeFile(filePath, content, 'utf8');
            return true;
        } catch (err) {
            log.error('Error auto-saving content:', err);
            throw err;
        }
    };

    // Script parsing handlers
    const handleParseScript = async (_, { text }) => {
        try {
            const [tokens, entities] = parseScript(text);
            return {
                tokens,
                entities,
                html: tokensToHtml(tokens)
            };
        } catch (error) {
            log.error('Error parsing script:', error);
            throw error;
        }
    };

    const handleParseHtml = async (_, { html }) => {
        try {
            return htmlToTokens(html);
        } catch (error) {
            log.error('Error parsing HTML:', error);
            throw error;
        }
    };

    // Register IPC handlers with cleanup support
    const invokeHandlers = {
        'handle-file-open': (_, useOCR) => handleFileOpen(useOCR),
        'handle-file-save': () => handleFileSave(),
    };

    const fileHandlers = {
        'load-content': handleLoadContent,
        'save-content': handleSaveContent,
        'parse-script': handleParseScript,
        'parse-html': handleParseHtml
    };

    // Register all handlers
    Object.entries(invokeHandlers).forEach(([channel, handler]) => {
        ipcMain.handle(channel, handler);
    });

    Object.entries(fileHandlers).forEach(([event, handler]) => {
        ipcMain.handle(event, handler);
    });

    /**
     * Cleanup function to prevent memory leaks
     * Removes all registered handlers when window closes
     */
    const cleanup = () => {
        Object.keys(invokeHandlers).forEach(channel => {
            ipcMain.removeHandler(channel);
        });

        Object.keys(fileHandlers).forEach(event => {
            ipcMain.removeHandler(event);
        });

        ipcMain.removeAllListeners('editor-content');
    };

    return cleanup;
}

module.exports = { setupIPC };