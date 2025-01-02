/**
 * PDF Processing Module
 * Handles PDF reading, image conversion, and OCR processing
 * Features:
 * - PDF to image conversion using Poppler
 * - OCR processing using Tesseract.js
 * - Worker pool management for parallel processing
 * - Progress tracking and error handling
 */

const path = require('path');
const { promises: fs } = require('fs');
const os = require('os');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const { parseScript } = require('./parser');
const { tokensToHtml } = require('./htmlConverter');
const { app } = require('electron');
const log = require('electron-log');
const Queue = require('better-queue');
const { Worker } = require('worker_threads');
const { EDITOR_CONFIG } = require('../../config.main.js');
const { Poppler } = require('node-poppler');

// Configuration constants
const CONFIG = {
    isPackaged: app.isPackaged,
    defaultLanguage: EDITOR_CONFIG.ocr.defaultLanguage,
    pageWidthInInches: EDITOR_CONFIG.ocr.pageWidthInInches,
    dpiDefault: EDITOR_CONFIG.ocr.dpi,
    concurrentOCRtasks: Math.max(Math.floor(os.cpus().length * 0.75), 2),
    queueConfig: {
        concurrent: Math.max(Math.floor(os.cpus().length * 0.75), 2),
        maxRetries: 2,
        retryDelay: 2000,
        afterProcessDelay: 100,
        filo: false
    }
};

/**
 * Initialize Poppler paths based on environment
 * @returns {Object} Configured Poppler instance
 */
function initializePoppler() {
    let popplerPath;

    if (CONFIG.isPackaged) {
        const resourcesPath = path.dirname(app.getAppPath());
        const binPath = path.join(resourcesPath, 'bin');
        const libPath = path.join(resourcesPath, 'lib');
        
        log.debug('Poppler paths:', { resourcesPath, binPath, libPath });
        
        // Set library path based on platform
        if (process.platform === 'darwin') {
            process.env.DYLD_LIBRARY_PATH = libPath;
        } else if (process.platform === 'win32') {
            process.env.PATH = `${libPath};${process.env.PATH}`;
        } else {
            process.env.LD_LIBRARY_PATH = libPath;
        }
            
        popplerPath = binPath;
    }

    return (CONFIG.isPackaged && process.platform !== 'win32')
        ? new Poppler(popplerPath)
        : new Poppler();
}

const poppler = initializePoppler();

/**
 * Get file path relative to app resources
 * @param {string} relativePath - Path relative to app root
 * @returns {string} Absolute file path
 */
function getFilePath(relativePath) {
    const filePath = CONFIG.isPackaged
        ? path.join(process.resourcesPath, relativePath)
        : path.join(__dirname, '..', '..', '..', relativePath);
    
    log.debug('Resolved file path:', {
        relativePath,
        absolutePath: filePath,
        exists: require('fs').existsSync(filePath)
    });
    
    return filePath;
}

/**
 * Get temporary directory for processing
 * @returns {Promise<string>} Path to temporary directory
 */
async function getTempDir() {
    const tempDir = path.join(os.tmpdir(), 'breakdown-temp');
    await fs.mkdir(tempDir, { recursive: true });
    return tempDir;
}

/**
 * Read and process PDF file
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<string>} Extracted text content
 */
async function readPdf(pdfPath) {
    try {
        const tempDir = await getTempDir();
        const images = await pdfToImages(pdfPath, tempDir);
        const text = await ocrImages(images);
        await cleanup(images);
        return text;
    } catch (error) {
        log.error('Error reading PDF:', error);
        throw error;
    }
}

/**
 * Get PDF page count
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<number>} Number of pages
 */
async function getPdfPageCount(pdfPath) {
    try {
        const info = await poppler.pdfInfo(pdfPath);
        const pagesMatch = info.match(/Pages:\s+(\d+)/);
        if (!pagesMatch) {
            throw new Error('Could not determine page count from PDF info');
        }
        const pages = parseInt(pagesMatch[1]);
        log.debug('PDF page count:', pages);
        return pages;
    } catch (error) {
        log.error('Error getting PDF page count:', error);
        throw error;
    }
}

/**
 * Generator function for converting PDF pages to images
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputDir - Output directory for images
 * @param {number} [dpi=200] - DPI for image conversion
 * @yields {Object} Page information including image path
 */
