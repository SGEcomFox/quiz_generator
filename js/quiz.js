// Use the quiz container from the main script when available.
function _qc() {
    return window.quizContainer || document.getElementById('quizContainer');
}

//Display Quiz-Type

function displayMultipleChoice(question, answers, correctAnswer, explanation, topic) {
    fetch('../html/QuizModes/multipleChoice.html')
        .then(response => response.text())
        .then(html => {
            const qc = _qc();
            if (!qc) return console.error('quiz container not available');
            qc.innerHTML = html;

            document.getElementById("MCQuestion").textContent = question;

            answers.forEach((answer, index) => {
                document.getElementById(`MCAnswer${index + 1}`).textContent = answer;
            });
            console.log('storing correctAnswer index:', correctAnswer);

            qc.dataset.correctAnswer = correctAnswer;
            qc.dataset.explanation = explanation;
            qc.dataset.topic = topic;
        })
        .catch(error => console.error('Error loading multipleChoice.html:', error));
}

function displayFreeText(question, correctAnswer, explanation, topic) {
    // Load and insert Free Text HTML from file
    fetch('../html/QuizModes/freeText.html')
        .then(response => response.text())
        .then(html => {
                    const qc = _qc();
                    if (!qc) return console.error('quiz container not available');
                    qc.innerHTML = html;

                    document.getElementById("freeTextQuestion").textContent = question;
            
                    // Store quiz data for later use
                    qc.dataset.question = question;
                    qc.dataset.correctAnswer = correctAnswer;
                    qc.dataset.explanation = explanation;
                    qc.dataset.topic = topic;
        })
        .catch(error => console.error('Error loading freeText.html:', error));
}

function displayGapText(question, answers, explanation, topic) {
    console.log('displayGapText received:', { question, answers, explanation, topic }); // 👈
    fetch('../html/QuizModes/gapText.html')
        .then(response => response.text())
        .then(html => {
            const qc = _qc();
            if (!qc) return console.error('quiz container not available');
            qc.innerHTML = html;

            let renderedQuestion = question;

            answers.forEach((_, index) => {
                renderedQuestion = renderedQuestion.replace(
                    `{${index}}`,
                    `<input type="text" class="gap-input" data-index="${index}">`
                );
            });

            document.getElementById("gapTextQuestion").innerHTML = renderedQuestion;

            qc.dataset.question = question;
            qc.dataset.correctAnswers = JSON.stringify(answers);
            qc.dataset.explanation = explanation;
            qc.dataset.topic = topic;
        })
        .catch(error => console.error('Error loading gapText.html:', error));
}

function displayTrueFalse(question, correctAnswer, explanation, topic) {
    // Load and insert True/False HTML from file
    fetch('../html/QuizModes/trueFalse.html')
        .then(response => response.text())
        .then(html => {
            const qc = _qc();
            if (!qc) return console.error('quiz container not available');
            qc.innerHTML = html;

            document.getElementById("TFQuestion").textContent = question;
            
            // Store quiz data for later use
            qc.dataset.correctAnswer = correctAnswer;
            qc.dataset.explanation = explanation;
            qc.dataset.topic = topic;
        })
        .catch(error => console.error('Error loading trueFalse.html:', error));
}

//Handle Quiz-Answers
function handleMultipleChoiceAnswer(button) {
    const qc = _qc();
    if (!qc) return;
    if (qc.dataset.answered === 'true') return; 
    lockQuestion(qc);

    const correctAnswer = Number(qc.dataset.correctAnswer);
    const explanation = qc.dataset.explanation;
    const topic = allTopics.find(t => t.name === qc.dataset.topic);

    const buttons = Array.from(qc.querySelectorAll('.MCAnswerButton'));
    const clickedIndex = buttons.indexOf(button); // 👈 define first

    console.log('correctAnswer from dataset:', correctAnswer);
    console.log('clickedIndex:', clickedIndex);       // 👈 log after
    console.log('buttons found:', buttons.length);

    const correct = clickedIndex === correctAnswer;

    // Highlight correct and wrong
    buttons.forEach((btn, index) => {
        if (index === correctAnswer) {
            btn.classList.add('correct');
        } else if (btn === button && !correct) {
            btn.classList.add('incorrect');
        }
        btn.disabled = true; // prevent clicking again
    });

    // Show explanation
    showExplanation(qc, correct, explanation);

    if (correct && topic) {
        addXP(topic, 10); // 👈
    }
}

