let navItems = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Load configuration
  try {
    const response = await fetch('config.json');
    if (!response.ok) {
      throw new Error('Failed to load config');
    }
    const config = await response.json();
    navItems = config.navigationItems;
  } catch (error) {
    console.error('Error loading config:', error);
    return;
  }

  const navBarList = document.getElementById('navBarList');
  const mainContent = document.getElementById('mainContent');
  
  // Build navbar items from config
  navItems.forEach((navItem) => {
    const listItem = document.createElement('li');
    listItem.textContent = navItem.label;
    
    listItem.addEventListener('click', () => {
      loadContent(navItem.file, mainContent);
    });
    
    navBarList.appendChild(listItem);
  });
});


// Load content via Button press
function loadContent(filePath, container) {
  fetch(filePath)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    })
    .then(html => {
      container.innerHTML = html;
      
      // Setup PDF uploader if start.html was loaded
      if (filePath.includes('start.html')) {
        setupPDFUploader();
      }
    })
    .catch(error => {
      console.error('Error loading content:', error);
      container.innerHTML = '<p>Error loading content. Please try again.</p>';
    });
}

// Setup PDF upload functionality (called when start.html is loaded)
function setupPDFUploader() {
  const uploadPDFBtn = document.getElementById('uploadPDF');
  const pdfFileInput = document.getElementById('pdfFileInput');
  
  if (uploadPDFBtn && pdfFileInput) {
    uploadPDFBtn.addEventListener('click', () => {
      pdfFileInput.click();
      console.log("button clicked");
    });
    
    pdfFileInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (file) {
        try {
          const extractedText = await pdfParser.extractText(file);
          console.log('PDF extracted successfully');
          
          // Call API to generate topics
          const topicsData = await quizAPI.generateTopics(extractedText);
          console.log('Topics generated:', topicsData);
          
          // Store topics data for later use
          window.currentPDF = {
            filename: file.name,
            extractedText: extractedText,
            topics: topicsData.topics
          };
          
          // TODO: Load topics.html and display the generated topics
        } catch (error) {
          console.error('Error:', error);
          alert('Error: ' + error.message);
        }
      }
    });
  }
}
