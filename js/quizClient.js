// API utility for communicating with the backend
class QuizAPI {
  constructor(baseURL = 'http://localhost:3000', model = 'gpt-5-nano') {
    this.baseURL = baseURL;
    this.model = model;
  }

  async request(endpoint, data) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  }

  // Generate topics from PDF text
  async generateTopics(pdfText) {
    return this.request('/api/generate-topics', { pdfText });
  }

  // Generate a single question
  async generateQuestion(sessionId, topic, questionType = 'multipleChoice', selectedTopics = []) {
    return this.request('/api/generate-question', {
      sessionId,
      topic,
      questionType,
      selectedTopics,
    });
  }

  // Grade exam answers
  async gradeExam(answers) {
    return this.request('/api/grade-exam', { answers });
  }
}

// Create global instance
const quizAPI = new QuizAPI();
