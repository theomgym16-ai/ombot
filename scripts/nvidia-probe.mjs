import "dotenv/config";

async function main() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("Missing NVIDIA_API_KEY");
    process.exit(1);
  }

  const model = process.env.NVIDIA_MODEL
    ? process.env.NVIDIA_MODEL
    : "gemma-4-31b-it";

  const candidates = [
    "https://integrate.api.nvidia.com/v1/chat/completions",
    "https://integrate.api.nvidia.com/v1/openai/chat/completions",
    "https://integrate.api.nvidia.com/v1beta1/chat/completions",
    "https://integrate.api.nvidia.com/chat/completions",
  ];

  const body = {
    model,
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 16,
    temperature: 0,
  };

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      const ct = res.headers.get("content-type")
        ? res.headers.get("content-type")
        : "";
      console.log(`${url} -> ${res.status} ${res.statusText} | ${ct}`);

      if (res.status !== 404) {
        const text = await res.text();
        console.log("  body snippet:", text.slice(0, 200).replace(/\s+/g, " "));
      }
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      console.log(`${url} -> NETWORK_ERROR ${message}`);
    }
  }
}

main();
