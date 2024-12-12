const { ipcMain, dialog, app } = require('electron');
const log = require('electron-log');
const path = require('path');
const { promises: fs } = require('fs');
const { parseScript, tokensToHtml, htmlToTokens } = require('../src/main/utils/parser.js');
const { readPdf, backgroundOcrTask, readScript } = require('../src/main/utils/readpdf.js');
const { writeScriptCsv, writeScenesCsv, writeTokens, writeHtml, writeScriptRaw } = require('../src/main/utils/savescript.js');
const { EDITOR_CONFIG } = require('../src/config.main.js');

function setupIPC(mainWindow) {
    // File operations
    const handleFileOpen = async (useOCR = false) => {
        log.debug('IPC: Handling menu-open-file');
        try {
            const { filePaths } = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: useOCR 
                    ? [{ name: 'PDF Files', extensions: ['pdf'] }]
                    : [{ name: 'Script Files', extensions: ['txt', 'html', 'fountain'] }]
            });

            if (!filePaths?.length) return;

            const filePath = filePaths[0];
            const fileExt = path.extname(filePath).toLowerCase();
            log.info(`Opening file: ${filePath} with extension ${fileExt}`);
    
            let content;
            if (fileExt === '.pdf' && useOCR) {
                mainWindow.webContents.send('show-info', 'Starting OCR process...', {
                    toastId: 'ocr-progress',
                    autoClose: false
                });

                content = await backgroundOcrTask(filePath, (progress) => {
                    const { page, total } = progress;
                    mainWindow.webContents.send('update-toast', 
                        'ocr-progress',
                        `OCR in progress: page ${page} of ${total}`
                    );
                });

                mainWindow.webContents.send('dismiss-toast', 'ocr-progress');
                mainWindow.webContents.send('show-success', 'OCR completed successfully');
            } else if (fileExt === '.pdf') {
                content = await readPdf(filePath);
            } else {
                content = await readScript(filePath);
            }
    
            // Parse the content and convert to HTML
            try {
                const [tokens, entities] = await parseScript(content);
                if (!tokens) {
                    log.error("Parsing failed: tokens is null");
                } else {
                    log.debug("Tokens array length:", tokens.length);
                }
                const html = await tokensToHtml(tokens, entities);
    
                mainWindow.webContents.send('set-editor-content', html);
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

    const handleFileSave = async () => {
        log.debug('IPC: Handling menu-save-file');
        try {
            // Get current editor content
            const content = await new Promise((resolve, reject) => {
                mainWindow.webContents.send('get-editor-content');
                
                // Set up timeout for response
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout waiting for editor content'));
                }, 5000);

                // Listen for response
                ipcMain.once('editor-content', (_, content) => {
                    clearTimeout(timeout);
                    resolve(content);
                });
            });

            const { filePath, canceled } = await dialog.showSaveDialog({
                filters: [
                    { name: 'Text Files', extensions: ['txt'] },
                    { name: 'CSV Files', extensions: ['csv'] },
                    { name: 'Excel Files', extensions: ['xlsx'] },
                    { name: 'HTML Files', extensions: ['html'] },
                ]
            });
    
            if (canceled || !filePath) return;
    
            const fileExt = path.extname(filePath).toLowerCase();
            const [tokens, entities] = htmlToTokens(content);
            
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
            mainWindow.webContents.send('show-success', 'File saved successfully');
        } catch (error) {
            log.error('Error saving file:', error);
            mainWindow.webContents.send('show-error', 'Failed to save file');
            throw error;
        }
    };

    // Auto-save content handlers
    const handleLoadContent = async () => {
        try {
            const filePath = path.join(app.getPath('userData'), 'content.html');
            try {
                const content = await fs.readFile(filePath, 'utf8');
                return content;
            } catch (err) {
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

    // Register all handlers
    const invokeHandlers = {
        'handle-file-open': (_, useOCR) => handleFileOpen(useOCR),
        'handle-file-save': () => handleFileSave(),
        // ... other handlers ...
    };

    const fileHandlers = {
        'load-content': handleLoadContent,
        'save-content': handleSaveContent,
        'parse-script': handleParseScript,
        'parse-html': handleParseHtml
    };

    // Register handlers
    Object.entries(invokeHandlers).forEach(([channel, handler]) => {
        ipcMain.handle(channel, handler);
    });

    Object.entries(fileHandlers).forEach(([event, handler]) => {
        ipcMain.handle(event, handler);
    });

    // Cleanup function
    const cleanup = () => {
        // Remove invoke handlers
        Object.keys(invokeHandlers).forEach(channel => {
            ipcMain.removeHandler(channel);
        });

        // Remove file operation handlers
        Object.keys(fileHandlers).forEach(event => {
            ipcMain.removeHandler(event);
        });

        // Remove any remaining one-time listeners
        ipcMain.removeAllListeners('editor-content');
    };

    return cleanup;
}

module.exports = { setupIPC };