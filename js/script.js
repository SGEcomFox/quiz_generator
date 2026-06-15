let navItems = [];
let selectedTopics = []; // Track selected topics globally
let allTopics = []; // Store all topics
let quizContainer = null; // Will be set when quiz page is loaded

// Track dynamically loaded scripts to avoid duplicates
const _loadedScripts = new Set();

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (_loadedScripts.has(src)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      _loadedScripts.add(src);
      resolve();
    };
    script.onerror = (e) => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

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

  buildNavBar();
});

// Build navbar from config
function buildNavBar() {
  const navBarList = document.getElementById('navBarList');
  const mainContent = document.getElementById('mainContent');
  
  navItems.forEach((navItem) => {
    const listItem = document.createElement('li');
    listItem.textContent = navItem.label;
    
    listItem.addEventListener('click', () => {
      loadContent(navItem.file, mainContent);
    });
    
    navBarList.appendChild(listItem);
  });
}

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
      
      // Setup topics page if topics.html was loaded
      if (filePath.includes('topics.html')) {
        setupTopicsPage();
      }
      
      // Setup quiz page if quiz.html was loaded
      if (filePath.includes('quiz.html')) {
        setupQuizPage();
      }
    })
    .catch(error => {
      console.error('Error loading content:', error);
      container.innerHTML = '<p>Error loading content. Please try again.</p>';
    });
}

// Setup topics page with dynamic topic loading and selection
function setupTopicsPage() {
  const topicBoard = document.getElementById('topicBoard');
  if (!topicBoard) return;
  
  // Clear existing static cards
  topicBoard.innerHTML = '';
  
  // If no topics are loaded, show a message
  if (!allTopics || allTopics.length === 0) {
    topicBoard.innerHTML = '<p>No topics loaded. Please upload a PDF first.</p>';
    return;
  }
  
  // Create topic cards for each topic
  allTopics.forEach((topic) => {
    const topicCard = document.createElement('div');
    topicCard.className = 'topicCard selected'; // Selected by default
    topicCard.textContent = topic.name || topic.id;
    topicCard.dataset.topicId = topic.id;
    
    // Add click handler for selection toggle
    topicCard.addEventListener('click', () => {
      toggleTopicSelection(topicCard, topic);
    });
    
    topicBoard.appendChild(topicCard);
  });
  
  // Initialize all topics as selected
  selectedTopics = [...allTopics];
}

// Toggle topic selection state
function toggleTopicSelection(cardElement, topic) {
  const isSelected = cardElement.classList.contains('selected');
  
  if (isSelected) {
    // Deselect
    cardElement.classList.remove('selected');
    cardElement.classList.add('deselected');
    selectedTopics = selectedTopics.filter(t => t.id !== topic.id);
  } else {
    // Select
    cardElement.classList.remove('deselected');
    cardElement.classList.add('selected');
    selectedTopics.push(topic);
  }
  
  console.log('Selected topics:', selectedTopics);
}

// Load topics from generated data and display them
function loadTopics(topics) {
  allTopics = topics;
  selectedTopics = [...topics]; // All selected by default
  console.log('Topics loaded:', allTopics);
}

