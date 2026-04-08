const PROXY_API_URL = 'http://localhost:3001/api/generate';

export async function generateCoverLetter(profile, resumeText, jobDescription, email) {
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
        email: email || undefined,
        feature: 'coverletter',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 403) {
        const err = new Error(errorData.error || 'Usage limit reached.');
        err.code = errorData.code;
        err.serverUsage = errorData;
        throw err;
      }
      throw new Error(errorData.error || "Failed to generate cover letter.");
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error("No response from AI. Please try again.");
    return { text, _serverUsage: data._serverUsage || null };
  } catch (err) {
    console.error("Cover letter generation error:", err);
    throw err;
  }
}

export async function analyzeKeywords(profile, resumeText, jobDescription, email) {
  const systemPrompt = `You are an expert ATS optimizer.
Extract top 10 ATS keywords from the job description.
For each keyword:
- Check if it logically exists in the provided profile/resume.
- Assign an "importance" level: "high", "medium", or "low" based on how critical this keyword is for the role.
- Assign a "matchScore" from 0 to 100: 0 = completely absent, 50 = partially demonstrated, 100 = strongly demonstrated in the resume.
- If missing or weak, suggest a short, natural rewrite to add it to their experience bullet points.

Also provide:
- "overallScore": a weighted 0-100 overall match percentage (high-importance keywords count more).
- "summary": a one-line verdict (e.g. "Strong match — missing 2 critical skills").

Return exactly and only a JSON object in this format:
{
  "overallScore": 72,
  "summary": "Strong match — consider adding cloud experience",
  "results": [
    { "keyword": "React", "foundInResume": true, "matchScore": 95, "importance": "high", "suggestedRewrite": "" },
    { "keyword": "GraphQL", "foundInResume": false, "matchScore": 0, "importance": "medium", "suggestedRewrite": "Added GraphQL to data fetching layer..." }
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
        max_tokens: 4096,
        system: systemPrompt,
        prompt: userPrompt,
        email: email || undefined,
        feature: 'keywords',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 403) {
        const err = new Error(errorData.error || 'Usage limit reached.');
        err.code = errorData.code;
        err.serverUsage = errorData;
        throw err;
      }
      throw new Error(errorData.error || "Failed to analyze keywords.");
    }

    const data = await response.json();
    let text = data?.content?.[0]?.text;

    if (!text) {
      throw new Error("No response from AI. Please try again.");
    }

    // Strip markdown code blocks if present
    if (text.startsWith('\`\`\`')) {
      text = text.replace(/\`\`\`json\s*/gi, '').replace(/\`\`\`/g, '').trim();
    }

    // Extract JSON object if surrounded by extra text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }

    try {
      const parsed = JSON.parse(text);
      const results = Array.isArray(parsed.results || parsed.keywords)
        ? (parsed.results || parsed.keywords)
        : [];
      const overallScore = typeof parsed.overallScore === 'number'
        ? Math.max(0, Math.min(100, parsed.overallScore))
        : 0;
      const summary = typeof parsed.summary === 'string'
        ? parsed.summary
        : '';
      return { overallScore, summary, results, _serverUsage: data._serverUsage || null };
    } catch (parseError) {
      console.error("Failed to parse AI JSON response:", text);
      throw new Error("AI returned malformed response. Please try again.");
    }
  } catch (err) {
    console.error("Keyword analysis error:", err);
    throw err;
  }
}

export async function generateAutoFillMapping(profile, customFields, resumeText, formFields, email) {
  const systemPrompt = `You are the job applicant. You are filling out a real job application form.
You receive your Profile, Custom Answers, Resume, and a list of Form Fields (each has an "id", "label", "type", and sometimes "options").

ABSOLUTE RULES — FOLLOW ALL OF THEM:

1. YOU MUST FILL EVERY SINGLE FIELD. Zero exceptions. Never leave a value as "".
2. The KEY in your "mapping" object MUST be the exact "id" value from each Form Field. Never use the label as the key.
3. For factual fields (name, email, phone, address, education, work experience) → use exact data from Profile/Resume.
4. For open-ended or subjective questions (e.g. "What are you most proud of?", "Why us?", "Describe yourself", "Your interest", "What was your manager like?") → Write a genuine first-person answer using your resume achievements. Sound human, casual, authentic. 2-4 sentences.
5. For consent/agreement/confirmation/policy questions (e.g. "I consent to...", "Are you prepared to...", "Please confirm...", "I pledge to...", "Working hours are 9-6, confirm") → ALWAYS answer with a clear affirmative like "Yes, I confirm and agree" or "Yes, I'm fully prepared and committed to this" or "Absolutely, I agree to these terms." Make it sound natural and human.
6. For dropdown/select fields with "options" → pick the BEST matching option text exactly as provided.
7. For checkbox/radio → answer "Yes" or the appropriate option.
8. Only add to "missingFields" if it asks for very specific private numerical data (exact salary number, government ID, bank details). Questions about agreements, confirmations, or opinions are NEVER missing — answer them.
9. Use 'customFields' answers when they match a field.

OUTPUT FORMAT — strict JSON only:
{
  "mapping": {
    "actual_field_id_1": "John Doe",
    "actual_field_id_2": "Yes, I fully agree and confirm.",
    "actual_field_id_3": "Honestly, leading the product redesign at my last company was huge for me. We improved user retention by 40% and I got to mentor two junior devs through the process."
  },
  "missingFields": ["Expected Salary Amount"]
}

CRITICAL: Output ONLY valid JSON. No markdown. No codeblocks. Escape quotes and newlines properly.`;

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
        email: email || undefined,
        feature: 'autofill',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 403) {
        const err = new Error(errorData.error || 'Usage limit reached.');
        err.code = errorData.code;
        err.serverUsage = errorData;
        throw err;
      }
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
        missingFields: parsed.missingFields || [],
        _serverUsage: data._serverUsage || null,
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
