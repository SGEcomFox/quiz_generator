const http = require('http');
const url = require('url');
const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const PORT = process.env.PORT || 3000;

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

  try {
    // Generate Topics
    if (pathname === '/api/generate-topics' && req.method === 'POST') {
      const body = await parseRequestBody(req);
      const { pdfText } = body;

      if (!pdfText) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'pdfText is required' }));
        return;
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: `Extract the main topics from this lecture material. Return a JSON object with this structure:
{
  "topics": [
    {
      "id": "topic_1",
      "name": "Topic Name",
      "description": "Brief description",
      "keyPoints": ["point1", "point2"]
    }
  ]
}

Lecture material:
${pdfText}`,
          },
        ],
      });

      const topicsData = JSON.parse(response.choices[0].message.content);
      res.writeHead(200);
      res.end(JSON.stringify(topicsData));
      return;
    }

    // Generate Question
    if (pathname === '/api/generate-question' && req.method === 'POST') {
      const body = await parseRequestBody(req);
      const { topic, content, questionType } = body;

      if (!topic || !content) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'topic and content are required' }));
        return;
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: `Generate a ${questionType || 'multiple choice'} question based on this topic and content.
Topic: ${topic}
Content: ${content}

Return JSON with this structure:
{
  "question": "The question text",
  "type": "${questionType || 'multipleChoice'}",
  "options": ["option1", "option2", "option3", "option4"],
  "correctAnswer": "correct option text",
  "explanation": "Brief explanation"
}`,
          },
        ],
      });

      const questionData = JSON.parse(response.choices[0].message.content);
      res.writeHead(200);
      res.end(JSON.stringify(questionData));
      return;
    }

    // Grade Exam
    if (pathname === '/api/grade-exam' && req.method === 'POST') {
      const body = await parseRequestBody(req);
      const { answers } = body;

      if (!answers) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'answers are required' }));
        return;
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: `Grade these exam answers and provide feedback.
Answers: ${JSON.stringify(answers)}

Return JSON with this structure:
{
  "score": 0-100,
  "stars": 0-3,
  "feedback": "Overall feedback",
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"]
}`,
          },
        ],
      });

      const gradeData = JSON.parse(response.choices[0].message.content);
      res.writeHead(200);
      res.end(JSON.stringify(gradeData));
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
