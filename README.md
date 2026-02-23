# CardioAI: ECG Diagnosis & Reporting App

CardioAI is a premium, AI-assisted web application for ECG diagnosis and reporting, designed for healthcare professionals. This repository contains the frontend application and a training script for fine-tuning Foundation Models on public high-quality ECG datasets.

## Objectives

1. **AI-Assisted Diagnosis**: Enable instantaneous analysis using high-performance Vision and Multimodal models based on ECG images.
2. **Premium Visuals**: Provide a modern, glassmorphic UI utilizing Dark Mode aesthetics to enhance usability.
3. **Seamless Deployment**: Integrated with `netlify.toml` for zero-configuration, continuous deployment to Netlify.

## Project Structure

- `src/`: The React + Vite frontend application source code.
- `index.html`: The entry point and SEO-optimized markup.
- `netlify.toml`: Netlify build settings to ensure the React router SPA correctly manages redirects and outputs the production bundle.
- `train_ecg_model.py`: A Hugging Face `transformers` Python script outlining how to train a model to evaluate the `edcci/GenECG` dataset (which is derived from the official `PTB-XL` dataset).

## Running the Web App Locally

Ensure you have Node.js installed, then run:

```bash
npm install
npm run dev
```

Your server will typically deploy to `http://localhost:5173`.

## Deployment to Netlify

This project is already equipped with `netlify.toml` for rapid deployment.

1. Create a Netlify Account.
2. Connect your GitHub repository containing this app.
3. Netlify will automatically detect Vite and run `npm run build` using the settings from `netlify.toml` to output your `.dist/` production assets.

## Integration with AI Models (MedGemma & HF)

Currently, the `App.tsx` file features a **simulated Hugging Face API call** with a high-fidelity interface, enabling frontend testing and rapid prototyping without incurring GPU/API costs.

To run inference on actual pretrained models or your own fine-tuned `MedGemma` / Vision Transformer checkpoints, edit the `mockAnalyzeECG` function in `src/App.tsx` and integrate the official Hugging Face `@huggingface/inference` JavaScript client.

## Training Custom ECG Models

Refer to the included `train_ecg_model.py` script. It demonstrates how to utilize `ptb-xl` based datasets (specifically image-based versions like `edcci/GenECG`) to build multi-class cardiovascular diagnostic engines with standard Transformers logic.

Requirements to train locally or in HF Spaces:

```bash
pip install transformers datasets torch torchvision accelerate
```
