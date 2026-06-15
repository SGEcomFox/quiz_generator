const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Generate topics from PDF text
async function generateTopics(pdfText) {
  if (!pdfText) {
    throw new Error('pdfText is required');
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

  return JSON.parse(response.choices[0].message.content);
}

// Extract from small PDFs without chunking
async function extractFromText(pdfText, topics) {
  const topicNames = topics.map(t => t.name).join(', ');
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: `For each topic below, extract the most relevant paragraphs and sections from the material that explain that topic. Focus on the core content needed to understand and generate questions about each topic.

Topics to extract content for: ${topicNames}

Material:
${pdfText}

Return a JSON object with this structure:
{
  "topicContent": {
    "Topic Name": "relevant paragraphs and sections here...",
    "Another Topic": "relevant content..."
  }
}

Ensure each topic has sufficient content (at least 200 characters) to generate accurate questions.`,
      },
    ],
  });

  return JSON.parse(response.choices[0].message.content);
}

// Extract from large PDFs using chunking
async function extractChunked(pdfText, topics, chunkSize) {
  const chunks = [];
  for (let i = 0; i < pdfText.length; i += chunkSize) {
    chunks.push(pdfText.substring(i, i + chunkSize));
  }
  
  console.log(`Processing ${chunks.length} chunks for topic extraction...`);
  
  const topicContentMap = {};
  topics.forEach(t => topicContentMap[t.name] = []);
  
  const topicNames = topics.map(t => t.name).join(', ');
  
  // Extract from each chunk
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Extracting from chunk ${i + 1}/${chunks.length}...`);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `From this section of the material (section ${i + 1}/${chunks.length}), extract relevant content for these topics: ${topicNames}.

Material section:
${chunks[i]}

Return a JSON object with this structure:
{
  "topicContent": {
    "Topic Name": "relevant content from this section...",
    "Another Topic": "relevant content from this section..."
  }
}

If a topic is not mentioned in this section, return empty string.`,
        },
      ],
    });
    
    const chunkContent = JSON.parse(response.choices[0].message.content);
    Object.keys(chunkContent.topicContent).forEach(topic => {
      if (chunkContent.topicContent[topic]) {
        topicContentMap[topic].push(chunkContent.topicContent[topic]);
      }
    });
  }
  
  // Merge results and limit total size per topic
  const finalContent = {};
  Object.keys(topicContentMap).forEach(topic => {
    const merged = topicContentMap[topic].join('\n\n');
    finalContent[topic] = merged.substring(0, 8000); // Limit to 8000 chars per topic
  });
  
  return { topicContent: finalContent };
}

// Extract relevant content for each topic (adaptive: conditional chunking)
async function extractTopicContent(pdfText, topics) {
  if (!pdfText || !topics || topics.length === 0) {
    throw new Error('pdfText and topics are required');
  }

  const CHUNK_SIZE = 50000; // characters
  const TOKEN_ESTIMATE_RATIO = 4; // approximately 1 token per 4 characters
  const SMALL_PDF_THRESHOLD = 80000; // tokens
  
  const estimatedTokens = Math.ceil(pdfText.length / TOKEN_ESTIMATE_RATIO);
  console.log(`PDF size: ~${estimatedTokens} estimated tokens`);
  
  // Small PDF: Process whole without chunking
  if (estimatedTokens < SMALL_PDF_THRESHOLD) {
    console.log('PDF is small, processing without chunking...');
    return extractFromText(pdfText, topics);
  }
  
  // Large PDF: Use chunked extraction
  console.log(`PDF is large (>${SMALL_PDF_THRESHOLD} tokens), using chunked extraction...`);
  return extractChunked(pdfText, topics, CHUNK_SIZE);
}

// Generate a question based on topic and selected topics
async function generateQuestion(relevantContent, topic, questionType = 'auto', selectedTopics = []) {
  if (!relevantContent) {
    throw new Error('relevantContent is required');
  }
  if (!topic) {
    throw new Error('topic is required');
  }

  const topicsContext = selectedTopics.length > 0
    ? `Focus ONLY on these topics: ${selectedTopics.map(t => t.name).join(', ')}.\n`
    : '';

  // If questionType is 'auto', pick a concrete type server-side to ensure variety
  const availableTypes = ['multipleChoice', 'freeText', 'gapText', 'trueFalse'];
  let chosenType = questionType;
  if (questionType === 'auto') {
    // simple uniform random choice among available types
    chosenType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
  }

  const typeInstruction = `Generate a ${chosenType} question`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: `${topicsContext}${typeInstruction} based ONLY on the material provided below about "${topic.name}".

Material:
${relevantContent}

Return a JSON object with EXACTLY this structure:
{
  "question": "The question text",
  "type": "multipleChoice",
  "options": [
    {"id": "a", "text": "Option A"},
    {"id": "b", "text": "Option B"},
    {"id": "c", "text": "Option C"},
    {"id": "d", "text": "Option D"}
  ],
  "correctAnswer": "a",
  "explanation": "Why this answer is correct"
}

IMPORTANT: The "type" field MUST be exactly one of: "multipleChoice", "freeText", "gapText", or "trueFalse"
For freeText and gapText types, still include options or leave as empty array if not applicable.`,
      },
    ],
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  // Ensure the returned type matches the chosen type
  if (!parsed.type || parsed.type.toLowerCase() !== chosenType.toLowerCase()) {
    parsed.type = chosenType;
  }
  return parsed;
}

module.exports = {
  generateTopics,
  extractTopicContent,
  generateQuestion,
};
