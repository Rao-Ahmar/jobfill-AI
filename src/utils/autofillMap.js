export const fieldPatterns = {
  firstName: ["first_name", "firstName", "first-name", "fname"],
  lastName: ["last_name", "lastName", "last-name", "lname"],
  fullName: ["name", "full_name", "fullName", "full-name"],
  email: ["email", "e-mail", "email_address", "emailaddress"],
  phone: ["phone", "mobile", "cell", "telephone", "phone_number"],
  location: ["location", "city", "address", "residence"],
  linkedin: ["linkedin", "linked in", "linkedin_url", "linkedin_profile"],
  portfolio: ["website", "portfolio", "github", "personal_website"],
  jobTitle: ["title", "current_title", "role", "position"],
  coverLetter: ["cover_letter", "coverLetter", "cover-letter", "message"]
};

export function matchField(identifier) {
  if (!identifier) return null;
  const normalized = identifier.toLowerCase().replace(/[^a-z0-9]/g, "");
  
  for (const [key, patterns] of Object.entries(fieldPatterns)) {
    for (const pattern of patterns) {
      const normPattern = pattern.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normalized.includes(normPattern)) {
        return key;
      }
    }
  }
  return null;
}
