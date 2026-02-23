# CardioAI: Comprehensive Documentation

## Overview

CardioAI is a state-of-the-art web application designed for automated, AI-assisted diagnosis of Electrocardiogram (ECG) scans. By leveraging a highly custom-trained Vision-Language Model (`Qwen2-VL` fine-tuned via LoRA) hosted on a dedicated Hugging Face Space, CardioAI can ingest standard 12-lead ECG images and produce comprehensive clinical reports.

The application is built with a React + Vite frontend and utilizes `@gradio/client` to securely interface directly with our custom Hugging Face Space Serverless API. This architecture ensures high performance, a premium user experience, and completely free serverless operation with zero DevOps overhead.

---

## 🚀 Capabilities

CardioAI is designed to empower healthcare professionals and researchers with the following capabilities:

### 1. Robust Multimodal Image Inference

CardioAI natively processes ECG images containing standard cardiac wave tracings. Powered by our custom fine-tuned `Qwen2-VL` adapter hosted on a Hugging Face Space, the application "reads" the visual patterns of an ECG scan, mimicking a cardiologist's visual assessment.

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

The frontend is orchestrated via Netlify, while the backend API (`hssling/cardioai-api`) is synced automatically via GitHub Actions from our `ecg-analyzer-model` training repository to a Hugging Face Space.

### 5. Secure Backend API connection

The frontend utilizes `@gradio/client` over secure WebSockets directly to the Hugging Face Space, completely avoiding local heavy GPUs or manual AWS configurations. This provides a lightning-fast, highly scalable production endpoint.

---

## ⚡ Performance Parameters

The exact performance of the CardioAI system depends on two major factors: the host infrastructure (Netlify) and the Hugging Face Space container state.

### Latency and Inference Speed

- **Cold Start Latency:** Free Hugging Face Spaces spin down to sleep after inactivity. It can take **~60 to 120 seconds** to boot the container back up. The `App.tsx` logic elegantly waits while alerting the user if the backend is actively booting.
- **Warm Inference Latency:** Once the model is actively loaded into GPU/CPU memory, inference typically takes **5 to 15 seconds**.
- **Frontend Rendering:** The React + Vite SPA (Single Page Application) is aggressively minified, exhibiting a Time-to-Interactive (TTI) of <1 second on average broadband.

### AI Model Accuracy and Efficacy (`Qwen2-VL Custom Adapter`)

Your backend consists of a Kaggle-trained adapter merging domain-specific ECG datasets with `Qwen2-VL`:

- **Contextual Understanding:** Can synthesize text-based reports rather than just categorical labels, providing nuanced explanations for _why_ it suspects a specific diagnosis.
- **Limitation (Research Use):** While highly capable, this model is a research prototype. It should **not** entirely replace human expert clinical judgment. It acts as an augmented intelligence assistant.
- **Continuous Learning Pipeline:** Provided in the `ecg-analyzer-model` repo is `train_ecg.py`. When mounted to Kaggle's T4x2 GPU infrastructure, this fully automated script wipes old progress, clones your GitHub, downloads massive datasets (like `PTB-XL` or `10k-Control`), loops for multiple deep epochs, applies QLoRA quantization, and automatically overwrites the Hub weights out to `hssling/cardioai-adapter`, triggering a 0-touch CI/CD pipeline down to the frontend.

---

## 💻 Tech Stack Architecture

1.  **Frontend:** React 18, TypeScript, Vite
2.  **Styling:** Vanilla CSS 3 with custom CSS Variables for a glassmorphic dark theme (No Tailwind dependency). Icons by `lucide-react`.
3.  **Backend Services:** Gradio API Client on a Serverless Python Backend.
4.  **AI Engine:** Hugging Face Spaces Containerization (`hssling/cardioai-api`).
5.  **Default Model:** Custom fine-tuned `Qwen2-VL-2B` Adapter targeting Electrocardiograms.

---

## 🛠️ Security and Privacy Note

When dealing with medical data (like ECGs), privacy is paramount.

- **Current State:** Scans uploaded to this application are sent as Base64 strings over TLS/SSL to Hugging Face servers for processing.
- **Compliance:** Do not upload scans containing Protected Health Information (PHI) like patient names or IDs, as the Hugging Face free Inference API does not guarantee HIPAA compliance. For clinical usage, you must spin up a private Hugging Face Dedicated Endpoint.
