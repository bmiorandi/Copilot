import { GoogleGenAI, Type } from "@google/genai";

export interface ParsedResume {
  name: string;
  yearsOfExperience: string;
  skills: string[];
  experienceSummary: string[];
  educationSummary: string[];
}

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not defined");
    }
    aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiInstance;
}

export async function parseResumeContext(resumeText: string): Promise<ParsedResume> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-preview", // Use flash for fast structured extraction
    contents: `Extract the following information from the resume below. Extract the candidate's name, total years of experience, top key skills, a concise summary of their work experience, and education. If an attribute is completely missing, put "Unknown".\n\n--- RESUME ---\n${resumeText}`,
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Candidate name" },
          yearsOfExperience: { type: Type.STRING, description: "e.g., '5+ Yrs', 'Entry Level'" },
          skills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Top 5-15 key skills" },
          experienceSummary: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Bullet points of key work experience" },
          educationSummary: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Bullet points of education" }
        },
        required: ["name", "yearsOfExperience", "skills", "experienceSummary", "educationSummary"]
      }
    }
  });
  return JSON.parse(response.text || "{}") as ParsedResume;
}

export async function generateInterviewAnswerStream(
  transcript: string,
  history: { role: 'interviewer' | 'candidate', text: string }[],
  resumeRaw: string,
  parsedResume: ParsedResume | null,
  jobDescription: string,
  language: string,
  onChunk: (text: string) => void
) {
  const ai = getAI();
  
  // Decide prompt language instruction based on user's selection
  let languageInstruction = "";
  if (language === "zh-CN") {
    languageInstruction = "You must reply in Chinese (Simplified).";
  } else if (language === "ja-JP") {
    languageInstruction = "You must reply in Japanese.";
  } else {
    languageInstruction = "You must reply in English.";
  }

  const systemInstruction = `You are SYNCHRON AI, an elite, ultra-intelligent Interview Copilot. 
Unlike basic apps that just "give answers", you provide tactical psychological insights, strategic alignment with the JD, and highly structured talking points to dominate the interview.

The user is in a live job interview. You will receive the recent conversation history and the newest question.
Based on the transcript, the user's resume, and the targeted job description, you MUST output your response STRICTLY using the following Markdown layout.
This will act as a Heads-Up Display (HUD) for the candidate. Keep bullet points extremely concise (1-2 lines maximum) so the candidate can read them at a glance while speaking!

### 🕵️ HIDDEN INTENT
(1 brief sentence explaining the psychological angle or what the interviewer is *really* testing)

### 🎯 TACTICAL STRATEGY
(1 brief sentence explicitly bridging a specific skill/experience from the Candidate's Resume to a core requirement in the Target Job Description)

### 💬 TALK TRACK
* **Hook:** (Short, confident opening sentence)
* **Evidence:** (Specific metric, STAR method point, or tool from their resume)
* **Impact:** (The business value or outcome delivered)
* **Tie-back:** (Why this makes them perfect for this specific role)

### 🔮 EXPECTED FOLLOW-UP
(Predict the most likely next question based on this answer)

${languageInstruction}
Note: Output the headings in the requested language as well.

--- TARGET JOB DESCRIPTION ---
${jobDescription || "(No specific job description provided.)"}

--- CANDIDATE PROFILE (PARSED) ---
${parsedResume ? JSON.stringify(parsedResume, null, 2) : "Not parsed/available"}

--- FULL RESUME ---
${resumeRaw || "(No raw resume provided. Answer based on general best practices.)"}
`;

  try {
    const historyText = history.map(h => `${h.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${h.text}`).join('\n\n');
    
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3.1-pro-preview",
      contents: `[Recent Conversation History]\n${historyText || "(Start of interview)"}\n\n[Current Question/Transcription]\nInterviewer: ${transcript}\n\nProvide the tactical HUD response now.`,
      config: {
        systemInstruction,
        temperature: 0.6,
      },
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        onChunk(chunk.text);
      }
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}