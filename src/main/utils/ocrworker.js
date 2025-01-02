/**
 * OCR Worker Thread
 * Handles OCR processing using Tesseract.js in a separate thread
 * Features:
 * - Image preprocessing with Sharp
 * - Text layout preservation
 * - Error handling and logging
 * - Resource cleanup
 */

const { parentPort, workerData } = require('worker_threads');
const { createWorker } = require('tesseract.js');
const fs = require('fs/promises'); 
const sharp = require('sharp');
const log = require('electron-log');
const path = require('path');

/**
 * @typedef {Object} OCRResult
 * @property {boolean} success - Whether OCR was successful
 * @property {string} [text] - Extracted text if successful
 * @property {string} [error] - Error message if unsuccessful
 * @property {string} [stack] - Error stack trace if unsuccessful
 */

/**
 * @typedef {Object} WorkerConfig
 * @property {string} langPath - Path to Tesseract language files
 * @property {string} defaultLanguage - Default OCR language
 */

// Global worker instance
let tesseractWorker = null;

/**
 * Initialize Tesseract worker with specified configuration
 * @throws {Error} If initialization fails
 */
async function initializeTesseract() {
    try {
        log.debug('Initializing Tesseract:', {
            langPath: workerData.langPath,
            language: workerData.defaultLanguage
        });

        tesseractWorker = await createWorker({
            logger: m => {
                if (m.status === 'error') {
                    log.error('Tesseract error:', m);
                } else if (['initialized', 'terminated'].includes(m.status)) {
                    log.info('Tesseract status:', m);
                } else {
                    log.debug('Tesseract progress:', m);
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

        log.info('Tesseract initialization complete');
    } catch (error) {
        log.error('Tesseract initialization failed:', error);
        throw error;
    }
}

/**
 * Process image with OCR
 * @param {string} imagePath - Path to image file
 * @returns {Promise<string>} Extracted text with preserved layout
 * @throws {Error} If processing fails
 */
async function processImage(imagePath) {
    let processedImagePath = null;
    try {
        if (!tesseractWorker) {
            await initializeTesseract();
        }
        
        // Create processed image path in same directory
        processedImagePath = imagePath.replace('.png', '-processed.png');

        // Preprocess image for better OCR
        await sharp(imagePath)
            .greyscale()
            .normalize()
            .toFile(processedImagePath);

        // Perform OCR
        const { data } = await tesseractWorker.recognize(processedImagePath);

        // Process OCR results
        return processOCRData(data);
    } catch (error) {
        log.error('Image processing error:', {
            path: imagePath,
            error: error.message
        });
        throw error;
    } finally {
        // Cleanup processed image
        if (processedImagePath) {
            try {
                await fs.unlink(processedImagePath);
            } catch (error) {
                log.warn('Failed to cleanup processed image:', error);
            }
        }
    }
}

/**
 * Process OCR data and preserve layout
 * @param {Object} data - Tesseract OCR result data
 * @returns {string} Formatted text with preserved layout
 */
function processOCRData(data) {
    const linebuf = [];

    if (!data.lines?.length) {
        log.warn('No lines found in OCR result');
        return '';
    }

    try {
        // Sort lines by vertical position
        const sortedLines = data.lines.sort((a, b) => a.bbox.y0 - b.bbox.y0);

        // Calculate average character width for indentation
        const metrics = calculateTextMetrics(sortedLines);
        const avgCharWidth = metrics.totalWidth / metrics.totalChars;

        // Process each line
        for (const line of sortedLines) {
            const indent = Math.max(0, Math.floor(line.bbox.x0 / avgCharWidth));
            const text = ' '.repeat(indent) + line.text;
            linebuf.push(text);
        }

        return linebuf.join('');
    } catch (error) {
        log.error('OCR data processing error:', error);
        throw error;
    }
}

/**
 * Calculate text metrics for layout preservation
 * @param {Array} lines - Array of OCR line data
 * @returns {Object} Calculated metrics
 */
function calculateTextMetrics(lines) {
    return lines.reduce((metrics, line) => {
        const lineMetrics = line.words.reduce((lineSum, word) => ({
            width: lineSum.width + (word.bbox.x1 - word.bbox.x0),
            chars: lineSum.chars + word.text.length
        }), { width: 0, chars: 0 });

        return {
            totalWidth: metrics.totalWidth + lineMetrics.width,
            totalChars: metrics.totalChars + lineMetrics.chars
        };
    }, { totalWidth: 0, totalChars: 0 });
}

/**
 * Verify image file accessibility
 * @param {string} imagePath - Path to image file
 * @throws {Error} If file is inaccessible
 */
async function verifyImageFile(imagePath) {
    try {
        const stats = await fs.stat(imagePath);
        log.debug('Image file verified:', {
            path: imagePath,
            size: stats.size
        });
    } catch (error) {
        log.error('Image file access error:', {
            path: imagePath,
            error: error.message
        });
        throw new Error(`Cannot access image file: ${error.message}`);
    }
}

// Initialize worker
log.info('OCR Worker starting:', workerData);

// Handle messages from main thread
parentPort.on('message', async ({ imagePath }) => {
    try {
        log.debug('Processing OCR request:', { path: imagePath });

        await verifyImageFile(imagePath);

        if (!tesseractWorker) {
            log.debug('Initializing Tesseract worker');
            await initializeTesseract();
        }

        const text = await processImage(imagePath);
        
        log.debug('OCR completed:', {
            path: imagePath,
            textLength: text.length
        });
        
        parentPort.postMessage({ success: true, text });
    } catch (error) {
        log.error('OCR processing error:', {
            error: error.message,
            stack: error.stack
        });
        
        parentPort.postMessage({ 
            success: false, 
            error: error.message,
            stack: error.stack
        });
    }
});

// Cleanup handler
async function cleanup() {
    log.debug('Starting worker cleanup');
    try {
        if (tesseractWorker) {
            await tesseractWorker.terminate();
            tesseractWorker = null;
            log.debug('Tesseract worker terminated');
        }
    } catch (error) {
        log.error('Cleanup error:', error);
    }
}

// Register cleanup handlers
process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', error => {
    log.error('Uncaught exception:', error);
    cleanup().then(() => process.exit(1));
});