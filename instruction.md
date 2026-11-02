# Project: Universal AI Form Assistant – Chrome Extension

## 1. Project Overview

Build a production-ready Chrome Extension called **FormPilot AI**.

The extension should intelligently detect, analyze, answer, and autofill questions on almost any website.

The primary objective is to allow users to click the extension icon, select **Answer All**, and let AI automatically:

1. Detect all questions present on the current webpage.
2. Identify the question type.
3. Understand the question and available answer options.
4. Generate the most accurate answer using configured AI providers.
5. Select the correct MCQ, radio button, or checkbox options.
6. Enter appropriate responses into text inputs and textareas.
7. Populate personal information fields using saved user profiles.
8. Handle dropdowns and other common form elements.
9. Verify that the answers were successfully populated.
10. Display a completion summary.

The extension must work across different websites without requiring users to manually add domains to an access list.

## 2. Technology Stack

Use the following technologies:

**Frontend / Extension**
- React
- TypeScript
- Vite
- SCSS
- Chrome Extension Manifest V3
- Chrome APIs
- Lucide or Wizz icons

**Architecture**
- Modular component architecture.
- Service-based architecture.
- TypeScript interfaces for all major entities.
- Reusable UI components.
- Background service worker.
- Content scripts.
- Popup interface.
- Full settings dashboard.

**Storage**
- chrome.storage.local for settings and user preferences.
- chrome.storage.sync for non-sensitive preferences where appropriate.
- IndexedDB for larger local data such as question-answer history.

Never store sensitive API keys in publicly accessible storage or expose them to webpage scripts. Explain the limitations of local extension storage and use appropriate protection.

## 3. Core Feature: Universal Form Detection

The extension should detect form fields automatically on the active webpage.

It must not require users to manually enter website domains.

Support:

- Google Forms.
- Microsoft Forms.
- Workday.
- LinkedIn forms.
- Job application portals.
- Registration forms.
- Survey websites.
- Feedback forms.
- Custom HTML forms.
- Other websites containing accessible form controls.

### Detection requirements

Detect the following HTML elements:

- input[type="text"]
- input[type="email"]
- input[type="tel"]
- input[type="number"]
- input[type="radio"]
- input[type="checkbox"]
- input[type="date"]
- input[type="url"]
- textarea
- select
- Contenteditable elements.
- Custom ARIA-based form controls.

Also detect:
- Labels.
- Placeholder text.
- Associated question text.
- Field names.
- Field IDs.
- Available radio options.
- Available checkbox options.
- Dropdown options.
- Required field indicators.
- Section headings.
- Context surrounding each question.

Use DOM inspection, accessible labels, ARIA attributes, and carefully designed site-specific adapters.

### Dynamic websites

Support websites that dynamically load questions.

Implement:
- MutationObserver.
- Dynamic DOM scanning.
- SPA navigation detection.
- Shadow DOM support where accessible.
- Re-scanning after page transitions.
- Handling of lazy-loaded form sections.

Avoid repeatedly processing the same question.

## 4. Core Feature: Answer All

The main feature of the extension should be a prominent button:

**ANSWER ALL**

When clicked:

1. Identify the active tab.
2. Scan the current webpage.
3. Extract all visible and accessible questions.
4. Categorize each question.
5. Collect all available answer options.
6. Match personal information fields against the saved profile.
7. Send remaining questions to the configured AI provider.
8. Generate structured answers.
9. Validate the AI response.
10. Automatically fill the corresponding fields.
11. Verify the filled values.
12. Display the completion report.

### Question classification

The system should recognize:

| Question type | Expected action |
|---|---|
| MCQ / Radio | Select one appropriate option |
| Multiple choice | Select one or more options |
| Text input | Enter generated text |
| Textarea | Generate and enter detailed text |
| Email | Use saved email |
| Phone | Use saved phone number |
| First Name | Use saved first name |
| Last Name | Use saved last name |
| Full Name | Combine first and last name |
| Dropdown | Select the matching option |
| Date | Use the relevant profile or user instruction |
| Number | Generate or use an appropriate numeric answer |
| URL | Use a saved URL if applicable |
| Unknown | Ask AI to classify or request user input |

Important: Never select an arbitrary answer when confidence is insufficient. Mark the field for manual review instead.

## 5. AI Integration – Multiple Providers with Fallback

This is one of the most important features.

Build a provider-independent AI architecture.

### Supported providers

Implement adapters for:

