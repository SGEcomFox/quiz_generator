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
    model: 'gpt-5-nano',
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
      model: 'gpt-5-nano',
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

async function generateQuestion(relevantContent, topic, questionType = 'auto', selectedTopics = []) {
  if (!relevantContent) throw new Error('relevantContent is required');
  if (!topic) throw new Error('topic is required');

  const availableTypes = ['multipleChoice', 'freeText', 'gapText', 'trueFalse'];
  const chosenType = questionType === 'auto'
    ? availableTypes[Math.floor(Math.random() * availableTypes.length)]
    : questionType;

  const topicsContext = selectedTopics.length > 0
    ? `Focus ONLY on these topics: ${selectedTopics.map(t => t.name).join(', ')}.`
    : '';

  // Define one function per question type so the schema is unambiguous
  const tools = {
    multipleChoice: {
      name: 'display_multiple_choice',
      description: 'Display a multiple choice question with 4 options to the user.',
      parameters: {
        type: 'object',
        properties: {
          question:      { type: 'string', description: 'The question text' },
          options:       {
            type: 'array',
            description: 'Exactly 4 answer options',
            items: {
              type: 'object',
              properties: {
                id:   { type: 'string', enum: ['a', 'b', 'c', 'd'] },
                text: { type: 'string' }
              },
              required: ['id', 'text'],
              additionalProperties: false
            }
          },
          correctAnswer: { type: 'string', enum: ['a', 'b', 'c', 'd'], description: 'ID of the correct option' },
          explanation:   { type: 'string', description: 'Why this answer is correct' }
        },
        required: ['question', 'options', 'correctAnswer', 'explanation'],
        additionalProperties: false
      }
    },

    freeText: {
      name: 'display_free_text',
      description: 'Display an open-ended question where the user types a free answer.',
      parameters: {
        type: 'object',
        properties: {
          question:      { type: 'string', description: 'The question text' },
          correctAnswer: { type: 'string', description: 'The expected answer' },
          explanation:   { type: 'string', description: 'Why this answer is correct' }
        },
        required: ['question', 'correctAnswer', 'explanation'],
        additionalProperties: false
      }
    },

    gapText: {
      name: 'display_gap_text',
      description: 'Display a fill-in-the-blank question. Blanks in the question are marked as {0}, {1}, {2} etc.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'A sentence with {0}, {1}, {2} etc. as placeholders. Example: "The capital of {0} is {1}."'
          },
          correctAnswer: {
            type: 'array',
            description: 'Array of words filling each gap in order. Example: ["France", "Paris"]',
            items: { type: 'string' }
          },
          explanation: { type: 'string', description: 'Why these answers are correct' }
        },
        required: ['question', 'correctAnswer', 'explanation'],
        additionalProperties: false
      }
    },

    trueFalse: {
      name: 'display_true_false',
      description: 'Display a true/false question.',
      parameters: {
        type: 'object',
        properties: {
          question:      { type: 'string', description: 'A statement that is either true or false' },
          correctAnswer: { type: 'string', enum: ['true', 'false'], description: 'Whether the statement is true or false' },
          explanation:   { type: 'string', description: 'Why the statement is true or false' }
        },
        required: ['question', 'correctAnswer', 'explanation'],
        additionalProperties: false
      }
    }
  };

  const selectedTool = tools[chosenType];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a quiz generator. You MUST call the provided function to display the question. Never respond with plain text.`
      },
      {
        role: 'user',
        content: `${topicsContext}
Generate a ${chosenType} question based ONLY on the material below about "${topic.name}".

Material:
${relevantContent}`
      }
    ],
    tools: [{ type: 'function', function: selectedTool }],
    tool_choice: { type: 'function', function: { name: selectedTool.name } }
  });

  const toolCall = response.choices[0].message.tool_calls?.[0];
  if (!toolCall) throw new Error('Model did not call the function');

  console.log('Function called:', toolCall.function.name);
  console.log('Function arguments:', toolCall.function.arguments);

  const args = JSON.parse(toolCall.function.arguments);

  // Normalize to a consistent shape for handleGenerateQuestion
  return {
    type: chosenType,
    question: args.question,
    options: args.options ?? [],
    correctAnswer: args.correctAnswer,
    explanation: args.explanation
  };
}

async function checkAnswer(question, correctAnswer, userAnswer, type) {
  const tools = [{
    type: 'function',
    function: {
      name: 'submit_answer_result',
      description: 'Submit the result of checking a user answer',
      parameters: {
        type: 'object',
        properties: {
          correct: { type: 'boolean', description: 'Whether the user answer is correct' },
          feedback: { type: 'string', description: 'Short, friendly feedback explaining why the answer is correct or incorrect' }
        },
        required: ['correct', 'feedback'],
        additionalProperties: false
      }
    }
  }];

  const prompt = type === 'gapText'
    ? `The user answered a fill-in-the-blank question.
Question: "${question}"
Expected answers (one per gap): ${JSON.stringify(correctAnswer)}
User answers (one per gap): ${JSON.stringify(userAnswer)}
Check if the user answers are semantically correct for each gap. Minor spelling mistakes or synonyms should be accepted.`
    : `The user answered an open-ended question.
Question: "${question}"
Expected answer: "${correctAnswer}"
User answer: "${userAnswer}"
Check if the user answer is semantically correct. It does not need to match word for word.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a quiz corrector. Evaluate the user answer and call the function with your verdict.' },
      { role: 'user', content: prompt }
    ],
    tools,
    tool_choice: { type: 'function', function: { name: 'submit_answer_result' } }
  });

  const toolCall = response.choices[0].message.tool_calls?.[0];
  if (!toolCall) throw new Error('No tool call returned');

  return JSON.parse(toolCall.function.arguments);
}

module.exports = {
  generateTopics,
  extractTopicContent,
  generateQuestion,
  checkAnswer, 
};