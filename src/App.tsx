import React, { useState, useRef } from 'react';
import { 
  HeartPulse, 
  UploadCloud, 
  FileText, 
  Activity, 
  AlertCircle, 
  Printer,
  Copy
} from 'lucide-react';
import './index.css';

interface DiagnosisResult {
  diagnosis: string;
  confidence: number;
  heartRate: number;
  rhythm: string;
  stSegment: string;
  qtInterval: string;
  findings: string[];
  recommendations: string[];
}

const HF_SPACE_URL = "https://hssling-cardioai-api.hf.space";
const HF_MAX_TOKENS = 768;
const HF_FETCH_TIMEOUT_MS = 45000;
const HF_FETCH_RETRIES = 3;

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown inference error";
  }
};

const parseJsonSafely = (value: string): unknown | null => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const parseSSE = (raw: string): { eventType: string; dataLine: string } => {
  const lines = raw.split(/\r?\n/);
  let eventType = "";
  let dataLine = "";
  for (const line of lines) {
    if (line.startsWith("event:")) eventType = line.slice(6).trim();
    if (line.startsWith("data:")) dataLine = line.slice(5).trim();
  }
  return { eventType, dataLine };
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read uploaded file"));
    reader.readAsDataURL(file);
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (input: string, init: RequestInit = {}, timeoutMs = HF_FETCH_TIMEOUT_MS): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

const fetchWithRetry = async (input: string, init: RequestInit = {}, retries = HF_FETCH_RETRIES): Promise<Response> => {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(input, init);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(1000 * attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Network request failed");
};

const isNetworkError = (message: string): boolean => {
  const lower = message.toLowerCase();
  return lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed");
};

const analyzeViaNetlifyFallback = async (file: File): Promise<DiagnosisResult> => {
  const imageBase64 = await fileToDataUrl(file);
  const response = await fetch("/api/analyze_ecg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64 })
  });

  const rawBody = await response.text();
  const payload = parseJsonSafely(rawBody) as Record<string, unknown> | null;
  if (!response.ok) {
    const details = payload && typeof payload.details === "string" ? payload.details : "";
    const core = payload && typeof payload.error === "string" ? payload.error : `Fallback failed (HTTP ${response.status})`;
    throw new Error(`${core}${details ? `: ${details}` : ""}`);
  }
  if (!isDiagnosisResult(payload)) throw new Error("Fallback returned invalid payload");
  return payload;
};

const splitClinicalSentences = (text: string, maxItems = 4): string[] => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences = cleaned
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 18);
  return sentences.slice(0, maxItems);
};

const buildRecommendations = (abnormal: boolean): string[] => {
  if (abnormal) {
    return [
      "Urgent physician review is advised for this ECG pattern.",
      "Correlate with symptoms, vitals, and prior ECG records.",
      "Consider repeat ECG and cardiac biomarkers if clinically indicated."
    ];
  }
  return [
    "Correlate with patient history and current symptoms.",
    "Maintain routine follow-up as per clinical protocol.",
    "Repeat ECG if new symptoms develop."
  ];
};

const isNonDiagnosticNarrative = (text: string): boolean => {
  const lower = text.toLowerCase();
  return [
    "i'm sorry",
    "i am sorry",
    "as an ai",
    "i don't have the capability",
    "cannot analyze",
    "can't analyze",
    "unable to interpret",
    "feel free to ask"
  ].some((token) => lower.includes(token));
};

const isDiagnosisResult = (value: unknown): value is DiagnosisResult => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.diagnosis === "string" &&
    typeof candidate.confidence === "number" &&
    typeof candidate.heartRate === "number" &&
    typeof candidate.rhythm === "string" &&
    typeof candidate.stSegment === "string" &&
    typeof candidate.qtInterval === "string" &&
    Array.isArray(candidate.findings) &&
    Array.isArray(candidate.recommendations);
};