function handleTrueFalseAnswer(button) {
    const qc = _qc();
    if (!qc) return;
    if (qc.dataset.answered === 'true') return; 
    lockQuestion(qc);   

    const correctAnswer = qc.dataset.correctAnswer; // "true" or "false"
    const explanation = qc.dataset.explanation;
    const topic = allTopics.find(t => t.name === qc.dataset.topic); // 👈

    const clicked = button.textContent.toLowerCase(); // "true" or "false"
    const correct = clicked === correctAnswer;

    // Highlight buttons
    const buttons = Array.from(qc.querySelectorAll('.tf-answer')); // adjust selector to match your HTML
    buttons.forEach(btn => {
        if (btn.textContent.toLowerCase() === correctAnswer) {
            btn.classList.add('correct');
        } else if (btn === button && !correct) {
            btn.classList.add('incorrect');
        }
        btn.disabled = true;
    });


    if (correct && topic) {
        addXP(topic, 10); 
    }

    showExplanation(qc, correct, explanation);
}


async function handleFreeTextSubmit() {
    const qc = _qc();
    if (!qc) return;
    if (qc.dataset.answered === 'true') return;

    const answerInput = document.getElementById('freeTextAnswer');
    if (!answerInput) return;
    const userAnswer = answerInput.value.trim();

    const correctAnswer = qc.dataset.correctAnswer;
    const question = qc.dataset.question; // 👈 make sure you store this in displayFreeText
    const topic = allTopics.find(t => t.name === qc.dataset.topic);

    // Show loading state
    showExplanation(qc, null, 'Checking your answer...');

    const result = await quizAPI.checkAnswer(question, correctAnswer, userAnswer, 'freeText');

    lockQuestion(qc);
    showExplanation(qc, result.correct, result.feedback);

    if (result.correct && topic) addXP(topic, 10);
}

async function handleGapTextSubmit() {
    const qc = _qc();
    if (!qc) return;
    if (qc.dataset.answered === 'true') return;

    const inputs = qc.querySelectorAll('.gap-input');
    const userAnswers = Array.from(inputs)
        .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
        .map(i => i.value.trim());

    const correctAnswers = JSON.parse(qc.dataset.correctAnswers || '[]');
    const explanation = qc.dataset.explanation;
    const question = qc.dataset.question; // 👈 make sure you store this in displayGapText
    const topic = allTopics.find(t => t.name === qc.dataset.topic);

    // Show loading state
    showExplanation(qc, null, 'Checking your answer...');

    const result = await quizAPI.checkAnswer(question, correctAnswers, userAnswers, 'gapText');
    
    lockQuestion(qc);
    showExplanation(qc, result.correct, result.feedback);

    if (result.correct && topic) addXP(topic, 10);
}

// Shared helper to show explanation below the question
function showExplanation(qc, correct, explanation) {
    let resultEl = qc.querySelector('.explanation');
    if (!resultEl) {
        resultEl = document.createElement('div');
        resultEl.className = 'explanation';
        qc.appendChild(resultEl);
    }

    // Loading state
    if (correct === null) {
        resultEl.className = 'explanation loading';
        resultEl.textContent = explanation;
        return;
    }

    resultEl.className = `explanation ${correct ? 'correct' : 'incorrect'}`;
    resultEl.textContent = (correct ? '✓ ' : '✗ ') + explanation;
}

function lockQuestion(qc) {
    qc.dataset.answered = 'true';
    
    // Disable all interactive elements
    qc.querySelectorAll('button, input').forEach(el => el.disabled = true);
}
