# Life CFO — Ask Architecture

Last updated: 2026-03-11

This document defines the architecture for the Life CFO Ask system.

Ask is the primary interaction layer that allows users to query their financial situation and reason through financial decisions using real household data.

Ask is not a chatbot.  
It is a structured financial reasoning system with a conversational interface.

---

# Purpose of Ask

Ask allows a household to retrieve grounded financial insight by asking natural language questions such as:

- "Are we okay this month?"
- "Can we afford this?"
- "Why does money feel tight right now?"
- "What changes if we wait?"
- "Compare these two options."

Ask returns calm, analytical answers grounded in the household’s real financial data.

The system provides financial analysis and scenario exploration, not financial advice.

---

# Core Architectural Principle

Ask follows a structured pipeline:

User Question  
↓  
Intent Classification  
↓  
Retrieval Pack Assembly  
↓  
Reasoning Contract  
↓  
Structured Result  
↓  
UI Rendering  

This architecture ensures:

- consistent reasoning  
- bounded AI behaviour  
- explainable outputs  
- calm UX  
- extensibility for deeper analysis  

---

# Step 1 — Intent Classification

Each question is classified into a canonical intent category.

Intent classification determines:

- which financial data is retrieved  
- how reasoning is performed  
- what output structure is used  

## Canonical intents

### Orientation

Quick understanding of the household’s current financial position.

Examples:

- "Are we okay right now?"
- "How are things looking this month?"

### Affordability

Whether a new cost or decision can be absorbed.

Examples:

- "Can we afford this?"
- "Could we buy a caravan?"
- "Could we upgrade the car?"

### Diagnosis

Understanding why financial pressure exists.

Examples:

- "Why does money feel tight?"
- "Where is our money going?"

### Planning

Forward-looking financial positioning.

Examples:

- "What should we prepare for?"
- "How should we plan for this?"

### Comparison

Evaluating two or more options.

Examples:

- "Should we buy now or wait?"
- "Compare these two options."

### Scenario

Exploring hypothetical outcomes.

Examples:

- "What if we increased rent?"
- "What happens if we move?"

### Memory Recall

Retrieving previously saved decisions or conclusions.

Examples:

- "What did we decide about the renovation?"
- "Why did we choose that?"

### Output Generation

Creating structured artefacts.

Examples:

- "Export a summary"
- "Generate a comparison"

---

# Step 2 — Retrieval Packs

After intent classification, the system assembles a retrieval pack.

A retrieval pack contains only the financial data needed for that specific question.

This prevents:

- excessive data use  
- hallucination risk  
- slow responses  
- unnecessary complexity  

Example retrieval packs may include:

Orientation pack

- balances  
- upcoming commitments  
- recent inflows  
- recent outflows  

Affordability pack

- balances  
- income patterns  
- commitments  
- savings position  

Diagnosis pack

- spending trends  
- recurring commitments  
- spikes or anomalies  

Comparison pack

- baseline financial position  
- scenario assumptions  
- structural spending patterns  

---

# Step 3 — Reasoning Contracts

Each intent has a defined reasoning contract.

The reasoning contract defines the steps the system should follow when generating an answer.

This prevents unstructured AI responses.

Example reasoning flows:

Orientation reasoning

1. Establish current financial snapshot  
2. Identify stability or pressure  
3. Highlight anything notable  
4. Produce a calm summary  

Affordability reasoning

1. Establish baseline  
2. Evaluate immediate impact  
3. Evaluate ongoing cost  
4. Identify pressure points  
5. Surface assumptions  
6. Produce verdict  

Diagnosis reasoning

1. Identify pressure signals  
2. Determine structural vs temporary causes  
3. Highlight main drivers  
4. Produce explanation  

Comparison reasoning

1. Evaluate option A  
2. Evaluate option B  
3. Identify trade-offs  
4. Produce comparison verdict  

---

# Step 4 — Structured Results

Ask returns structured results rather than raw text.

Example:

intent: affordability  
verdict: not_yet  
summary: This purchase would create pressure right now  

Results may include:

- verdict  
- explanation  
- supporting facts  
- assumptions  
- change triggers  

---

# Step 5 — UI Rendering

The UI renders structured results in a calm, consistent format.

Typical sections may include:

- Snapshot  
- Verdict  
- Explanation  
- Supporting facts  
- Assumptions  
- What would change the outcome  

Depth is revealed only when the user chooses to explore further.

---

# Progressive Depth Model

Life CFO supports different levels of analytical depth.

Level 1 — Default  
Short verdict or summary.

Level 2 — Context  
Explanation of what the answer is based on.

Level 3 — Deeper reasoning  
Trade-offs and assumptions.

Level 4 — Power-user depth  
Scenario modelling and structured comparisons.

---

# Memory Interaction

Ask may reference stored decision memory when relevant.

Examples:

- previous decisions  
- assumptions used  
- revisit triggers  

Memory is included only when relevant to the current question.

---

# AI Behaviour Constraints

AI may:

- analyse financial data  
- explain trade-offs  
- compare scenarios  
- summarise financial position  

AI must not:

- move money  
- initiate transactions  
- change stored data  
- make decisions autonomously  
- imply financial advice  

The system provides analysis and reasoning, not prescriptions.

---

# Design Goals

Ask should feel:

- calm  
- reliable  
- grounded in real data  
- transparent  
- explainable  

Users should feel the system helps them think more clearly.

---

# Long-Term Evolution

Future capabilities may include:

- richer scenario modelling  
- structured decision simulations  
- exportable reasoning summaries  

The system must always preserve:

- calm UX  
- explainable outputs  
- household data boundaries  
- analytical (not advisory) framing