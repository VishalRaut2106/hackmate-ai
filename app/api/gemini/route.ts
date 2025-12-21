// import { type NextRequest, NextResponse } from "next/server"

// const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;


// const FREE_MODELS = [
//   "google/gemini-2.0-flash-exp:free",
//   "meta-llama/llama-3.2-3b-instruct:free",
//   "mistralai/mistral-7b-instruct:free",
//   "huggingfaceh4/zephyr-7b-beta:free",
// ]

// const responseCache = new Map<string, { result: string; timestamp: number }>()
// const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// interface GeminiRequest {
//   action: "analyze_idea" | "generate_tasks" | "mentor_chat"
//   data: {
//     idea?: string
//     features?: string[]
//     question?: string
//     context?: string
//     projectName?: string
//     duration?: string
//   }
// }

// function getCacheKey(action: string, data: any): string {
//   return `${action}:${JSON.stringify(data)}`
// }

// async function callAI(prompt: string): Promise<string> {
//   let lastError: Error | null = null

//   for (const model of FREE_MODELS) {
//     try {
//       const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${OPENROUTER_API_KEY}`,
//           "Content-Type": "application/json",
//           "HTTP-Referer": "https://hackmate.vercel.app",
//           "X-Title": "HackMate AI",
//         },
//         body: JSON.stringify({
//           model,
//           messages: [{ role: "user", content: prompt }],
//         }),
//       })

//       if (response.status === 429) {
//         // Rate limited, try next model
//         console.log(`Model ${model} rate limited, trying next...`)
//         continue
//       }

//       if (!response.ok) {
//         const errorData = await response.json().catch(() => ({}))
//         lastError = new Error(errorData.error?.message || `API failed: ${response.status}`)
//         continue
//       }

//       const data = await response.json()
//       const content = data.choices?.[0]?.message?.content
//       if (content) return content
//     } catch (err) {
//       lastError = err instanceof Error ? err : new Error("Unknown error")
//       continue
//     }
//   }

//   throw lastError || new Error("All models failed")
// }

// export async function POST(request: NextRequest) {
//   try {
//     const body: GeminiRequest = await request.json()
//     const { action, data } = body

//     if (action !== "mentor_chat") {
//       const cacheKey = getCacheKey(action, data)
//       const cached = responseCache.get(cacheKey)
//       if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
//         return NextResponse.json({ result: cached.result, cached: true })
//       }
//     }

//     let result: string

//     switch (action) {
//       case "analyze_idea": {
//         const prompt = `Analyze this hackathon idea and return JSON only:
// Idea: ${data.idea}
// Duration: ${data.duration || "24h"}

// Return exactly this JSON format:
// {"problem_statement":"2-3 sentences","target_users":["user1","user2"],"features":["feature1","feature2","feature3"],"risks":["risk1","risk2"],"tech_stack_suggestions":["tech1","tech2"]}`

//         result = await callAI(prompt)
//         const jsonMatch = result.match(/\{[\s\S]*\}/)
//         if (jsonMatch) result = jsonMatch[0]
//         break
//       }

//       case "generate_tasks": {
//         const prompt = `Generate hackathon tasks as JSON array:
// Project: ${data.projectName}
// Features: ${data.features?.join(", ")}
// Duration: ${data.duration}

// Return JSON array: [{"title":"task","description":"desc","effort":"Low|Medium|High"}]
// Generate 6-10 small tasks.`

//         result = await callAI(prompt)
//         const arrayMatch = result.match(/\[[\s\S]*\]/)
//         if (arrayMatch) result = arrayMatch[0]
//         break
//       }

//       case "mentor_chat": {
//         const prompt = `You are HackMate AI mentor. Be concise and helpful.
// Context: ${data.context || "Hackathon project"}
// Question: ${data.question}

// Give a short, actionable response.`

//         result = await callAI(prompt)
//         break
//       }

//       default:
//         return NextResponse.json({ error: "Invalid action" }, { status: 400 })
//     }

