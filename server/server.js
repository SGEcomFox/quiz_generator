const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const openaiService = require('./services/openaiService');

const PORT = process.env.PORT || 3000;

// Session storage for PDF data and topic content
const sessions = {};
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour

// Generate unique session ID
function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Clean up expired sessions
setInterval(() => {
  const now = Date.now();
  Object.keys(sessions).forEach(sessionId => {
    if (now - sessions[sessionId].createdAt > SESSION_TIMEOUT) {
      delete sessions[sessionId];
      console.log(`Cleaned up expired session: ${sessionId}`);
    }
  });
}, 5 * 60 * 1000); // Check every 5 minutes

// Serve static files
function serveStaticFile(filePath, res) {
  const fullPath = path.join(__dirname, '..', filePath);
  try {
    const content = fs.readFileSync(fullPath);
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'text/plain');
    res.writeHead(200);
    res.end(content);
    return true;
  } catch (err) {
    return false;
  }
}

// Parse request body
async function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Handle requests
const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  console.log(`[${req.method}] ${pathname}`);  // Debug logging

  // Serve static files for non-API requests
  if (!pathname.startsWith('/api/')) {
    let fileToServe = pathname === '/' ? '/index.html' : pathname;
    if (serveStaticFile(fileToServe, res)) {
      return;
    }
  }

  try {
    // Generate Topics
    if (pathname === '/api/generate-topics' && req.method === 'POST') {
      const body = await parseRequestBody(req);
      console.log('Generating topics from PDF...');
      const topicsData = await openaiService.generateTopics(body.pdfText);
      
      // Extract relevant content for each topic
      console.log('Extracting topic content...');
      const topicContentData = await openaiService.extractTopicContent(body.pdfText, topicsData.topics);
      
      // Create session and store PDF + topic content
      const sessionId = generateSessionId();
      sessions[sessionId] = {
        pdfText: body.pdfText,
        topics: topicsData.topics,
        topicContent: topicContentData.topicContent,
        createdAt: Date.now()
      };
      
      console.log(`Created session: ${sessionId}`);
      res.writeHead(200);
      res.end(JSON.stringify({
        ...topicsData,
        sessionId
      }));
      return;
    }

    // Generate Question
    if (pathname === '/api/generate-question' && req.method === 'POST') {
      const body = await parseRequestBody(req);
      
      if (!body.sessionId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'sessionId is required' }));
        return;
      }
      
      const session = sessions[body.sessionId];
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Session not found or expired' }));
        return;
      }
      
      if (!body.topic) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'topic is required' }));
        return;
      }
      
      // Get relevant content for this topic
      const relevantContent = session.topicContent[body.topic.name] || '';
      if (!relevantContent) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: `No content found for topic: ${body.topic.name}` }));
        return;
      }
      
      const questionType = body.questionType || 'multipleChoice';
      const selectedTopics = body.selectedTopics || [];
      
      console.log(`Generating ${questionType} question for topic: ${body.topic.name}`);
      const question = await openaiService.generateQuestion(
        relevantContent,
        body.topic,
        questionType,
        selectedTopics
      );
      
      res.writeHead(200);
      res.end(JSON.stringify(question));
      return;
    }

    if (pathname === '/api/check-answer' && req.method === 'POST') {
      const body = await parseRequestBody(req);
      const { question, correctAnswer, userAnswer, type } = body;

      const result = await openaiService.checkAnswer(question, correctAnswer, userAnswer, type); // 👈 clean one-liner

      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Endpoint not found' }));

  } catch (error) {
    console.error('Server error:', error);
    if (error.message.includes('is required')) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: error.message }));
    } else {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  }
});


server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
