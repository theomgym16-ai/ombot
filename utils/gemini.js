import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function getGymAssistantResponse(userMessage, contextText = "") {
  // Using Flash model as it's the fastest and cheapest for chat interactions
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const systemInstruction = `
You are the AI assistant for 'The Ohm Gym'.
Be friendly, concise, and helpful. 
If the user mentions working out or training a muscle group, acknowledge it cheerfully.
Here is some context about the user or gym:
${contextText}
`;

  const prompt = `${systemInstruction}\nUser says: ${userMessage}\nAssistant:`;
  const result = await model.generateContent(prompt);
  return result.response.text();
}
