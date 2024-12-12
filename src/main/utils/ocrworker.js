const { parentPort, workerData } = require('worker_threads');
const { createWorker } = require('tesseract.js');
const fs = require('fs/promises'); 
const sharp = require('sharp');
const log = require('electron-log');

let tesseractWorker = null;

async function initializeTesseract() {
    log.debug('Starting Tesseract initialization');
    log.debug('Lang path:', workerData.langPath);
    log.debug('Default language:', workerData.defaultLanguage);

    tesseractWorker = await createWorker({
        logger: m => {
            // Only log errors or important status changes
            logger: m => { 
                if (m.status === 'error' || 
                    m.status === 'initialized' || 
                    m.status === 'terminated') {
                    log.debug(m);
                }
            }
        },
        langPath: workerData.langPath,
        cacheMethod: 'readOnly',
    });

    await tesseractWorker.loadLanguage(workerData.defaultLanguage);
    await tesseractWorker.initialize(workerData.defaultLanguage);
    await tesseractWorker.setParameters({
        preserve_interword_spaces: '1',
        tessedit_pageseg_mode: '1',
    });
    log.debug('Tesseract worker fully initialized');
}

async function processImage(imagePath) {
    try {
        if (!tesseractWorker) {
            await initializeTesseract();
        }
        
        const processedImagePath = imagePath.replace('.png', '-processed.png');
        await sharp(imagePath)
            .greyscale()
            .normalize()
            .toFile(processedImagePath);

        const { data } = await tesseractWorker.recognize(processedImagePath);

        const linebuf = [];

        if (data.lines && Array.isArray(data.lines)) {
            const sortedLines = data.lines.sort((a, b) => a.bbox.y0 - b.bbox.y0);

            const totalWidth = sortedLines.reduce((sum, line) => 
                sum + line.words.reduce((lineSum, word) => lineSum + word.bbox.x1 - word.bbox.x0, 0), 0);

            const totalChars = sortedLines.reduce((sum, line) => 
                sum + line.words.reduce((lineSum, word) => lineSum + word.text.length, 0), 0);

            const avgCharWidth = totalWidth / totalChars;

            for (const line of sortedLines) {
                const indent = Math.max(0, Math.floor(line.bbox.x0 / avgCharWidth));
                const text = ' '.repeat(indent) + line.text;
                linebuf.push(text);
            }
        } else {
            log.debug(`No lines found in OCR result for page ${pageNum}`);
        }
        //log.debug('processed result:', linebuf);
        return linebuf.join('');
    
    } catch (error) {
        throw error;
    }
}

log.debug('OCR Worker starting with data:', workerData);

// Handle messages from main thread
parentPort.on('message', async ({ imagePath }) => {
    try {
        log.debug(`Received OCR request for: ${imagePath}`);

        try {
            const stats = await fs.stat(imagePath);
            log.debug(`Image file exists, size: ${stats.size} bytes`);
        } catch (error) {
            throw new Error(`Cannot access image file: ${error.message}`);
        }

        if (!tesseractWorker) {
            log.debug('Tesseract worker not initialized, initializing now');
            await initializeTesseract();
        }

        log.debug(`OCR processing image: ${imagePath}`);
        const text = await processImage(imagePath);
        log.debug(`OCR completed for ${imagePath}, text length: ${text.length}`);
        
        parentPort.postMessage({ success: true, text });
    } catch (error) {
        log.error('OCR worker error:', error);
        parentPort.postMessage({ 
            success: false, 
            error: error.message,
            stack: error.stack
        });
    }
});

// Cleanup when worker is terminated
process.on('exit', async () => {
    log.debug('Worker process exiting');
    if (tesseractWorker) {
        await tesseractWorker.terminate();
    }
});