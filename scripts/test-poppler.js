const { Poppler } = require('node-poppler');
const path = require('path');
const fs = require('fs').promises;

async function testPdfConversion() {
    try {
        // Initialize Poppler
        const poppler = new Poppler();
        
        // Set paths
        //const pdfPath = path.join(__dirname, 'test.pdf'); // Put your test PDF here
        const pdfPath = "/Users/zola/Desktop/projects/campeon-gabacho/script/GringoChampion_052224_OWendt-2.pdf"
        const outputPath = path.join(__dirname, 'output');
        const outputPng = outputPath + '.png';
        
        console.log('Converting PDF:', pdfPath);
        console.log('Output to:', outputPath);

        // Get PDF info first
        const info = await poppler.pdfInfo(pdfPath);
        console.log('\nPDF Info:', info);

        // Convert PDF to PNG
        const options = {
            firstPageToConvert: 1,
            lastPageToConvert: 1,
            pngFile: true,
            singleFile: true,
            resolutionXYAxis: 300
        };

        console.log('\nConverting with options:', options);
        await poppler.pdfToCairo(pdfPath, outputPath, options);
        
        // Verify the output file exists
        await fs.access(outputPng);
        console.log('\nSuccess! PNG file created at:', outputPng);

    } catch (error) {
        console.error('Error:', error);
        console.error('Stack:', error.stack);
    }
}

testPdfConversion();