/**
 * Public, self-contained sample exam shown on the marketing site.
 * It never touches the database or the network, and nothing is stored.
 */
export type DemoQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export const DEMO_EXAM = {
  title: 'ICT Fundamentals — Sample Exam',
  durationSeconds: 10 * 60,
  passPercentage: 50,
  marksPerQuestion: 1,
} as const;

export const DEMO_QUESTIONS: DemoQuestion[] = [
  { id: 'q1', prompt: 'Which of these is the computer’s main volatile (temporary) memory?',
    options: ['Hard disk', 'RAM', 'ROM', 'DVD'], correctIndex: 1,
    explanation: 'RAM loses its contents when power is switched off, which is what “volatile” means.' },
  { id: 'q2', prompt: 'How many bits are there in one byte?',
    options: ['4', '8', '16', '32'], correctIndex: 1,
    explanation: 'One byte is made of 8 bits.' },
  { id: 'q3', prompt: 'Which of the following is an operating system?',
    options: ['Google Chrome', 'HTML', 'Linux', 'Microsoft Excel'], correctIndex: 2,
    explanation: 'Linux is an operating system. Chrome is a browser, HTML is a markup language and Excel is an application.' },
  { id: 'q4', prompt: 'Which protocol is used to carry web pages securely?',
    options: ['HTTP', 'FTP', 'HTTPS', 'SMTP'], correctIndex: 2,
    explanation: 'HTTPS is HTTP protected with TLS encryption.' },
  { id: 'q5', prompt: 'What is the binary number 1010 in decimal?',
    options: ['8', '10', '12', '14'], correctIndex: 1,
    explanation: '1×8 + 0×4 + 1×2 + 0×1 = 10.' },
  { id: 'q6', prompt: 'Which of these is an OUTPUT device?',
    options: ['Keyboard', 'Scanner', 'Microphone', 'Monitor'], correctIndex: 3,
    explanation: 'A monitor displays information from the computer. The others send data in.' },
  { id: 'q7', prompt: 'What is “phishing”?',
    options: [
      'A fast way of searching the web',
      'Tricking people into revealing sensitive information by pretending to be trustworthy',
      'Compressing large files',
      'Backing up data to the cloud',
    ], correctIndex: 1,
    explanation: 'Phishing messages imitate banks, companies or colleagues to steal passwords and personal data.' },
  { id: 'q8', prompt: 'What does CPU stand for?',
    options: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Control Panel Unit'], correctIndex: 0,
    explanation: 'The CPU is the processor that executes instructions.' },
  { id: 'q9', prompt: 'Which of the following is database software?',
    options: ['VLC Player', 'MySQL', 'Adobe Photoshop', 'Zoom'], correctIndex: 1,
    explanation: 'MySQL is a relational database management system.' },
  { id: 'q10', prompt: 'Cloud computing mainly provides…',
    options: [
      'Computing resources on demand over the internet',
      'Only offline software',
      'Faster physical keyboards',
      'Printed documents',
    ], correctIndex: 0,
    explanation: 'Cloud services deliver storage, servers and software on demand through the internet.' },
];

export type DemoResult = {
  correct: number;
  attempted: number;
  total: number;
  marks: number;
  maxMarks: number;
  percentage: number;
  passed: boolean;
};

/** answers[i] is the chosen option index for question i, or null when unanswered. */
export function scoreDemoExam(
  answers: ReadonlyArray<number | null>,
  questions: ReadonlyArray<DemoQuestion> = DEMO_QUESTIONS,
): DemoResult {
  let correct = 0;
  let attempted = 0;
  questions.forEach((q, i) => {
    const a = answers[i];
    if (a === null || a === undefined) return;
    attempted += 1;
    if (a === q.correctIndex) correct += 1;
  });
  const maxMarks = questions.length * DEMO_EXAM.marksPerQuestion;
  const marks = correct * DEMO_EXAM.marksPerQuestion;
  const percentage = maxMarks > 0 ? Number(((marks / maxMarks) * 100).toFixed(1)) : 0;
  return {
    correct, attempted, total: questions.length, marks, maxMarks, percentage,
    passed: percentage >= DEMO_EXAM.passPercentage,
  };
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
