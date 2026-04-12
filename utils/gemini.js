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

  const rawBase = (
    process.env.NVIDIA_API_BASE || "https://integrate.api.nvidia.com"
  )
    .trim()
    .replace(/\/$/, "");
  const model = process.env.NVIDIA_MODEL || "google/gemma-4-31b-it";

  // Allow NVIDIA_API_BASE to be either:
  // - https://integrate.api.nvidia.com
  // - https://integrate.api.nvidia.com/v1
  // - https://integrate.api.nvidia.com/v1/chat/completions
  let url;
  if (
    rawBase.endsWith("/chat/completions") ||
    rawBase.endsWith("/completions")
  ) {
    url = rawBase;
  } else {
    const baseWithVersion = /\/v1($|\/)/.test(rawBase)
      ? rawBase
      : `${rawBase}/v1`;
    url = `${baseWithVersion.replace(/\/$/, "")}/chat/completions`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
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
    const modelHint =
      response.status === 404
        ? " (Often means NVIDIA_MODEL is wrong or not enabled for this API key; check https://integrate.api.nvidia.com/v1/models)"
        : "";
    throw new Error(
      `NVIDIA LLM request failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}${modelHint} | url=${url} | model=${model}`,
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return (content || "").trim();
}
