const path = require('path');
const { promises: fs } = require('fs');
const os = require('os');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const { parseScript, tokensToHtml } = require('./parser');
const { app } = require('electron');
const log = require('electron-log');
const Queue = require('better-queue');
const { Worker } = require('worker_threads');
const { EDITOR_CONFIG } = require('../../config.main.js');
const { Poppler } = require('node-poppler');

const isPackaged = app.isPackaged;
const defaultLanguage = EDITOR_CONFIG.ocr.defaultLanguage;
const pageWidthInInches = EDITOR_CONFIG.ocr.pageWidthInInches;

const cpuCount = os.cpus().length;
const concurrentOCRtasks = EDITOR_CONFIG.ocr.maxConcurrent || 
    Math.max(Math.floor(cpuCount * 0.75), 2);

// Cache for Tesseract workers
const workers = new Map();

let popplerPath;

if (isPackaged) {
    const resourcesPath = path.dirname(app.getAppPath());
    const binPath = path.join(resourcesPath, 'bin');
    const libPath = path.join(resourcesPath, 'lib');
    
    // Verify paths exist
    console.log('resourcesPath:', resourcesPath);
    console.log('Binary path:', binPath);
    console.log('Library path:', libPath);
    console.log('binPath type:', typeof binPath);
    
    // Set library path based on platform
    if (process.platform === 'darwin')
        process.env.DYLD_LIBRARY_PATH = libPath;
    else if (process.platform === 'win32')
        process.env.PATH = `${libPath};${process.env.PATH}`;
    else  // linux
        process.env.LD_LIBRARY_PATH = libPath;
        
    popplerPath = binPath;
}

const poppler = isPackaged
    ? new Poppler(popplerPath)
    : new Poppler();

function getFilePath(relativePath) {
    const filePath = isPackaged
        ? path.join(process.resourcesPath, relativePath)
        : path.join(__dirname, '..', '..', '..', relativePath);
    
    log.debug('Resolved file path:', {
        relativePath,
        absolutePath: filePath,
        exists: require('fs').existsSync(filePath)
    });
    
    return filePath;
}

function getPopplerPath() {
    const platform = process.platform;

    if (isPackaged) {
        // For packaged app, binaries should be in resources/bin
        const binPath = path.join(process.resourcesPath, 'bin');
        const libPath = path.join(process.resourcesPath, 'lib');
        
        if (platform === 'darwin') {
            process.env.DYLD_LIBRARY_PATH = libPath;
            return path.join(binPath, 'pdfinfo');
        } else if (platform === 'win32') {
            process.env.PATH = `${libPath};${process.env.PATH}`;
            return path.join(binPath, 'pdfinfo.exe');
        } else {
            // Linux
            process.env.LD_LIBRARY_PATH = libPath;
            return path.join(binPath, 'pdfinfo');
        }
    } else {
        // For development, use pdf-poppler's bundled binaries
        const popplerModulePath = path.join(__dirname, '../../../node_modules/pdf-poppler/lib');
        
        if (platform === 'darwin') {
            const libPath = path.join(popplerModulePath, 'osx/poppler-0.66/lib');
            process.env.DYLD_LIBRARY_PATH = libPath;
            return path.join(popplerModulePath, 'osx/poppler-0.66/bin/pdfinfo');
        } else if (platform === 'win32') {
            const libPath = path.join(popplerModulePath, 'win/poppler-0.68.0/bin');
            process.env.PATH = `${libPath};${process.env.PATH}`;
            return path.join(libPath, 'pdfinfo.exe');
        } else {
            // Linux
            const libPath = path.join(popplerModulePath, 'linux/poppler-0.66/lib');
            process.env.LD_LIBRARY_PATH = libPath;
            return path.join(popplerModulePath, 'linux/poppler-0.66/bin/pdfinfo');
        }
    }
    // if (isPackaged) {
    //     const binPath = path.join(process.resourcesPath, 'bin');
    //     return platform === 'win32' 
    //         ? path.join(binPath, 'pdftoppm.exe')
    //         : path.join(binPath, 'pdftoppm');
    // } else {
    //     return platform === 'win32'
    //         ? 'C:\\msys64\\mingw64\\bin\\pdftoppm.exe'
    //         : '/opt/homebrew/bin/pdftoppm';
    // }
}

async function getTempDir() {
    const tempDir = path.join(os.tmpdir(), 'breakdown-temp');
    await fs.mkdir(tempDir, { recursive: true });
    return tempDir;
}

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

