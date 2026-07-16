import dotenv from "dotenv";
dotenv.config();

export async function getGymAssistantResponse(userMessage, contextText = "") {
  const systemInstruction = `
You are the AI assistant for 'The Ohm Gym'.
Be friendly, concise, and helpful.
If the user mentions working out or training a muscle group, acknowledge it cheerfully.

IMPORTANT: Only state specific facts (prices, timings, address, phone numbers,
plan names) if they appear in the context below. Never invent or guess a
specific number, price, address, or contact detail. If the user asks about
something specific that isn't in the context, say you don't have that on hand
and that gym staff will follow up — do not make something up.

Here is some context about the user or gym:
${contextText}
`;

  // NVIDIA Integrate may reject `role: "system"` for some models.
  // We embed the instruction into the user prompt to keep compatibility.
  const combinedUserPrompt = `${systemInstruction.trim()}

User: ${userMessage}`;

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
  const timeoutMs = Number(process.env.NVIDIA_TIMEOUT_MS || 12000);

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: combinedUserPrompt }],
        temperature: 0.6,
        max_tokens: 512,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e && e.name === "AbortError") {
      throw new Error(
        `NVIDIA LLM request timed out after ${timeoutMs}ms | url=${url} | model=${model}`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

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