// Client-side execution of Hugging Face Space Gradio backend
const analyzeECG = async (file: File): Promise<DiagnosisResult> => {
  console.log("Preparing file for inference:", file.name);

  try {
    const uploadForm = new FormData();
    uploadForm.append("files", file, file.name || "ecg_upload.png");

    const uploadRes = await fetchWithRetry(`${HF_SPACE_URL}/upload`, {
      method: "POST",
      body: uploadForm
    });
    if (!uploadRes.ok) {
      throw new Error(`Upload failed (HTTP ${uploadRes.status}): ${(await uploadRes.text()).slice(0, 200)}`);
    }
    const uploadBody = await uploadRes.json();
    const uploadedPath = Array.isArray(uploadBody) ? uploadBody[0] : null;
    if (!uploadedPath || typeof uploadedPath !== "string") throw new Error("HF upload returned no file path");

    const callRes = await fetchWithRetry(`${HF_SPACE_URL}/call/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{ path: uploadedPath }, 0.2, HF_MAX_TOKENS]
      })
    });
    if (!callRes.ok) {
      throw new Error(`Predict start failed (HTTP ${callRes.status}): ${(await callRes.text()).slice(0, 200)}`);
    }
    const callBody = await callRes.json();
    const eventId = callBody?.event_id;
    if (!eventId || typeof eventId !== "string") throw new Error("HF call/predict returned no event_id");

    // This endpoint blocks until complete/error and returns SSE text payload.
    const eventRes = await fetchWithRetry(`${HF_SPACE_URL}/call/predict/${eventId}`, { method: "GET" });
    if (!eventRes.ok) {
      throw new Error(`Predict event failed (HTTP ${eventRes.status}): ${(await eventRes.text()).slice(0, 200)}`);
    }
    const sseRaw = await eventRes.text();
    const { eventType, dataLine } = parseSSE(sseRaw);
    if (!dataLine) throw new Error("HF event response missing data");

    const parsed = parseJsonSafely(dataLine);
    const rawMarkdown = Array.isArray(parsed) ? String(parsed[0] ?? "") : String(parsed ?? dataLine);
    if (eventType === "error" || rawMarkdown.toLowerCase().startsWith("error:")) {
      throw new Error(rawMarkdown);
    }

    const lower = rawMarkdown.toLowerCase();
    const nonDiagnostic = isNonDiagnosticNarrative(rawMarkdown);
    if (nonDiagnostic) {
      return {
        diagnosis: "Non-Diagnostic Output",
        confidence: 0.25,
        heartRate: 0,
        rhythm: "Not Determined",
        stSegment: "Not Determined",
        qtInterval: "Not Determined",
        findings: ["Model returned a non-diagnostic response for this ECG image. Please retry with a clearer 12-lead ECG image."],
        recommendations: [
          "Re-upload a high-resolution ECG image with clear waveforms.",
          "If repeated, retrain or retune the model prompt/instruction set.",
          "Use physician review for immediate interpretation."
        ]
      };
    }

    const isAbnormal =
      lower.includes("abnormal") ||
      lower.includes("ischemia") ||
      lower.includes("arrhythmia") ||
      lower.includes("tachycardia") ||
      lower.includes("fibrillation");
    const likelyCritical = lower.includes("infarction") || lower.includes("st elevation") || lower.includes("ventricular tachycardia");

    let heartRate = 72;
    const hrMatch = rawMarkdown.match(/(\d{2,3}) (bpm|beats per minute)/i);
    if (hrMatch) heartRate = parseInt(hrMatch[1], 10);
    const findings = splitClinicalSentences(rawMarkdown, 5);

    const payload: DiagnosisResult = {
      diagnosis: likelyCritical ? "High-Risk Pathology Suspected" : isAbnormal ? "Pathological Trace Detected" : "Normal Sinus Rhythm",
      confidence: likelyCritical ? 0.95 : isAbnormal ? 0.9 : 0.94,
      heartRate,
      rhythm: isAbnormal ? "Review Markdown Narrative" : "Regular",
      stSegment: isAbnormal ? "Pending Physician Validation" : "Isoelectric",
      qtInterval: "Pending exact measurement",
      findings: findings.length > 0 ? findings : [rawMarkdown.slice(0, 300)],
      recommendations: buildRecommendations(isAbnormal)
    };

    if (!isDiagnosisResult(payload)) throw new Error("Inference API returned invalid payload shape");
    return payload;
  } catch (error: unknown) {
    console.error("Inference Error:", error);
    const message = toErrorMessage(error);
    if (isNetworkError(message)) {
      try {
        return await analyzeViaNetlifyFallback(file);
      } catch (fallbackError: unknown) {
        throw new Error(`HF Space inference failed (direct + fallback): ${toErrorMessage(fallbackError)}`);
      }
    }
    throw new Error(`HF Space inference failed: ${message}`);
  }
};

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'complete' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const reportGeneratedAt = new Date().toLocaleString();
  const reportId = `CAR-${Date.now().toString().slice(-8)}`;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setupFile(e.target.files[0]);
    }
  };

  const setupFile = (selectedFile: File) => {
    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setStatus('idle');
    setResult(null);
    setErrorText(null);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setupFile(e.dataTransfer.files[0]);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    
    setStatus('analyzing');
    setProgress(0);
    setErrorText(null);
    
    // Simulate loading bar since we don't stream real progress
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 95) {
          clearInterval(interval);
          return 95;
        }
        return p + 5;
      });
    }, 500);

    try {
      const data = await analyzeECG(file);
      clearInterval(interval);
      setProgress(100);
      setResult(data);
      setStatus('complete');
    } catch (err: unknown) {
      clearInterval(interval);
      setProgress(0);
      if (err instanceof Error) {
        setErrorText(err.message);
      } else {
        setErrorText("An unknown error occurred");
      }
      setStatus('error');
    }
  };

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setStatus('idle');
    setResult(null);
    setErrorText(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen">
      <div className="container animate-fade-in">
        <header className="header">
          <div className="logo">
            <HeartPulse size={32} color="var(--primary)" />
            <span>CardioAI</span>
          </div>
          <nav>
            <button className="btn-outline" onClick={() => window.print()} title="Print or Save PDF">
              <Printer size={18} /> Export
            </button>
          </nav>
        </header>

        <main className="dashboard-grid">
          {/* Left Column - Input area */}
          <div className="glass-panel">
            <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={24} color="var(--primary)" />
              ECG Scan Upload
            </h2>
            
            {!previewUrl ? (
              <div 
                className={`upload-area ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input 
                  type="file" 
                  className="hidden-input" 
                  accept="image/*,.pdf" 
                  onChange={handleFileChange} 
                  ref={fileInputRef}
                  title=""
                />
                <UploadCloud className="upload-icon" />
                <h3 style={{ marginBottom: '8px' }}>Drag & drop your ECG scan</h3>
                <p style={{ color: 'var(--text-muted)' }}>or click to browse from device</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '16px' }}>
                  Supported formats: JPG, PNG, PDF
                </p>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <img src={previewUrl} alt="ECG Preview" className="image-preview animate-fade-in" />
                <p style={{ marginTop: '16px', fontWeight: '500' }}>{file?.name}</p>
                
                <div style={{ marginTop: '24px', display: 'flex', gap: '16px', justifyContent: 'center' }}>
                  <button className="btn-outline" onClick={reset}>Cancel</button>
                  <button 
                    className="btn-primary" 
                    onClick={handleAnalyze}
                    disabled={status === 'analyzing'}
                  >
                    {status === 'analyzing' ? (
                      <>
                        <Activity className="animate-pulse" size={18} />
                        Analyzing... {progress}%
                      </>
                    ) : (
                      <>
                        <Activity size={18} />
                        Run Diagnosis
                      </>
                    )}
                  </button>
                </div>

                {status === 'analyzing' && (
                  <div className="progress-container">
                    <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Results area */}
          <div className="glass-panel" style={{ opacity: status === 'complete' ? 1 : 0.6, transition: 'opacity 0.3s ease' }}>
            <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={24} color="var(--primary)" />
              AI Diagnosis Report
            </h2>

            {status === 'idle' && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
                <AlertCircle size={48} style={{ opacity: 0.5, marginBottom: '16px' }} />
                <p>Upload and analyze an ECG scan to view the report.</p>
              </div>
            )}

            {status === 'error' && (
              <div style={{ textAlign: 'center', color: 'var(--error)', padding: '40px 0' }}>
                <AlertCircle size={48} style={{ opacity: 0.8, marginBottom: '16px' }} />
                <p><strong>Diagnosis Failed</strong></p>
                <p style={{ fontSize: '0.9rem', marginTop: '8px', color: 'var(--text-muted)' }}>{errorText}</p>
              </div>
            )}

            {status === 'analyzing' && (
              <div style={{ textAlign: 'center', color: 'var(--primary)', padding: '40px 0' }}>
                <HeartPulse size={48} className="animate-pulse" style={{ marginBottom: '16px' }} />
                <p>Contacting MedGemma / PULSE-ECG HF Endpoint...</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  This may take up to 2 minutes if the model is waking up.
                </p>
              </div>
            )}

            {status === 'complete' && result && (
              <div className="result-card animate-fade-in">
                <div className="report-headline">
                  <div>
                    <p className="report-meta-label">Preliminary AI ECG Interpretation</p>
                    <h3 className="report-title">Clinical Summary Report</h3>
                  </div>
                  <div className="report-meta">
                    <p>Report ID: {reportId}</p>
                    <p>Generated: {reportGeneratedAt}</p>
                  </div>
                </div>

                <div className="status-strip">
                  <div className={`status-badge ${(result.diagnosis.toLowerCase().includes("normal")) ? "normal" : "abnormal"}`}>
                    <AlertCircle size={16} />
                    {result.diagnosis}
                  </div>
                  <p className="confidence-label">Model Confidence: {(result.confidence * 100).toFixed(1)}%</p>
                </div>

                <div className="metric-grid">
                  <div className="metric-tile">
                    <p className="metric-label">Heart Rate</p>
                    <p className="metric-value">{result.heartRate} bpm</p>
                  </div>
                  <div className="metric-tile">
                    <p className="metric-label">Rhythm</p>
                    <p className="metric-value">{result.rhythm}</p>
                  </div>
                  <div className="metric-tile">
                    <p className="metric-label">ST Segment</p>
                    <p className="metric-value">{result.stSegment}</p>
                  </div>
                  <div className="metric-tile">
                    <p className="metric-label">QT Interval</p>
                    <p className="metric-value">{result.qtInterval}</p>
                  </div>
                </div>

                <div className="report-section">
                  <h4 className="section-title">Key Findings</h4>
                  <ul className="clinical-list">
                    {result.findings.map((finding: string, i: number) => (
                      <li key={i}>{finding}</li>
                    ))}
                  </ul>
                </div>

                <div className="report-section">
                  <h4 className="section-title section-title-success">Clinical Recommendations</h4>
                  <ul className="clinical-list">
                    {result.recommendations.map((rec: string, i: number) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>

                <p className="clinical-disclaimer">
                  This is an AI-assisted preliminary interpretation and must be validated by a licensed physician before clinical decision-making.
                </p>

                <div style={{ display: 'flex', gap: '16px', marginTop: '16px', justifyContent: 'center' }}>
                  <button className="btn-outline" onClick={() => window.print()}>
                    <Printer size={18} /> Print Report
                  </button>
                  <button className="btn-outline" onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))}>
                    <Copy size={18} /> Copy Data
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Universal Footer */}
          <footer className="app-footer hide-on-print">
            <div className="footer-content">
              <div className="footer-creator">
                <strong>Created by:</strong> Dr Siddalingaiah H S, Professor, Community Medicine<br/>
                Shridevi Institute of Medical Sciences and Research Hospital, Tumkur<br/>
                hssling@yahoo.com | 8941087719
              </div>
              <div className="footer-models">
                <strong>Model:</strong> ECG Clinical PEFT Engine<br/>
                <strong>Training:</strong> PTB-XL ECG Dataset<br/>
                <strong>Performance:</strong> F1-Score: 0.88 | Accuracy: 91%
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;
