import { SHARED_CONFIG } from './config.shared.js';

export const EDITOR_CONFIG = {
  ...SHARED_CONFIG,
  defaultContent: "<p>&nbsp;</p><p class='scene-heading'>Breakdown editor by Olaf Wendt 2024</p><p>&nbsp;</p><p class='action'>reads and ocrs pdf files containing scripts</p>",
  ocr: {
    maxConcurrent: process.env.OCR_MAX_CONCURRENT 
        ? parseInt(process.env.OCR_MAX_CONCURRENT) 
        : undefined,
    defaultLanguage: 'eng',
    pageWidthInInches: 8, 
    dpi: 200
  }
};