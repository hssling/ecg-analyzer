import React, { useState, useRef } from 'react';
import { 
  HeartPulse, 
  UploadCloud, 
  FileText, 
  Activity, 
  AlertCircle, 
  Clock,
  Download
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

// Mock analysis function using a timeout to simulate a Hugging Face API call
const mockAnalyzeECG = async (file: File): Promise<DiagnosisResult> => {
  console.log("Analyzing file:", file.name);
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        diagnosis: 'Atrial Fibrillation',
        confidence: 0.94,
        heartRate: 112,
        rhythm: 'Irregularly irregular',
        stSegment: 'Normal',
        qtInterval: '420ms (Borderline)',
        findings: [
          'Absence of distinct P waves',
          'Irregular R-R intervals',
          'Fibrillatory f waves present in lead V1'
        ],
        recommendations: [
          'Cardiology consultation recommended',
          'Evaluate for anticoagulation therapy based on CHA2DS2-VASc score',
          'Consider rate control vs rhythm control strategy'
        ]
      });
    }, 3000);
  });
};

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'complete'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

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
    
    // Simulate progress
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 90) {
          clearInterval(interval);
          return 90;
        }
        return p + 10;
      });
    }, 300);

    const data = await mockAnalyzeECG(file);
    clearInterval(interval);
    setProgress(100);
    
    setTimeout(() => {
      setResult(data);
      setStatus('complete');
    }, 500);
  };

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setStatus('idle');
    setResult(null);
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
            <button className="btn-outline">
              <Clock size={18} /> History
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

            {status === 'analyzing' && (
              <div style={{ textAlign: 'center', color: 'var(--primary)', padding: '40px 0' }}>
                <HeartPulse size={48} className="animate-pulse" style={{ marginBottom: '16px' }} />
                <p>MedGemma inference model is running...</p>
              </div>
            )}

            {status === 'complete' && result && (
              <div className="result-card animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Primary Finding</h3>
                    <div className="status-badge abnormal">
                      <AlertCircle size={16} />
                      {result.diagnosis} ({(result.confidence * 100).toFixed(1)}%)
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Heart Rate</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: '600' }}>{result.heartRate} bpm</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Rhythm</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: '600' }}>{result.rhythm}</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>ST Segment</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: '600' }}>{result.stSegment}</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>QT Interval</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: '600' }}>{result.qtInterval}</p>
                  </div>
                </div>

                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ marginBottom: '8px', color: 'var(--primary)' }}>Key Findings</h4>
                  <ul style={{ paddingLeft: '20px', margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                    {result.findings.map((finding: string, i: number) => (
                      <li key={i} style={{ marginBottom: '4px' }}>{finding}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ marginBottom: '8px', color: 'var(--success)' }}>Clinical Recommendations</h4>
                  <ul style={{ paddingLeft: '20px', margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                    {result.recommendations.map((rec: string, i: number) => (
                      <li key={i} style={{ marginBottom: '4px' }}>{rec}</li>
                    ))}
                  </ul>
                </div>

                <button className="btn-outline" style={{ marginTop: '16px', justifyContent: 'center' }}>
                  <Download size={18} /> Download Full PDF Report
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
