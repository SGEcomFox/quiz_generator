/**
 * PDF Parser Module
 * Extracts raw text content from PDF files
 * Note: Requires pdf.js library to be included in HTML
 */

const pdfParser = (() => {
  /**
   * Extract text content from a PDF file
   * @param {File} pdfFile - The PDF file object from input
   * @returns {Promise<string>} - Raw text extracted from PDF
   */
  async function extractText(pdfFile) {
    try {
      // Create FileReader to read the PDF file
      const fileReader = new FileReader();

      return new Promise((resolve, reject) => {
        fileReader.onload = async (event) => {
          try {
            const pdfData = new Uint8Array(event.target.result);
            
            // Load PDF document
            const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
            let fullText = '';

            // Extract text from each page
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              const page = await pdf.getPage(pageNum);
              const textContent = await page.getTextContent();
              
              // Combine text items from the page
              const pageText = textContent.items
                .map(item => item.str)
                .join(' ');
              
              fullText += pageText + '\n';
            }

            resolve(fullText.trim());
          } catch (error) {
            reject(new Error(`Error processing PDF: ${error.message}`));
          }
        };

        fileReader.onerror = () => {
          reject(new Error('Error reading PDF file'));
        };

        // Read the file as an array buffer
        fileReader.readAsArrayBuffer(pdfFile);
      });
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  return {
    extractText,
  };
})();
