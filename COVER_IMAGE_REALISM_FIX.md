# Cover Image Realism Fix

## Problem Solved

The generated cover images looked generic, cartoonish, and over-designed with artificial UI-like elements. They felt "AI-generated" rather than like real editorial photographs.

## Solution

Updated the prompt to enforce a **real editorial photograph** style instead of designed/futuristic illustration.

## Key Style Shift

**From:** "Designed futuristic editorial illustration"  
**To:** "Staged but believable real-world photo captured by a professional photographer"

## New Prompt Template

```
Create a hyper-realistic editorial photograph for a premium business and retail intelligence publication.

CRITICAL: This image must visually represent ONLY the following articles, which are the top stories shown on the homepage. Do not introduce themes, scenes, or ideas not directly grounded in them.

Articles to represent:
[Article list]

Scene:
A believable, real-world situation inspired by these articles, captured mid-moment.
The scene should feel candid, slightly imperfect, and human — not staged for marketing.
Visually combine the following elements naturally:
[Visual anchors]

Narrative:
The image should subtly reflect the article themes through action and context, not symbols.
Humor or interest should come from:
- human behavior
- contrast (e.g. luxury vs operational reality)
- an unexpected but realistic moment

Examples of acceptable humor:
- mild irony
- visual tension
- a 'caught in the act' feeling
Not jokes, not caricature.

Photography style:
- Shot on a high-end DSLR or medium-format camera
- Natural or practical lighting (window light, store lighting)
- Realistic skin texture, fabric texture, reflections, imperfections
- Shallow depth of field where appropriate
- Editorial realism (Financial Times / WSJ Magazine / Vogue Business)

Composition:
- One clear focal subject
- Secondary elements add context but do not compete
- Clean background, no clutter
- Looks like a real photo taken in a real location

Tone:
- Intelligent
- Modern
- Slightly playful, but understated
- Never flashy or futuristic

ABSOLUTE PROHIBITIONS:
- NO screens, dashboards, UI, holograms, floating icons, symbols, charts, or interface elements
- NO text of any kind (including signs, labels, price tags, screens, books, posters)
- NO futuristic or sci-fi visual language
- NO glossy CGI look
- NO exaggerated lighting or surreal depth
- NO abstract graphics
- NO UI overlays
- NO glowing elements
- NO collage or composite look
- NO logos, no brand marks, no watermarks

If an element could reasonably contain text in real life (screen, sign, paper), it MUST be:
- out of frame, or
- fully blurred, or
- turned away from the camera

The final image should look like:
'A real photograph that could only be explained by reading the articles — not designed to explain them.'

Prioritize realism over visual cleverness. If unsure, choose a simpler, more realistic scene.
```

## Hard Constraints Added

1. **No UI/Interface Elements**: Screens, dashboards, holograms, floating icons, symbols, charts
2. **No Text**: Signs, labels, price tags, screens, books, posters - must be out of frame, blurred, or turned away
3. **No Futuristic Elements**: No sci-fi visual language, no glossy CGI look
4. **No Exaggerated Effects**: No surreal depth, no exaggerated lighting
5. **No Abstract Elements**: No abstract graphics, no UI overlays, no glowing elements
6. **No Composite Look**: No collage, no composite appearance

## Photography Style Requirements

- **Camera**: High-end DSLR or medium-format camera
- **Lighting**: Natural or practical (window light, store lighting)
- **Textures**: Realistic skin, fabric, reflections, imperfections
- **Depth**: Shallow depth of field where appropriate
- **Reference**: Editorial realism (Financial Times / WSJ Magazine / Vogue Business)

## Humor Approach

**Acceptable:**
- Mild irony
- Visual tension
- "Caught in the act" feeling
- Human behavior
- Contrast (luxury vs operational reality)

**Not Acceptable:**
- Jokes
- Caricature
- Gimmicks
- Cartoonish elements

## Example: Real Prompt Generated (Week 2026-W01)

### Input Articles
1. "Recap: The biggest retail mergers and acquisitions of 2025"
2. "Ecommerce faces a structural reckoning in 2026"
3. "Cartier UK sales top £250 million for the first time"
4. "Pragnell sales top £100 million for first time"

### Generated Prompt

```
Create a hyper-realistic editorial photograph for a premium business and retail intelligence publication.

CRITICAL: This image must visually represent ONLY the following articles, which are the top stories shown on the homepage. Do not introduce themes, scenes, or ideas not directly grounded in them.

Articles to represent:
Article 1: Recap: The biggest retail mergers and acquisitions of 2025
Article 2: Ecommerce faces a structural reckoning in 2026
Article 3: Cartier UK sales top £250 million for the first time
Article 4: Pragnell sales top £100 million for first time

Scene:
A believable, real-world situation inspired by these articles, captured mid-moment.
The scene should feel candid, slightly imperfect, and human — not staged for marketing.
Visually combine the following elements naturally:
professional, modern retail environment, technology device

Narrative:
The image should subtly reflect the article themes through action and context, not symbols.
Humor or interest should come from:
- human behavior
- contrast (e.g. luxury vs operational reality)
- an unexpected but realistic moment

Examples of acceptable humor:
- mild irony
- visual tension
- a 'caught in the act' feeling
Not jokes, not caricature.

Photography style:
- Shot on a high-end DSLR or medium-format camera
- Natural or practical lighting (window light, store lighting)
- Realistic skin texture, fabric texture, reflections, imperfections
- Shallow depth of field where appropriate
- Editorial realism (Financial Times / WSJ Magazine / Vogue Business)

Composition:
- One clear focal subject
- Secondary elements add context but do not compete
- Clean background, no clutter
- Looks like a real photo taken in a real location

Tone:
- Intelligent
- Modern
- Slightly playful, but understated
- Never flashy or futuristic

ABSOLUTE PROHIBITIONS:
- NO screens, dashboards, UI, holograms, floating icons, symbols, charts, or interface elements
- NO text of any kind (including signs, labels, price tags, screens, books, posters)
- NO futuristic or sci-fi visual language
- NO glossy CGI look
- NO exaggerated lighting or surreal depth
- NO abstract graphics
- NO UI overlays
- NO glowing elements
- NO collage or composite look
- NO logos, no brand marks, no watermarks

If an element could reasonably contain text in real life (screen, sign, paper), it MUST be:
- out of frame, or
- fully blurred, or
- turned away from the camera

The final image should look like:
'A real photograph that could only be explained by reading the articles — not designed to explain them.'

Prioritize realism over visual cleverness. If unsure, choose a simpler, more realistic scene.
```

## Why This Fixes the Issue

1. **Bans AI failure modes**: Explicitly prohibits UI, holograms, fake text, CGI look
2. **Forces real photography mental model**: References real cameras, lighting, editorial publications
3. **Humor via situation**: Not metaphor or symbols, but human behavior and contrast
4. **Simplicity over spectacle**: Encourages simpler, more realistic scenes

## Files Modified

1. `digest/generateCoverImage.ts`
   - Completely rewrote the prompt template
   - Added hard constraints against UI elements, text, futuristic elements
   - Added photography style requirements
   - Added safety add-on: "Prioritize realism over visual cleverness"

## Build Status

✅ TypeScript compilation: successful  
✅ No linter errors  
✅ All routes generated successfully

The cover image generation now enforces a real editorial photograph style with strict prohibitions against AI-generated art elements.

