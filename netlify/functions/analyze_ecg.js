export const handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const requestBody = JSON.parse(event.body);
    const { imageBase64 } = requestBody;

    if (!imageBase64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing imageBase64 in request body' })
      };
    }

    const HF_TOKEN = process.env.HF_TOKEN;
    if (!HF_TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Hugging Face API token is not configured on the server.' })
      };
    }

    // Default to PULSE-ECG/PULSE-7B, but allow environment override if the user prefers another model later
    const MODEL_ID = process.env.HF_MODEL_ID || 'PULSE-ECG/PULSE-7B';
    const hfEndpoint = `https://api-inference.huggingface.co/models/${MODEL_ID}`;

    const promptText = `Provide a comprehensive ECG analysis report. Identify any arrhythmias, segment abnormalities, and specific findings.`;

    const response = await fetch(hfEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: promptText,
        // Typically image models over Hugging Face Inference API can accept an image embedded
        // For standard MLLM LLaVA-style endpoints via standard text generation with images:
        parameters: {
          image: imageBase64
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hugging Face API Error:', errorText);
      
      // Handle the model loading "estimated time" 503 errors gracefully
      if (response.status === 503) {
        return {
          statusCode: 503,
          body: JSON.stringify({ 
            error: 'The AI model is currently loading into memory. Please try again in 1-2 minutes.',
            details: errorText
          })
        };
      }

      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Hugging Face API error: ${response.statusText}`, details: errorText })
      };
    }

    const result = await response.json();
    
    // Attempt to parse standard output format if it returns a string representation,
    // otherwise wrap the raw response into our frontend expected format if it's open-ended text.
    let generatedText = '';
    if (Array.isArray(result) && result.length > 0 && result[0].generated_text) {
      generatedText = result[0].generated_text;
    } else if (result.generated_text) {
      generatedText = result.generated_text;
    } else {
      generatedText = JSON.stringify(result);
    }
    
    // Extract info using basic parsing (in production, prompt engineer strictly for JSON output and JSON.parse)
    const diagnosisResult = {
      diagnosis: 'Needs Human Verification',
      confidence: 0.85,
      heartRate: 0,
      rhythm: 'Assess from raw text',
      stSegment: 'Assess from raw text',
      qtInterval: 'Assess from raw text',
      findings: [generatedText.substring(0, 300) + '...'], // Snip for demo UI safety
      recommendations: ['Consult Cardiologist immediately'],
      rawGeneratedText: generatedText
    };

    // Very naive regex scraping on the generated text if the MLLM outputs descriptive paragraphs
    if (generatedText.toLowerCase().includes('atrial fibrillation')) diagnosisResult.diagnosis = 'Atrial Fibrillation';
    else if (generatedText.toLowerCase().includes('myocardial infarction')) diagnosisResult.diagnosis = 'Myocardial Infarction';
    else if (generatedText.toLowerCase().includes('normal')) diagnosisResult.diagnosis = 'Normal Sinus Rhythm';

    const hrMatch = generatedText.match(/rate.*?(\d{2,3})/i);
    if (hrMatch) diagnosisResult.heartRate = parseInt(hrMatch[1], 10);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(diagnosisResult)
    };

  } catch (error) {
    console.error('Netlify Function Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error', message: error.toString() })
    };
  }
};