async function getPdfPageCount(pdfPath) {
    try {
        const info = await poppler.pdfInfo(pdfPath);
        const pagesMatch = info.match(/Pages:\s+(\d+)/);
        if (!pagesMatch) {
            throw new Error('Could not determine page count from PDF info');
        }
        const pages = parseInt(pagesMatch[1]);
        log.debug('PDF page count', pages);
        return pages;
    } catch (error) {
        log.error('Error getting PDF page count:', error);
        throw error;
    }
}

async function* pdfToImagesGenerator(pdfPath, outputDir, dpi = 300) {
    log.debug('temp output dir', outputDir);
    //const info = await pdfPoppler.info(pdfPath, { binary: popplerPath });
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
            //scale: dpi * pageWidthInInches,
        };
        try {
            log.debug(`Converting page ${pageNum}/${pageCount} to ${imagePath}`);
            await poppler.pdfToCairo(pdfPath, imagePathRoot, options);
            log.debug(`Successfully converted page ${pageNum}`);
        } catch (error) {
            log.error('pdfToCairo error:', {
                error: error.message,
                stack: error.stack,
                page: pageNum,
                options,
                pdfPath,
                imagePath
            });
            throw new Error(`Failed to convert page ${pageNum}: ${error.message}`);
        }

        try {
            await fs.access(imagePath);
            const stats = await fs.stat(imagePath);
            log.debug(`Generated image size: ${stats.size} bytes`);
            const pageInfo = { imagePath, pageNum, total: pageCount };
            log.debug('Yielding page info:', pageInfo);
            yield pageInfo;
        } catch (err) {
            log.error(`Failed to find converted image: ${imagePath}`);
            throw new Error(`Failed to convert page ${pageNum}`);
        }
    }
}

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
        log.debug(`Initializing worker pool with ${this.size} workers`);
        for (let i = 0; i < this.size; i++) {
            try {
                const worker = await this.createWorker();
                this.workers.push(worker);
                this.available.push(worker);
                log.debug(`Worker ${i + 1} initialized`);
            } catch (error) {
                log.error(`Failed to initialize worker ${i + 1}:`, error);
                throw error;
            }
        }
        log.debug('Worker pool initialization complete');
    }


    async createWorker() {
        // Create a true Node.js worker thread
        const worker = new Worker(path.join(__dirname, 'ocrworker.js'), {
            workerData: {
                langPath: this.langPath,
                defaultLanguage: defaultLanguage+"+osd"
            }
        });

        worker.setMaxListeners(50);

        // Handle worker errors
        worker.on('error', (error) => {
            log.error('Worker thread error:', error);
            this.handleWorkerError(worker);
        });

        worker.on('exit', (code) => {
            log.debug(`Worker exited with code ${code}`);
        });


        return worker;
    }

    handleWorkerError(worker) {
        // Remove from active and available pools
        this.activeWorkers.delete(worker);
        const availableIndex = this.available.indexOf(worker);
        if (availableIndex > -1) {
            this.available.splice(availableIndex, 1);
        }
        
        // Replace the worker
        this.createWorker().then(newWorker => {
            this.workers.push(newWorker);
            this.available.push(newWorker);
        }).catch(err => {
            log.error('Failed to create replacement worker:', err);
        });
    }

    async acquireWorker() {
        if (this.available.length > 0) {
            const worker = this.available.pop();
            this.activeWorkers.add(worker);
            log.debug(`Worker acquired. Active: ${this.activeWorkers.size}, Available: ${this.available.length}`);
            return worker;
        }
        
        log.debug(`Waiting for worker. Active: ${this.activeWorkers.size}, Available: ${this.available.length}`);
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
        log.debug(`Worker released. Active: ${this.activeWorkers.size}, Available: ${this.available.length}`);
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

async function ocrImages(imagePaths) {
    const texts = await Promise.all(imagePaths.map(ocrImage));
    return texts.join('\n===========\n');
}

async function ocrImage(imagePath, worker) {
    return new Promise((resolve, reject) => {
        log.debug(`Starting OCR for image: ${imagePath}`);
        
        const messageHandler = (result) => {
            log.debug('Received message from worker');
            worker.removeListener('message', messageHandler);
            if (result.success) {
                log.debug(`OCR successful for ${imagePath}, text length: ${result.text.length}`);
                resolve(result.text);
            } else {
                log.error(`OCR failed for ${imagePath}:`, result.error);
                reject(new Error(result.error));
            }
        };

        const errorHandler = (error) => {
            log.error(`Worker error for ${imagePath}:`, error);
            worker.removeListener('error', errorHandler);
            reject(error);
        };

        worker.once('message', messageHandler);
        worker.once('error', errorHandler);
        
        log.debug(`Sending OCR request to worker for ${imagePath}`);
        worker.postMessage({ imagePath });
    });
}


async function backgroundOcrTask(pdfPath, progressCallback) {
    let queue = null;
    let workerPool = null;
    let tempDir = null;

    try {
        tempDir = await getTempDir();
        const chunks = [];
        let completedTasks = 0;

        //log.debug('poppler path', getPopplerPath());
        // const info = await pdfPoppler.info(pdfPath, { binary: getPopplerPath() });
        const totalPages = await getPdfPageCount(pdfPath);
        
        const langPath = getFilePath('lang-data');
        log.debug('lang-data path', langPath, isPackaged);
        workerPool = new WorkerPool(concurrentOCRtasks, getFilePath('lang-data'));
        await workerPool.initialize();

        log.debug(`Starting OCR with ${concurrentOCRtasks} workers for ${totalPages} pages`);

        queue = new Queue(async (task, cb) => {
            let worker = null;
            try {
                if (!task || !task.imagePath) {
                    throw new Error(`Invalid task object: ${JSON.stringify(task)}`);
                }
                const { imagePath, pageNum, total } = task;
                log.debug(`Processing OCR task:`, { imagePath, pageNum, total });
        
                try {
                    await fs.access(imagePath);
                    log.debug(`Image file exists for page ${pageNum}: ${imagePath}`);
                    const stats = await fs.stat(imagePath);
                    log.debug(`Image file size: ${stats.size} bytes`);
                } catch (err) {
                    throw new Error(`Input file is missing or inaccessible: ${imagePath} (page ${pageNum}): ${err.message}`);
                }
        
                worker = await workerPool.acquireWorker();
                if (!worker) {
                    throw new Error(`Failed to acquire worker for page ${pageNum}`);
                }
                log.debug(`Acquired worker for page ${pageNum}, starting OCR`);
        
                try {
                    const pageText = await ocrImage(imagePath, worker);
                    log.debug(`OCR completed for page ${pageNum}, text length: ${pageText?.length || 0}`);
                    chunks[pageNum - 1] = pageText;
                } catch (error) {
                    log.error(`OCR failed for page ${pageNum}:`, error);
                    throw error;
                } finally {
                    if (worker) {
                        workerPool.releaseWorker(worker);
                        worker = null;
                        log.debug(`Released worker for page ${pageNum}`);
                    }
                }
                
                // Cleanup
                try {
                    await fs.unlink(imagePath);
                    log.debug(`Cleaned up temporary file for page ${pageNum}`);
                } catch (err) {
                    log.warn(`Failed to cleanup temporary file ${imagePath}: ${err.message}`);
                }
                
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
                log.error('Error in OCR task:', error);
                if (worker) {
                    workerPool.releaseWorker(worker);
                    worker = null;
                }
                cb(error);
            }
        }, { 
            concurrent: concurrentOCRtasks,
            maxRetries: 2,
            retryDelay: 2000,
            afterProcessDelay: 100, 
            filo: false 
        });

        log.debug('starting pdf to image conversion for', pdfPath)

        // Process pages as they become available
        for await (const pageInfo of pdfToImagesGenerator(pdfPath, tempDir)) {
            log.debug(`Queueing OCR task ${pageInfo}`);
            queue.push(pageInfo);
        }

        // Wait for all tasks to complete
        await new Promise((resolve, reject) => {
            queue.on('drain', resolve);
            queue.on('error', reject);
        });
        
        // Combine text in correct order
        log.debug("OCR page count", chunks.length);
        return chunks.join('\n===========\n');
    } catch (error) {
        log.error('Error in background OCR task:', error);
        throw error;
    } finally {
        if (workerPool) {
            await workerPool.cleanup();
        }
        workers.clear();
        if (queue) {
            queue.destroy();
        }
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (err) {
            log.warn('Failed to cleanup temp directory:', err);
        }
    }
}

async function cleanup(files) {
    try {
        await Promise.all(files.map(f => fs.unlink(f).catch(() => {})));
    } catch (error) {
        log.error('Error cleaning up temporary files:', error);
    }
}

async function readScript(file) {
    try {
        return await fs.readFile(file, 'utf8');
    } catch (error) {
        log.error('Error reading script file:', error);
        throw error;
    }
}

async function writeScript(script, file) {
    try {
        await fs.writeFile(file, script, 'utf8');
    } catch (error) {
        log.error('Error writing script file:', error);
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