1. OpenAI API.
2. Anthropic Claude API.
3. Google Gemini API.
4. OpenRouter API.
5. Groq API.
6. DeepSeek API.
7. Custom OpenAI-compatible API endpoint.

Each provider should have:
- API key.
- Model selection.
- API endpoint where applicable.
- Enable/disable option.
- Priority.
- Timeout.
- Retry configuration.
- Connection testing.

### Provider priority

Allow users to configure the order in which providers are used.

Example:

1. Gemini – Primary.
2. OpenRouter – Secondary.
3. Groq – Third.
4. OpenAI – Final fallback.

### Fallback mechanism

Implement the following workflow:

```text
User clicks Answer All
        |
        v
Extract questions from webpage
        |
        v
Check local profile and saved answers
        |
        v
Send unanswered questions to primary AI
        |
        v
Is the provider successful?
       / \
     Yes  No
      |    |
      v    v
Validate  Try next provider
response       |
      |        v
      |    Provider available?
      |       / \
      |     Yes  No
      |      |    |
      |      v    v
      |    Validate Next provider
      |    response
      |        |
      +--------+
          |
          v
Validate answer structure
          |
          v
Fill webpage fields
          |
          v
Verify filled values
          |
          v
Show completion summary
```

### Important fallback rules

- Switch providers when an API request fails.
- Switch providers on timeout.
- Handle rate limits (HTTP 429).
- Handle server errors.
- Handle invalid API responses.
- Handle malformed JSON.
- Do not switch providers merely because an answer is uncertain; instead flag it for review.
- Do not endlessly retry.
- Log provider failures locally.
- Never expose API keys in console logs.

### AI prompting system

Create a central AI prompt template.

The AI should receive structured information:

- Question ID.
- Question text.
- Question type.
- Available options.
- Nearby contextual information.
- User profile information, only when relevant.
- Previously saved answers, if applicable.

Require JSON output.

Example:

```json
{
  "answers": [
    {
      "questionId": "q1",
      "questionType": "radio",
      "answer": "Option B",
      "confidence": 0.96,
      "reason": "The question asks for the correct definition."
    },
    {
      "questionId": "q2",
      "questionType": "text",
      "answer": "I have experience developing Angular applications.",
      "confidence": 0.92
    }
  ]
}
```

Validate the response using Zod before processing.

The AI must never invent personal information, qualifications, employment history, certifications, or experience.

For factual knowledge questions, use the available context and configured model capabilities. If an answer cannot be established confidently, flag it.

## 6. User Profile Management

During the first launch, users should be prompted to create a personal profile.

Create a profile management page.

### Personal information

Fields:

- Full Name.
- First Name.
- Last Name.
- Mobile Number.
- Contact Number.
- Email Address.
- Alternative Email.
- Date of Birth.
- Gender (optional).
- Current Location.
- City.
- State.
- Country.
- Postal Code.
- LinkedIn URL.
- GitHub URL.
- Portfolio URL.

### Professional information

Fields:

- Current Company.
- Current Job Title.
- Total Experience.
- Skills.
- Education.
- College / University.
- Degree.
- Graduation Year.
- CGPA.
- Certifications.
- Resume upload.
- Professional Summary.

All fields should be optional except those the user chooses to make mandatory.

### Profile autofill logic

When the extension detects a question, intelligently map it to the saved profile.

Examples:

| Detected question | Profile mapping |
|---|---|
| First Name | firstName |
| Last Name | lastName |
| Full Name | fullName |
| Email Address | email |
| Mobile Number | mobileNumber |
| Contact Number | contactNumber |
| Phone Number | mobileNumber |
| Current Company | currentCompany |
| LinkedIn Profile | linkedInUrl |
| GitHub Profile | githubUrl |

Use semantic matching rather than relying only on field names.

If a question requests information that is not available in the profile, ask AI only when sufficient context exists. Otherwise, leave it unanswered and notify the user.

Support multiple profiles in future architecture.

## 7. Question and Answer Memory

Implement a Question Bank.

Whenever the user answers a question manually or confirms an AI-generated answer, allow them to save it.

Example:

Question:
"Why do you want to join our organization?"

Saved Answer:
"I am interested in contributing my technical skills..."

Features:

- Save question-answer pairs.
- Search saved questions.
- Edit saved answers.
- Delete saved answers.
- Automatically suggest matching answers.
- Reuse confirmed answers.
- Show answer source: Profile, Saved Answer, or AI.
- Allow users to disable automatic reuse.

Use semantic similarity for matching when appropriate
