import dotenv from "dotenv";
dotenv.config();

export async function getGymAssistantResponse(userMessage, contextText = "") {
  const systemInstruction = `
You are the AI assistant for 'The Ohm Gym'.
Be friendly, concise, and helpful. 
If the user mentions working out or training a muscle group, acknowledge it cheerfully.
Here is some context about the user or gym:
${contextText}
`;

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing NVIDIA_API_KEY. Add it to your environment variables.",
    );
  }

  const apiBase = (
    process.env.NVIDIA_API_BASE || "https://integrate.api.nvidia.com/v1"
  ).replace(/\/$/, "");
  const model = process.env.NVIDIA_MODEL || "gemma-4-31b-it";
  const url = `${apiBase}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemInstruction.trim() },
        { role: "user", content: userMessage },
      ],
      temperature: 0.6,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `NVIDIA LLM request failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`,
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return (content || "").trim();
}
