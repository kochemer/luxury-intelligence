# Boringness Breaker System

## Overview

The Scene Director now includes a mandatory "Boringness Breaker" system to ensure generated covers are consistently interesting without becoming cartoonish or adding text/UI artifacts.

## Boringness Breaker Catalogue

The Scene Director must select at least ONE technique from this catalogue:

**A) Human micro-moment:**
- hesitation, raised eyebrow, half-smile, checking something twice, "caught thinking"

**B) Mild situational irony:**
- luxury context meets operational reality, high-tech implied but manual workaround visible

**C) Visual tension:**
- "about to happen" moment, hand hovering, object mid-air, near-miss alignment

**D) Role reversal:**
- senior-looking person doing junior task, back-office role in front-of-house setting

**E) Framing tricks (photography craft):**
- foreground obstruction, reflection reveal, over-the-shoulder perspective, off-center crop

**F) Environmental storytelling:**
- props suggest recent use (fingerprints, open drawer, slightly moved item), contrast prepared vs in-use

**G) Time-pressure cues (non-stressful):**
- calm multitasking, end-of-day/just-opened vibe, implied urgency without chaos

**H) Soft contradiction:**
- calm scene with one detail "not quite right" that becomes interesting after 2 seconds

**I) Tasteful Easter egg:**
- small recurring/out-of-place object that rewards a second look (no text)

## Updated JSON Schema

The Scene Director output now includes:

```json
{
  "conceptTitle": "short internal label",
  "oneSentenceConcept": "one sentence describing the scene",
  "visualAnchors": {
    "location": "...",
    "subjects": ["...", "..."],
    "props": ["...", "..."],
    "action": "..."
  },
  "humorNote": "subtle humor mechanism if any, or 'none'",
  "boringnessBreaker": {
    "selected": ["A","E"],        // IDs of techniques chosen (at least one required)
    "executionNote": "1 sentence describing how it shows up visually"
  },
  "finalImagePrompt": "...",
  "negativePrompt": [...],
  "confidence": 0.0
}
```

## Validation & Enforcement

1. **Mandatory Selection**: If `boringnessBreaker.selected` is missing or empty, the LLM is retried once with a message: "You must select at least one Boringness Breaker technique and encode it visually."

2. **Weak Application Detection**: If the `executionNote` is generic (contains words like "funny", "humor", "interesting") or too short (< 20 chars), confidence is reduced by 0.15.

3. **Confidence Threshold**: If confidence falls below 0.55 after penalty, the safe fallback is used.

## Updated Scene Director Prompt

### System Message
```
You are a Scene Director for editorial photography. You output ONLY valid JSON, no markdown, no code blocks, no explanations.
```

### User Prompt (Key Sections)

**Boringness Breaker Requirements:**
```
8. You MUST select at least ONE Boringness Breaker technique and encode it visually via action/framing/environment
9. Do NOT explain the humor in words; it must be visually inferred
10. No text, letters, numbers, signage, labels; no screens/UI/holograms; no logos/watermarks; avoid CGI/cartoon

BORINGNESS BREAKER CATALOGUE (select at least ONE):
A) Human micro-moment: hesitation, raised eyebrow, half-smile, checking something twice, "caught thinking"
B) Mild situational irony: luxury context meets operational reality, high-tech implied but manual workaround visible
C) Visual tension: "about to happen" moment, hand hovering, object mid-air, near-miss alignment
D) Role reversal: senior-looking person doing junior task, back-office role in front-of-house setting
E) Framing tricks (photography craft): foreground obstruction, reflection reveal, over-the-shoulder perspective, off-center crop
F) Environmental storytelling: props suggest recent use (fingerprints, open drawer, slightly moved item), contrast prepared vs in-use
G) Time-pressure cues (non-stressful): calm multitasking, end-of-day/just-opened vibe, implied urgency without chaos
H) Soft contradiction: calm scene with one detail "not quite right" that becomes interesting after 2 seconds
I) Tasteful Easter egg: small recurring/out-of-place object that rewards a second look (no text)
```

**Output Format:**
```json
{
  "boringnessBreaker": {
    "selected": ["A","E"],        // IDs of techniques chosen (at least one required)
    "executionNote": "1 sentence describing how it shows up visually"
  },
  "finalImagePrompt": "...visual encoding of the selected Boringness Breaker technique(s)..."
}
```

