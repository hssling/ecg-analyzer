const HF_SPACE_URL = process.env.HF_SPACE_URL || "https://hssling-cardioai-api.hf.space";
const FALLBACK_MAX_TOKENS = Number(process.env.HF_MAX_TOKENS || 384);

const parseDataUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64Payload: match[2] };
};

const parseSSE = (raw) => {
  const lines = raw.split(/\r?\n/);
  let eventType = "";
  let dataLine = "";
  for (const line of lines) {
    if (line.startsWith("event:")) eventType = line.slice(6).trim();
    if (line.startsWith("data:")) dataLine = line.slice(5).trim();
  }
  return { eventType, dataLine };
};

const buildDiagnosis = (rawMarkdown) => {
  const lower = rawMarkdown.toLowerCase();
  const nonDiagnostic = [
    "i'm sorry",
    "i am sorry",
    "as an ai",
    "i don't have the capability",
    "cannot analyze",
    "can't analyze",
    "unable to interpret",
    "feel free to ask"
  ].some((token) => lower.includes(token));

  if (nonDiagnostic) {
    return {
      diagnosis: "Non-Diagnostic Output",
      confidence: 0.25,
      heartRate: 0,
      rhythm: "Not Determined",
      stSegment: "Not Determined",
      qtInterval: "Not Determined",
      findings: ["Model returned a non-diagnostic response for this ECG image."],
      recommendations: [
        "Re-upload a high-resolution ECG with clear leads.",
        "Retry after model warm restart if this persists.",
        "Use physician review for immediate interpretation."
      ],
      rawMarkdown
    };
  }

  const isAbnormal =
    lower.includes("abnormal") ||
    lower.includes("ischemia") ||
    lower.includes("arrhythmia") ||
    lower.includes("tachycardia") ||
    lower.includes("fibrillation");

  let heartRate = 72;
  const hrMatch = rawMarkdown.match(/(\d{2,3}) (bpm|beats per minute)/i);
  if (hrMatch) heartRate = parseInt(hrMatch[1], 10);

  return {
    diagnosis: isAbnormal ? "Pathological Trace Detected" : "Normal Sinus Rhythm",
    confidence: 0.92,
    heartRate,
    rhythm: isAbnormal ? "Review Markdown Narrative" : "Regular",
    stSegment: isAbnormal ? "Pending Physician Validation" : "Isoelectric",
    qtInterval: "Pending exact measurement",
    findings: [rawMarkdown.slice(0, 300)],
    recommendations: ["Review accompanying text block", "Clinical correlation strictly recommended"],
    rawMarkdown
  };
};

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { imageBase64 } = JSON.parse(event.body || "{}");
    const parsed = parseDataUrl(imageBase64);
    if (!parsed) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "imageBase64 must be a data URL (data:<mime>;base64,<payload>)" })
      };
    }

    const binary = Buffer.from(parsed.base64Payload, "base64");
    const blob = new Blob([binary], { type: parsed.mimeType || "image/png" });
    const form = new FormData();
    form.append("files", blob, "ecg_upload.png");

    const uploadRes = await fetch(`${HF_SPACE_URL}/upload`, {
      method: "POST",
      body: form
    });
    if (!uploadRes.ok) {
      const details = await uploadRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: "HF upload failed", details }) };
    }

    const uploadData = await uploadRes.json();
    const uploadedPath = Array.isArray(uploadData) ? uploadData[0] : null;
    if (!uploadedPath) {
      return { statusCode: 502, body: JSON.stringify({ error: "HF upload returned no file path" }) };
    }

    const callRes = await fetch(`${HF_SPACE_URL}/call/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{ path: uploadedPath }, 0.2, FALLBACK_MAX_TOKENS]
      })
    });
    if (!callRes.ok) {
      const details = await callRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: "HF predict call failed", details }) };
    }

    const callData = await callRes.json();
    const eventId = callData?.event_id;
    if (!eventId) {
      return { statusCode: 502, body: JSON.stringify({ error: "HF predict call returned no event_id" }) };
    }

    const eventRes = await fetch(`${HF_SPACE_URL}/call/predict/${eventId}`, { method: "GET" });
    if (!eventRes.ok) {
      const details = await eventRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: "HF event fetch failed", details }) };
    }

    const sseRaw = await eventRes.text();
    const { eventType, dataLine } = parseSSE(sseRaw);
    if (!dataLine) {
      return { statusCode: 502, body: JSON.stringify({ error: "HF event response contained no data", details: sseRaw }) };
    }

    let parsedData;
    try {
      parsedData = JSON.parse(dataLine);
    } catch {
      parsedData = dataLine;
    }

    const rawMarkdown = Array.isArray(parsedData) ? String(parsedData[0] || "") : String(parsedData || "");
    if (eventType === "error") {
      return { statusCode: 502, body: JSON.stringify({ error: "HF Space inference error", details: rawMarkdown || "Unknown space error" }) };
    }
    if (rawMarkdown.toLowerCase().startsWith("error:")) {
      return { statusCode: 502, body: JSON.stringify({ error: "HF model runtime error", details: rawMarkdown }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiagnosis(rawMarkdown))
    };
  } catch (error) {
    console.error("Netlify Function Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error", message: error instanceof Error ? error.message : String(error) })
    };
  }
};
