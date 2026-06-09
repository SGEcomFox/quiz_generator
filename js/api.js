// API utility for communicating with the backend
class QuizAPI {
  constructor(baseURL = 'http://localhost:3000') {
    this.baseURL = baseURL;
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
  async generateQuestion(topic, content, questionType = 'multipleChoice') {
    return this.request('/api/generate-question', {
      topic,
      content,
      questionType,
    });
  }

  // Grade exam answers
  async gradeExam(answers) {
    return this.request('/api/grade-exam', { answers });
  }
}

// Create global instance
const quizAPI = new QuizAPI();