async function* pdfToImagesGenerator(pdfPath, outputDir, dpi = 200) {
    log.debug('Converting PDF to images:', { outputDir, dpi });
    const pageCount = await getPdfPageCount(pdfPath);
    const paddingLength = pageCount.toString().length;
    
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const paddedNum = String(pageNum).padStart(paddingLength, '0');
        const imagePathRoot = path.join(outputDir, `page-${paddedNum}`);
        const imagePath = imagePathRoot + '.png';
            
        const options = {
            firstPageToConvert: pageNum,
            lastPageToConvert: pageNum,
            pngFile: true,
            singleFile: true,
            resolutionXYAxis: dpi
        };

        try {
            log.debug(`Converting page ${pageNum}/${pageCount}`);
            await poppler.pdfToCairo(pdfPath, imagePathRoot, options);
            
            await fs.access(imagePath);
            const stats = await fs.stat(imagePath);
            log.debug(`Generated image:`, { 
                page: pageNum, 
                size: stats.size,
                path: imagePath 
            });

            yield { imagePath, pageNum, total: pageCount };
        } catch (error) {
            log.error('Page conversion error:', {
                page: pageNum,
                error: error.message,
                options
            });
            throw new Error(`Failed to convert page ${pageNum}: ${error.message}`);
        }
    }
}

/**
 * Worker Pool for managing OCR worker threads
 */
class WorkerPool {
    constructor(size, langPath) {
        this.size = size;
        this.langPath = langPath;
        this.workers = [];
        this.available = [];
        this.waiting = [];
        this.activeWorkers = new Set();
    }

    async initialize() {
        log.debug(`Initializing worker pool:`, { size: this.size });
        for (let i = 0; i < this.size; i++) {
            try {
                const worker = await this.createWorker();
                this.workers.push(worker);
                this.available.push(worker);
                log.debug(`Worker ${i + 1} initialized`);
            } catch (error) {
                log.error(`Worker initialization error:`, { 
                    worker: i + 1, 
                    error 
                });
                throw error;
            }
        }
    }

    async createWorker() {
        const worker = new Worker(path.join(__dirname, 'ocrworker.js'), {
            workerData: {
                langPath: this.langPath,
                defaultLanguage: CONFIG.defaultLanguage + "+osd"
            }
        });

        worker.setMaxListeners(50);

        worker.on('error', (error) => {
            log.error('Worker error:', error);
            this.handleWorkerError(worker);
        });

        worker.on('exit', (code) => {
            log.debug(`Worker exited:`, { code });
        });

        return worker;
    }

    handleWorkerError(worker) {
        this.activeWorkers.delete(worker);
        const index = this.available.indexOf(worker);
        if (index > -1) {
            this.available.splice(index, 1);
        }
        
        this.createWorker()
            .then(newWorker => {
                this.workers.push(newWorker);
                this.available.push(newWorker);
                log.debug('Replaced failed worker');
            })
            .catch(error => {
                log.error('Worker replacement error:', error);
            });
    }

    async acquireWorker() {
        if (this.available.length > 0) {
            const worker = this.available.pop();
            this.activeWorkers.add(worker);
            log.debug('Worker acquired:', {
                active: this.activeWorkers.size,
                available: this.available.length
            });
            return worker;
        }
        
        return new Promise(resolve => {
            this.waiting.push(resolve);
        });
    }

    releaseWorker(worker) {
        this.activeWorkers.delete(worker);
        if (this.waiting.length > 0) {
            const resolve = this.waiting.shift();
            this.activeWorkers.add(worker);
            resolve(worker);
        } else {
            this.available.push(worker);
        }
        log.debug('Worker released:', {
            active: this.activeWorkers.size,
            available: this.available.length
        });
    }

    async cleanup() {
        log.debug('Cleaning up worker pool');
        await Promise.all(this.workers.map(worker => {
            worker.removeAllListeners();
            return worker.terminate();
        }));
        this.workers = [];
        this.available = [];
        this.waiting = [];
        this.activeWorkers.clear();
    }
}

/**
 * Process multiple images with OCR
 * @param {string[]} imagePaths - Array of image paths
 * @returns {Promise<string>} Combined OCR text
 */
async function ocrImages(imagePaths) {
    const texts = await Promise.all(imagePaths.map(ocrImage));
    return texts.join('\n===========\n');
}

/**
 * Process single image with OCR
 * @param {string} imagePath - Path to image file
 * @param {Worker} worker - OCR worker instance
 * @returns {Promise<string>} Extracted text
 */
