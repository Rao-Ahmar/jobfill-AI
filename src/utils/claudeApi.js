const PROXY_API_URL = 'http://localhost:3001/api/generate';

export async function generateCoverLetter(profile, resumeText, jobDescription) {
  const systemPrompt = "You are an expert career coach and cover letter writer. Your task is to write a professional, tailored cover letter in 3 paragraphs. Make it sound human. Match keywords from the job description naturally.";
  
  const userPrompt = `
Here is my profile data:
${JSON.stringify(profile, null, 2)}

Here is my extracted resume text:
${resumeText || "No resume provided."}

Here is the Job Description:
${jobDescription}

Please write the cover letter now. Ensure it is exactly 3 paragraphs. Only return the cover letter text, no conversational preamble.
`;

  try {
    const response = await fetch(PROXY_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1500,
        system: systemPrompt,
        prompt: userPrompt,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to generate cover letter.");
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (err) {
    console.error("Cover letter generation error:", err);
    throw err;
  }
}

export async function analyzeKeywords(profile, resumeText, jobDescription) {
  const systemPrompt = `You are an expert ATS optimizer. 
Extract top 10 ATS keywords from the job description. 
For each keyword, check if it logically exists in the provided profile/resume.
If missing, suggest a short, natural rewrite to add it to their experience bullet points.
Return exactly and only a JSON object in this format: 
{
  "results": [
    { "keyword": "React", "foundInResume": true, "suggestedRewrite": "" },
    { "keyword": "GraphQL", "foundInResume": false, "suggestedRewrite": "Added GraphQL to data fetching layer..." }
  ]
}
Do not include markdown codeblocks (\`\`\`json) in your response, just the raw JSON.`;

  const userPrompt = `
Profile Data:
${JSON.stringify(profile, null, 2)}

Resume Text:
${resumeText || "No resume provided."}

Job Description:
${jobDescription}
`;

  try {
    const response = await fetch(PROXY_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1500,
        system: systemPrompt,
        prompt: userPrompt,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to analyze keywords.");
    }

    const data = await response.json();
    let text = data.content[0].text;
    
    if (text.startsWith('\`\`\`json')) {
      text = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    }
    
    const parsed = JSON.parse(text);
    return parsed.results || [];
  } catch (err) {
    console.error("Keyword analysis error:", err);
    throw err;
  }
}

export async function generateAutoFillMapping(profile, customFields, resumeText, formFields) {
  const systemPrompt = `You are an expert job application autofill AI.
You will receive a user's Profile Data, Custom Profile Answers, Resume Text, and a list of Form Fields extracted from a job application page.
Your task is to:
1. Accurately map the user's data to the form fields.
2. Identify any requested form fields where the profile/resume clearly DOES NOT contain the answer, and output their labels in a 'missingFields' array so the user can answer them for next time.

Return exactly and only a JSON object matching this structure:
{
  "mapping": {
    "field_id_1": "John Doe",
    "field_id_2": "john@example.com"
  },
  "missingFields": [
    "Do you require Visa Sponsorship?",
    "Desired Salary"
  ]
}

Where the key in "mapping" is exactly the 'id' (or 'name'/'label' if id is missing) provided in the Form Fields list.
If a field asks for something you don't know, leave its value as "" in "mapping", AND add its label to "missingFields".
Use 'customFields' answers to fill fields.
CRITICAL: You must output STRICT, VALID JSON ONLY. Do NOT wrap it in markdown codeblocks. Escape all inner quotes and newlines accurately.`;

  const userPrompt = `
Profile Data:
${JSON.stringify(profile, null, 2)}

Custom Profile Answers:
${JSON.stringify(customFields || {}, null, 2)}

Resume Text:
${resumeText || "No resume provided."}

Form Fields:
${JSON.stringify(formFields, null, 2)}
`;

  try {
    const response = await fetch(PROXY_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 8192,
        system: systemPrompt,
        prompt: userPrompt,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to generate autofill mapping.");
    }

    const data = await response.json();
    let text = data.content[0].text;
    
    // Safely extract just the JSON block if the AI ignored instructions and added markdown
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }
    
    try {
      const parsed = JSON.parse(text);
      return {
        mapping: parsed.mapping || {},
        missingFields: parsed.missingFields || []
      };
    } catch (parseError) {
      console.error("Failed to parse AI JSON response:", text);
      throw new Error("AI returned malformed JSON. Please try again.");
    }
  } catch (err) {
    console.error("Autofill mapping error:", err);
    throw err;
  }
}