## Example Output: `cover-scene.json`

```json
{
  "conceptTitle": "luxury-retail-reflection",
  "oneSentenceConcept": "A luxury retail manager examines jewelry in a display case, with a reflection in the glass revealing a customer checking their phone behind them, creating visual tension between traditional luxury and digital commerce.",
  "visualAnchors": {
    "location": "luxury jewelry boutique in London",
    "subjects": [
      "luxury retail manager",
      "affluent customer (visible in reflection)"
    ],
    "props": [
      "jewelry display case",
      "smartphone",
      "luxury watch"
    ],
    "action": "manager examining jewelry while customer's reflection shows them checking phone"
  },
  "humorNote": "subtle irony in the reflection reveal showing digital distraction in luxury context",
  "boringnessBreaker": {
    "selected": ["E", "A"],
    "executionNote": "Reflection in jewelry case glass reveals customer checking phone behind manager, who has a slight raised eyebrow suggesting awareness of the digital intrusion into the luxury retail moment"
  },
  "finalImagePrompt": "Photograph a luxury jewelry boutique in London. Capture a luxury retail manager examining jewelry in a display case with a slight raised eyebrow, while a reflection in the glass reveals an affluent customer checking their smartphone behind them. Use natural lighting with shallow depth of field, emphasizing the reflection reveal and the manager's micro-expression. Compose in a wide horizontal banner format with all key elements in the central horizontal band. Avoid text, signage, or visible screens. Capture a candid, mid-action moment that feels human and editorial, steering clear of stock photo aesthetics.",
  "negativePrompt": [
    "text, letters, numbers, signage, labels",
    "screens, UI, dashboards, holograms, floating icons",
    "logos, brands, watermarks",
    "cartoon, illustration, CGI, 3D render, anime"
  ],
  "confidence": 0.75
}
```

## Example `finalImagePrompt` with Boringness Breaker

**Selected Techniques:** E (Framing tricks - reflection reveal) + A (Human micro-moment - raised eyebrow)

**Prompt:**
```
Photograph a luxury jewelry boutique in London. Capture a luxury retail manager examining jewelry in a display case with a slight raised eyebrow, while a reflection in the glass reveals an affluent customer checking their smartphone behind them. Use natural lighting with shallow depth of field, emphasizing the reflection reveal and the manager's micro-expression. Compose in a wide horizontal banner format with all key elements in the central horizontal band, maintaining safe margins at top and bottom. Avoid text, signage, or visible screens. Capture a candid, mid-action moment that feels human and editorial, steering clear of stock photo aesthetics. The reflection creates visual depth and the raised eyebrow suggests awareness of the digital intrusion into the luxury retail moment.
```

## Implementation Details

### Files Modified

1. **`digest/sceneDirector.ts`**
   - Added `boringnessBreaker` field to `SceneDirectorOutput` type
   - Updated prompt to include Boringness Breaker catalogue
   - Added validation for mandatory `boringnessBreaker.selected`
   - Added retry logic if breaker is missing
   - Added confidence penalty for weakly applied breakers
   - Updated version to `v2`

2. **Validation Logic**
   - Checks for `boringnessBreaker.selected` array with at least one element
   - Validates `executionNote` is specific (not generic words, > 20 chars)
   - Reduces confidence by 0.15 if weakly applied
   - Triggers fallback if confidence < 0.55

3. **Retry Mechanism**
   - If `boringnessBreaker` is missing or empty, retries once with explicit message
   - Maximum one retry to avoid infinite loops

## Guards Maintained

- ✅ One coherent real-world scene only (no collage)
- ✅ Photoreal editorial photography style
- ✅ No text-bearing surfaces; if unavoidable, must be out-of-frame/turned away/fully blurred
- ✅ Scene Director must only use the provided top articles as inspiration
- ✅ Wide horizontal banner composition (3:1 or wider)

## Testing

To test the Boringness Breaker system:

```bash
# Generate new cover with Boringness Breaker
npx tsx scripts/buildWeeklyDigest.ts --week=2026-W01 --regenCover --variant=fun

# Check the generated cover-scene.json to verify boringnessBreaker field
cat data/weeks/2026-W01/cover-scene.json
```

The output should include:
- `boringnessBreaker.selected` with at least one technique ID
- `boringnessBreaker.executionNote` with a specific visual description
- `finalImagePrompt` that visually encodes the selected technique(s)

