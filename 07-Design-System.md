# Design System — Colour & UI States
Version: v1.0  
Status: Locked  
Purpose: Single source of truth for colour usage, UI states, and print/digital rules

---

## 1. DESIGN PRINCIPLES

This design system exists to support:
- Calm decision-making
- Emotional safety
- Long-term use without fatigue
- Clarity without urgency
- Humanity without chaos

Core rule:

> Brand colours express emotion.  
> Semantic colours express system state.  
> These responsibilities must never be mixed.

---

## 2. CORE COLOUR PALETTE (BRAND)

### Primary — Calm Anchor
**Soft Aqua / Blue-Green**

- Hex: `#6FAFB2`
- Role: Emotional safety, calm continuity
- Use for:
  - Primary backgrounds
  - Large surfaces
  - Default resting states
- Never use for:
  - Errors
  - Alerts
  - Urgent actions

---

### Secondary — Structure & Trust
**Deep Teal / Green-Blue**

- Hex: `#1F5E5C`
- Role: Grounding, seriousness, authority
- Use for:
  - Navigation
  - Headers
  - Structural elements
  - Primary buttons (non-destructive)

---

### Tertiary — Light & Encouragement
**Soft Golden Yellow**

- Hex: `#F2C94C`
- Role: Joy, hope, forward motion
- Use for:
  - Highlights
  - Success indicators
  - Gentle emphasis
- Never use for:
  - Errors
  - Warnings
  - Stressful messaging

---

### Expressive Accent — Meaning & Heart
**Muted Hibiscus / Fuchsia**

- Hex: `#9B3C6E`
- Role: Emotional depth, reflection, humanity
- Use for:
  - Rare emotional emphasis
  - Reflection prompts
  - Personal meaning moments
- Rules:
  - Max one instance per screen
  - Never for system controls
  - Never for alerts or errors

---

## 3. NEUTRAL PALETTE

### Backgrounds & Surfaces
- Background: `#F6F4F1`
- Elevated Surface (cards): `#FFFFFF`
- Borders / Dividers: `#DAD6CF`

### Text
- Primary text: `#2B2B2B`
- Secondary text: `#5F6361`
- Muted text: `#8A8F8C`

Rules:
- Avoid pure white
- Avoid pure black
- Readability always outweighs brand expression

---

## 4. SEMANTIC (SYSTEM) COLOURS

Semantic colours communicate system state only.

- Success: `#4FAF91`
- Warning: `#F2C94C`
- Error: `#C94A4A`
- Info: `#6FAFB2`

Rule:
> Components must consume semantic tokens, not raw brand colours.

---

## 5. BUTTON SYSTEM

### Primary Button — Calm Authority
- Background: `#1F5E5C`
- Text: `#FFFFFF`
- Hover: `#174947`
- Disabled: `#9FB8B6`

Use for:
- Save
- Commit
- Confirm (non-destructive)
- Continue

---

### Secondary Button — Gentle Action
- Background: `#6FAFB2`
- Text: `#2B2B2B`
- Hover: `#5E9EA1`
- Disabled: `#BFD7D8`

Use for:
- Optional actions
- Navigation
- Non-commitment steps

---

### Tertiary / Ghost Button
- Background: transparent
- Text: `#1F5E5C`
- Hover background: `#E6F1F1`

---

### Expressive Button (RARE)
- Background: `#9B3C6E`
- Text: `#FFFFFF`
- Hover: `#87345F`

Rules:
- Never default
- Never destructive
- Max one per screen

---

## 6. ALERTS & FEEDBACK

### Success
- Background: `#E7F4F0`
- Border: `#4FAF91`
- Text: `#1F5E5C`
- Tone: “You’re on track.”

---

### Warning (Gentle)
- Background: `#FFF6D8`
- Border: `#F2C94C`
- Text: `#6A5500`
- Tone: “Just a heads-up.”

---

### Error
- Background: `#FCECEC`
- Border: `#C94A4A`
- Text: `#7A1E1E`
- Tone: calm, factual, non-alarming

---

### Info
- Background: `#EAF4F5`
- Border: `#6FAFB2`
- Text: `#1F5E5C`

---

## 7. STATUS INDICATORS

- Active: `#1F5E5C`
- Inactive: `#8A8F8C`
- Completed: `#4FAF91`
- Pending: `#6FAFB2`

---

## 8. COLOUR USAGE RATIOS (GLOBAL)

- Neutrals: 60%
- Aqua: 25%
- Deep Teal: 10%
- Yellow: 4%
- Hibiscus: 1%

If the UI feels noisy:
- Yellow or hibiscus is overused.

---

## 9. DIGITAL vs PRINT RULES

### Digital (App / Web)
- Use exact hex values
- Matte appearance preferred
- No harsh gradients
- Aqua dominates large surfaces
- Yellow ≤ 5% per screen
- Hibiscus ≤ 1% per screen

---

### Print-Adjusted Palette
(Adjusted for ink absorption and contrast)

- Aqua: `#639FA2`
- Teal: `#1A4F4D`
- Yellow: `#E5B83F`
- Hibiscus: `#8C3562`
- Neutral: `#F3F1ED`
- Text: `#262626`

Print rules:
- Increase contrast by ~8–10%
- Yellow never carries body text
- Hibiscus prints darker — use sparingly
- Prefer warm white or cream stock
- Avoid bright white paper

---

## 10. FINAL RULE

> Calm is a feature.  
> Restraint is intentional.  
> Colour is used to reduce cognitive load — never to increase it.

End of document.