async function ocrImage(imagePath, worker) {
    return new Promise((resolve, reject) => {
        log.debug(`Starting OCR:`, { imagePath });
        
        const messageHandler = (result) => {
            worker.removeListener('message', messageHandler);
            if (result.success) {
                log.debug(`OCR successful:`, {
                    path: imagePath,
                    textLength: result.text.length
                });
                resolve(result.text);
            } else {
                log.error(`OCR failed:`, {
                    path: imagePath,
                    error: result.error
                });
                reject(new Error(result.error));
            }
        };

        const errorHandler = (error) => {
            log.error(`Worker error:`, {
                path: imagePath,
                error
            });
            worker.removeListener('error', errorHandler);
            reject(error);
        };

        worker.once('message', messageHandler);
        worker.once('error', errorHandler);
        worker.postMessage({ imagePath });
    });
}

/**
 * Process PDF with OCR in background
 * @param {string} pdfPath - Path to PDF file
 * @param {Function} progressCallback - Progress update callback
 * @returns {Promise<string>} Extracted text
 */
async function backgroundOcrTask(pdfPath, progressCallback) {
    let queue = null;
    let workerPool = null;
    let tempDir = null;

    try {
        tempDir = await getTempDir();
        const chunks = [];
        let completedTasks = 0;

        const totalPages = await getPdfPageCount(pdfPath);
        const langPath = getFilePath('lang-data');
        
        log.debug('Initializing OCR:', {
            langPath,
            totalPages,
            workers: CONFIG.concurrentOCRtasks
        });

        workerPool = new WorkerPool(CONFIG.concurrentOCRtasks, langPath);
        await workerPool.initialize();

        queue = new Queue(async (task, cb) => {
            let worker = null;
            try {
                if (!task?.imagePath) {
                    throw new Error(`Invalid task: ${JSON.stringify(task)}`);
                }

                const { imagePath, pageNum, total } = task;
                log.debug(`Processing page:`, { pageNum, total });
        
                await fs.access(imagePath);
                const stats = await fs.stat(imagePath);
                log.debug(`Image verified:`, {
                    page: pageNum,
                    size: stats.size
                });
        
                worker = await workerPool.acquireWorker();
                if (!worker) {
                    throw new Error(`Worker acquisition failed: page ${pageNum}`);
                }
        
                const pageText = await ocrImage(imagePath, worker);
                chunks[pageNum - 1] = pageText;
                
                await fs.unlink(imagePath);
                
                completedTasks++;
                if (progressCallback) {
                    progressCallback({
                        progress: (completedTasks / total) * 100,
                        page: pageNum,
                        total: totalPages
                    });
                }
        
                cb(null);
            } catch (error) {
                log.error('OCR task error:', error);
                cb(error);
            } finally {
                if (worker) {
                    workerPool.releaseWorker(worker);
                }
            }
        }, CONFIG.queueConfig);

        log.debug('Starting PDF conversion:', { path: pdfPath });

        for await (const pageInfo of pdfToImagesGenerator(pdfPath, tempDir)) {
            queue.push(pageInfo);
        }

        await new Promise((resolve, reject) => {
            queue.on('drain', resolve);
            queue.on('error', reject);
        });
        
        log.debug('OCR complete:', { pages: chunks.length });
        return chunks.join('\n===========\n');
    } catch (error) {
        log.error('Background OCR error:', error);
        throw error;
    } finally {
        await cleanup([workerPool, queue, tempDir]);
    }
}

/**
 * Cleanup resources
 * @param {Array} resources - Resources to clean up
 */
async function cleanup(resources) {
    try {
        if (Array.isArray(resources)) {
            await Promise.all(resources.map(resource => {
                if (resource instanceof WorkerPool) {
                    return resource.cleanup();
                }
                if (resource instanceof Queue) {
                    resource.destroy();
                }
                if (typeof resource === 'string') {
                    return fs.rm(resource, { recursive: true, force: true });
                }
                return Promise.resolve();
            }));
        } else if (typeof resources === 'string') {
            await fs.unlink(resources).catch(() => {});
        }
    } catch (error) {
        log.error('Cleanup error:', error);
    }
}

/**
 * Read script file
 * @param {string} file - Path to script file
 * @returns {Promise<string>} Script content
 */
async function readScript(file) {
    try {
        return await fs.readFile(file, 'utf8');
    } catch (error) {
        log.error('Script read error:', error);
        throw error;
    }
}

/**
 * Write script file
 * @param {string} script - Script content
 * @param {string} file - Output file path
 */
async function writeScript(script, file) {
    try {
        await fs.writeFile(file, script, 'utf8');
    } catch (error) {
        log.error('Script write error:', error);
        throw error;
    }
}

module.exports = {
    readPdf,
    getPdfPageCount,
    backgroundOcrTask,
    writeScript,
    readScript
};