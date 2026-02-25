// ═══════════════════════════════════════════════════════════════
// ProductLex Prospect AI — Supabase Edge Function
// Generates follow-up questions and module recommendations
// Deploy: supabase functions deploy prospect-ai
// Secret: OPENAI_API_KEY (set via supabase secrets set)
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a ProductLex compliance platform advisor. ProductLex is an AI-powered regulatory compliance platform for product manufacturers.

## ProductLex Platform Modules

1. **Compliance Map & Dashboard** — Interactive world map showing real-time compliance status per country. Color-coded (green=compliant, blue=info, orange=warning, red=critical). Drill-down per country showing products, regulations, standards, certificates. US state-level jurisdiction support. Risk scoring layer, certificate expiry tracking layer.

2. **Certificate Management** — Full lifecycle: track CE, UKCA, FCC, UL, ISO certificates per product. Expiry monitoring (7/28/90-day warnings). Auto-link certificates to products and regulations. Notified Body validation (NANDO database integration). Hub document sync for centralized document management.

3. **Regulatory Monitoring** — Automated monitoring of regulatory sources (EU Official Journal, EUR-Lex, OEIL legislative tracker, Federal Register). Detects regulation amendments, new versions, repeals, scope changes, effective date changes. AI-powered relevance scoring. Product-linked monitoring ensures only relevant changes surface.

4. **AI Impact Analysis** — When regulation changes are detected, AI generates impact analyses: risk level, affected products, estimated compliance cost, recommended actions, implementation timeline. Multi-LLM consensus for accuracy. Auto-creates compliance entries when changes are confirmed.

5. **Compliance Entries & Triage** — Central compliance task feed. Severity levels: CRITICAL (harmonised standard OJ expiration only), WARNING (regulation/standard changes with direct product match), TASK (action items), INFO (indirect matches). AI triage categorizes new discoveries. Deduplication via SHA-256 checksums.

6. **Predictive Regulations** — AI predicts upcoming regulatory changes based on legislative pipeline analysis (EU OEIL proposals, EUR-Lex drafts). Confidence scoring. Early warning system so companies can prepare before regulations are finalized.

7. **Task Management** — V2 task system with task groups (product roadmaps, org templates, system templates). Country-specific tasks, file attachments, multi-product test report linking. Task reminders and overdue warnings. Certificate renewal task auto-creation.

8. **Document Compliance** — Hub document management with expiry tracking, renewal workflows. Partner document compliance checks. PDF forensics for document authenticity. OCR fallback for scanned documents. Automatic compliance entries for expiring documents.

9. **Knowledge Graph & Semantic Analysis** — Semantic knowledge graph linking regulations, standards, products, and compliance requirements. Cross-reference conflict detection. Clause-level mapping between regulations and product requirements. Incremental graph building.

10. **Multi-Agent AI System** — 7 specialized compliance accuracy agents: Change Verification, Dynamic Priority, Deadline Extraction, Clause Mapping, Cross-Reference Conflict, Compliance Reasoning, Semantic Knowledge Graph. Agents work together to ensure compliance decisions are accurate and well-reasoned.

## Supported Industries
Medical devices, electronics & electrical, industrial machinery, toys & children's products, cosmetics & personal care, chemicals (REACH/CLP), food contact materials, construction products, PPE (personal protective equipment), automotive components.

## Supported Markets
European Union (all member states), United Kingdom, United States (federal + state level), Canada, Australia, Japan, South Korea, Switzerland, Norway, Singapore, and growing.

## Key Differentiators
- AI-first: not just a database, but intelligent agents that reason about compliance
- Multi-source monitoring: EU OJ, EUR-Lex, OEIL, Federal Register, standards bodies
- Predictive: warns about upcoming regulations before they're finalized
- Product-centric: everything linked back to your actual products
- Severity-aware: CRITICAL only for genuine emergencies (OJ mapping expiration)
- Multi-tenancy: each organization sees only their data

## Areas Not Fully Covered Yet (be honest about these)
- Direct ERP/PLM integration (planned, not yet available)
- China CCC / CFDA certification tracking (partial support)
- Real-time supply chain compliance monitoring
- Automated regulatory submission/filing
- Multi-language document translation
- Industry-specific templates (medical device DHF/DMR)`;

const FOLLOWUP_PROMPT = `Based on the prospect's discovery answers below, generate 5-8 targeted follow-up questions to better understand their specific compliance needs and pain points.

Each question should:
- Reference something specific from their answers
- Help determine which ProductLex modules would be most valuable
- Probe deeper into their biggest pain points
- Assess their compliance maturity level

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "id": "ai-followup-1",
      "text": "The question text",
      "type": "yes_no" | "single_choice" | "short_text",
      "options": ["Option 1", "Option 2"],
      "context": "Why we're asking this (shown to user)"
    }
  ]
}

For yes_no questions, omit the options field.
For short_text questions, omit the options field.
For single_choice questions, provide 3-5 options.
Number questions sequentially: ai-followup-1, ai-followup-2, etc.`;

const SUGGESTIONS_PROMPT = `Based on ALL the prospect's responses (discovery + follow-up), generate personalized module recommendations for ProductLex.

Analyze their industry, markets, pain points, and compliance maturity to recommend which ProductLex modules they need most.

Return ONLY valid JSON in this exact format:
{
  "overall_assessment": "2-3 sentences about their compliance maturity and how ProductLex can help",
  "recommendations": [
    {
      "module": "Module Name (from the 10 modules listed)",
      "fit": "essential" | "recommended" | "nice_to_have",
      "reason": "Why this module fits their needs (reference their specific answers)",
      "example": "Concrete example of how they'd use this module"
    }
  ],
  "gaps": [
    "Honest description of an area ProductLex doesn't fully cover that they might need"
  ],
  "onboarding_order": [
    "Module Name 1 (start here)",
    "Module Name 2 (add next)",
    "Module Name 3"
  ]
}

Rules:
- Include 6-10 module recommendations
- At least 2 must be "essential"
- At least 1 "gaps" entry (be honest)
- onboarding_order should list 4-6 modules in recommended implementation sequence
- Reference their specific answers in reasons and examples
- Be specific about how the module solves THEIR problems, not generic benefits`;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phase, responses, prospect_info } = await req.json();

    if (!phase || !responses) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: phase, responses" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (phase !== "followup" && phase !== "suggestions") {
      return new Response(
        JSON.stringify({ error: "phase must be 'followup' or 'suggestions'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build user message with prospect context
    const prospectContext = prospect_info
      ? `Prospect: ${prospect_info.name || "Unknown"}, ${prospect_info.company || "Unknown company"}, ${prospect_info.role || "Unknown role"}, Industry: ${prospect_info.industry || "Unknown"}, Company size: ${prospect_info.company_size || "Unknown"}\n\n`
      : "";

    const responsesText = responses
      .map((r: { question_id: string; question_text: string; answer_value: string }) =>
        `[${r.question_id}] ${r.question_text}\nAnswer: ${r.answer_value}`
      )
      .join("\n\n");

    const userMessage = `${prospectContext}Prospect's responses:\n\n${responsesText}`;
    const phasePrompt = phase === "followup" ? FOLLOWUP_PROMPT : SUGGESTIONS_PROMPT;

    // Call OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\n" + phasePrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("OpenAI API error:", errText);
      return new Response(
        JSON.stringify({ error: "AI service error", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices?.[0]?.message?.content;
    const tokensUsed = openaiData.usage?.total_tokens || 0;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "AI returned invalid JSON", raw: content }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        phase,
        result: parsed,
        tokens_used: tokensUsed,
        model: "gpt-4o-mini",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
