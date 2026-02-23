# CardioAI: Comprehensive Documentation

## Overview

CardioAI is a state-of-the-art web application designed for automated, AI-assisted diagnosis of Electrocardiogram (ECG) scans. By leveraging advanced foundation models—specifically the Multimodal Large Language Model (MLLM) `PULSE-ECG/PULSE-7B` hosted on Hugging Face—CardioAI can ingest standard 12-lead ECG images and produce comprehensive clinical reports.

The application is built with a React + Vite frontend and utilizes Netlify Serverless Functions as a secure proxy backend. This architecture ensures high performance, a premium user experience with modern UI aesthetics, and enterprise-grade security for API keys.

---

## 🚀 Capabilities

CardioAI is designed to empower healthcare professionals and researchers with the following capabilities:

### 1. Robust Multimodal Image Inference

CardioAI natively processes ECG images containing standard cardiac wave tracings. Powered by the Hugging Face Inference API and `PULSE-7B`, the application "reads" the visual patterns of an ECG scan, mimicking a cardiologist's visual assessment.

### 2. Multi-Class Diagnostic Reporting

The core AI engine can classify and detail numerous cardiovascular pathologies:

- Arrhythmias (e.g., Atrial Fibrillation, Ventricular Tachycardia)
- Myocardial Infarction (MI) and Ischemia
- Conduction Defects (CD)
- Hypertrophy (HYP)
- ST-T wave changes

### 3. Detailed Clinical Trace Extraction

Unlike traditional binary classifiers, the MLLM architecture attempts to extract detailed phenomenological observations, such as:

- Estimated Heart Rate
- Rhythm regularity
- ST Segment evaluation
- QT Interval analysis

### 4. Zero-Config Cloud Deployment

The app is orchestrated with a `netlify.toml` file, meaning the entire React application and the API layer (Serverless Functions) are automatically deployed the moment code is pushed to a connected repository. No DevOps overhead is required.

### 5. Secure Backend Proxy

Directly calling Hugging Face from a React client exposes billing/API tokens. CardioAI bypasses this by utilizing Netlify Functions (`netlify/functions/analyze_ecg.js`). The frontend simply requests the local API, which then injects the `HF_TOKEN` entirely server-side, securing your Hugging Face credentials.

---

## ⚡ Performance Parameters

The exact performance of the CardioAI system depends on two major factors: the host infrastructure (Netlify) and the AI Inference provider (Hugging Face).

### Latency and Inference Speed

- **Cold Start Latency:** Hugging Face Inference API dynamically scales endpoints. If the `PULSE-7B` model has not been used recently, there is a "cold start" period where Hugging Face loads the 7-Billion parameter weights into GPU VRAM. This can take **~60 to 120 seconds**. The cardioAI frontend automatically detects HTTP 503 states during this period and gracefully prompts the user to wait.
- **Warm Inference Latency:** Once the model is actively loaded into HF GPU memory, inference typically takes **5 to 15 seconds** depending on the complexity of the scan and the image resolution submitted.
- **Frontend Rendering:** The React + Vite SPA (Single Page Application) is aggressively minified, exhibiting a Time-to-Interactive (TTI) of <1 second on average broadband.

### AI Model Accuracy and Efficacy (`PULSE-7B`)

`PULSE-ECG/PULSE-7B` is trained on a massive instruction dataset (`ECGInstruct`) comprising over 1,000,000 ECG instruction-tuning samples. It performs remarkably well compared to standard deterministic algorithms:

- **Contextual Understanding:** Can synthesize text-based reports rather than just categorical labels, providing nuanced explanations for _why_ it suspects a specific diagnosis.
- **Limitation (Research Use):** While highly capable, this model is a research prototype. It should **not** entirely replace human expert clinical judgment. It acts as an augmented intelligence assistant.
- **Fine-tuning Potential:** The application includes a script (`train_ecg_model.py`) that demonstrates the pipeline for further fine-tuning smaller Vision Transformers (like ViT) specifically on `PTB-XL` (a massive clinical dataset of 21,000+ 12-lead ECGs) to achieve even higher deterministic classification accuracy metrics (often exceeding 90% ROC-AUC on standard arrhythmia detection).

---

## 💻 Tech Stack Architecture

1.  **Frontend:** React 18, TypeScript, Vite
2.  **Styling:** Vanilla CSS 3 with custom CSS Variables for a glassmorphic dark theme (No Tailwind dependency). Icons by `lucide-react`.
3.  **Backend Services:** Netlify Serverless Functions (Node.js/JavaScript).
4.  **AI Engine:** Hugging Face Inference API (`https://api-inference.huggingface.co`).
5.  **Default Model:** `PULSE-ECG/PULSE-7B` (Multimodal LLM designed specifically for Electrocardiograms).

---

## 🛠️ Security and Privacy Note

When dealing with medical data (like ECGs), privacy is paramount.

- **Current State:** Scans uploaded to this application are sent as Base64 strings over TLS/SSL to Hugging Face servers for processing.
- **Compliance:** Do not upload scans containing Protected Health Information (PHI) like patient names or IDs, as the Hugging Face free Inference API does not guarantee HIPAA compliance. For clinical usage, you must spin up a private Hugging Face Dedicated Endpoint.