//     if (action !== "mentor_chat") {
//       const cacheKey = getCacheKey(action, data)
//       responseCache.set(cacheKey, { result, timestamp: Date.now() })
//     }

//     return NextResponse.json({ result })
//   } catch (error) {
//     console.error("AI API error:", error)
//     return NextResponse.json(
//       { error: error instanceof Error ? error.message : "Failed to process request" },
//       { status: 500 },
//     )
//   }
// }
import { type NextRequest, NextResponse } from "next/server"

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!

/**
 * Stable FREE models (order matters)
 * Gemini free is LAST because it rate-limits a lot
 */
const FREE_MODELS = [
  "meta-llama/llama-3.2-3b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
  "huggingfaceh4/zephyr-7b-beta:free",
  "google/gemini-2.0-flash-exp:free",
]

/**
 * Simple in-memory cache
 */
const responseCache = new Map<string, { result: string; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface GeminiRequest {
  action: "analyze_idea" | "generate_tasks" | "mentor_chat"
  data: {
    idea?: string
    features?: string[]
    question?: string
    context?: string
    projectName?: string
    duration?: string
  }
}

function getCacheKey(action: string, data: any): string {
  return `${action}:${JSON.stringify(data)}`
}

/**
 * Calls OpenRouter with fallback + delay
 */
async function callAI(prompt: string): Promise<string> {
  let lastError: Error | null = null

  for (const model of FREE_MODELS) {
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://hackmate.vercel.app",
            "X-Title": "HackMate AI",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt.slice(0, 2000) }], // token safety
          }),
        }
      )

      // Handle rate limit
      if (response.status === 429) {
        console.warn(`⚠️ ${model} rate-limited. Waiting...`)
        await new Promise((res) => setTimeout(res, 2000)) // cooldown
        continue
      }

      if (!response.ok) {
        const errorText = await response.text()
        lastError = new Error(errorText)
        continue
      }

      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content

      if (content) return content
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Unknown error")
      continue
    }
  }

  throw lastError || new Error("All AI models failed")
}

export async function POST(request: NextRequest) {
  try {
    const body: GeminiRequest = await request.json()
    const { action, data } = body

    const cacheKey = getCacheKey(action, data)
    const cached = responseCache.get(cacheKey)

    // ✅ Cache check for ALL actions (including mentor_chat)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ result: cached.result, cached: true })
    }

    let result = ""

    switch (action) {
      case "analyze_idea": {
        const prompt = `Analyze this hackathon idea and return JSON only:

Idea: ${data.idea}
Duration: ${data.duration || "24h"}

Return EXACT JSON:
{
  "problem_statement": "2-3 sentences",
  "target_users": ["user1", "user2"],
  "features": ["feature1", "feature2", "feature3"],
  "risks": ["risk1", "risk2"],
  "tech_stack_suggestions": ["tech1", "tech2"]
}`
        result = await callAI(prompt)
        const jsonMatch = result.match(/\{[\s\S]*\}/)
        if (jsonMatch) result = jsonMatch[0]
        break
      }

      case "generate_tasks": {
        const prompt = `Generate hackathon tasks as JSON array:

Project: ${data.projectName}
Features: ${data.features?.join(", ")}
Duration: ${data.duration}

Return JSON ARRAY ONLY:
[
  {"title":"Task","description":"Short desc","effort":"Low|Medium|High"}
]

Generate 6–10 tasks.`
        result = await callAI(prompt)
        const arrayMatch = result.match(/\[[\s\S]*\]/)
        if (arrayMatch) result = arrayMatch[0]
        break
      }

      case "mentor_chat": {
        const prompt = `You are HackMate AI mentor.
Be concise, practical, and actionable.

Context: ${data.context || "Hackathon project"}
Question: ${data.question}

Reply in 4–6 lines.`
        result = await callAI(prompt)
        break
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    // ✅ Cache response
    responseCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    })

    return NextResponse.json({ result })
  } catch (error) {
    console.error("AI API Error:", error)
    return NextResponse.json(
      { error: "AI is temporarily busy. Please try again." },
      { status: 503 }
    )
  }
}