// Setup PDF upload functionality (called when start.html is loaded)
function setupPDFUploader() {
  const uploadPDFBtn = document.getElementById('uploadPDF');
  const pdfFileInput = document.getElementById('pdfFileInput');
  
  if (uploadPDFBtn && pdfFileInput) {
    uploadPDFBtn.addEventListener('click', async () => {
      pdfFileInput.click();
    });
    
    pdfFileInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (file) {
        try {
          const extractedText = await pdfParser.extractText(file);
          
          // Call API to generate topics
          const topicsData = await quizAPI.generateTopics(extractedText);
          
          // Store topics data for later use
          window.currentPDF = {
            filename: file.name,
            extractedText: extractedText,
            topics: topicsData.topics,
            sessionId: topicsData.sessionId
          };
          
          // Load topics and navigate to topics page
          loadTopics(topicsData.topics);
          loadContent('html/pages/topics.html', document.getElementById('mainContent'));
        } catch (error) {
          console.error('Error:', error);
          alert('Error: ' + error.message);
        }
      }
    });
  }
}
// Setup quiz page and event listeners (called when quiz.html is loaded)
async function setupQuizPage() {
  quizContainer = document.getElementById('quizContainer');
  
  if (!quizContainer) {
    console.error('quizContainer not found');
    return;
  }
  
  // Ensure the quiz display/handler script is loaded (was included in quiz.html but
  // loading via innerHTML doesn't execute external scripts). Load it once here.
  try {
    await loadScriptOnce('js/quiz.js');
  } catch (e) {
    console.error(e);
    // continue; handlers may be missing but we avoid breaking the UI
  }
  
  // Set up event listener on quiz container
  quizContainer.addEventListener('click', (event) => {
    const button = event.target;
    
    // Handle Multiple Choice buttons
    if (button.classList.contains('MCAnswerButton')) {
      handleMultipleChoiceAnswer(button);
    }
    
    // Handle True/False buttons
    if (button.classList.contains('TFAnswerButton')) {
      handleTrueFalseAnswer(button);
    }
    
    // Handle Free Text submit
    if (button.id === 'freeTextSubmit') {
      handleFreeTextSubmit();
    }
    
    // Handle Gap Text submit
    if (button.id === 'gapTextSubmit') {
      handleGapTextSubmit();
    }
  });
  
  // Set up listener for next question button on parent
  const nextBtn = document.getElementById('nextQuestionBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', handleGenerateQuestion);
  }
}

// Single listener on the parent container

async function handleGenerateQuestion() {
  try {
    // Check if a PDF session exists
    if (!window.currentPDF || !window.currentPDF.sessionId) {
      alert('Please upload a PDF first');
      return;
    }
    
    // Check if topics are selected
    if (!selectedTopics || selectedTopics.length === 0) {
      alert('Please select at least one topic');
      return;
    }
    
    // Pick a random topic from selected topics
    const randomTopic = selectedTopics[Math.floor(Math.random() * selectedTopics.length)];
    
    console.log('Generating question for topic:', randomTopic.name);
    // Choose a concrete question type client-side to ensure diversity
    const availableTypes = ['multipleChoice', 'freeText', 'gapText', 'truefalse'];
    const chosenType = availableTypes[Math.floor(Math.random() * availableTypes.length)];

    const questionData = await quizAPI.generateQuestion(
      window.currentPDF.sessionId,
      randomTopic,
      chosenType,
      selectedTopics
    );
    
    // Convert API response format to display function format
    const { question, type, options = [], correctAnswer, explanation } = questionData;

    // Defensive handling: normalize and derive a concrete type if needed
    let normalizedType = (type && typeof type === 'string') ? type.toLowerCase() : '';
    const hasOptions = Array.isArray(options) && options.length > 0;

    if (normalizedType === 'auto' || !['multiplechoice', 'freetext', 'gaptext', 'truefalse'].includes(normalizedType)) {
      // Derive best-fit type: prefer multiple choice if options provided,
      // gapText if question contains placeholder tokens like {0}, otherwise freeText
      if (hasOptions) normalizedType = 'multiplechoice';
      else if (question && /\{\d+\}/.test(question)) normalizedType = 'gaptext';
      else normalizedType = 'freetext';
    }

    // Convert options array to answers array (extract text values)
    const answers = hasOptions ? options.map(opt => opt.text) : [];

    // Convert correctAnswer ID to index (e.g., "a" -> 0, "b" -> 1)
    const correctAnswerIndex = hasOptions ? options.findIndex(opt => opt.id === correctAnswer) : (typeof correctAnswer === 'number' ? correctAnswer : 0);

    // Call appropriate display function based on normalized question type
    switch (normalizedType) {
      case 'multiplechoice':
        displayMultipleChoice(question, answers, correctAnswerIndex, explanation, randomTopic.name);
        break;
      case 'freetext':
        displayFreeText(question, correctAnswerIndex, explanation, randomTopic.name);
        break;
      case 'gaptext':
        displayGapText(question, answers, explanation, randomTopic.name);
        break;
      case 'truefalse':
        displayTrueFalse(question, correctAnswerIndex, explanation, randomTopic.name);
        break;
      default:
        console.error('Unknown question type after normalization:', normalizedType);
        alert('Unknown question type received');
    }
  } catch (error) {
    console.error('Error generating question:', error);
    alert('Error generating question: ' + error.message);
  }
}
