import type { TestDef } from "../types";

// Prompt templates only. Loading these does not create or execute any benchmark.
export const DEFAULT_TESTS: TestDef[] = [
  {
    id: "t1_code",
    code: "T1_CODE",
    name: "Async Python Concurrency Sprint",
    category: "text",
    objective:
      "Core instruction tracking, syntax-valid structural compliance under heavy quantization boundaries.",
    prompt:
      "Write a complete, optimized Python script using the native 'asyncio' library that reads an array of 50 local URLs, fetches their HTTP status codes concurrently with a maximum semaphore limit of 5, handles connection timeouts elegantly, and outputs a structured JSON report mapping each URL to its status. Provide only clean, production-grade code with comments and no conversational filler.",
    maxTokens: 620,
  },
  {
    id: "t2_logic",
    code: "T2_LOGIC",
    name: "Multi-Step Complex Logic Flashlight Riddle",
    category: "text",
    objective:
      "Evaluation of deep-reasoning capability, tracking state mutations, and processing extended thinking chains (<thinking>).",
    prompt:
      "Four people (Alice, Bob, Charlie, and Diana) need to cross a fragile bridge at night. They only have one flashlight, and the bridge can only hold a maximum of two people at a time. Anyone crossing must walk with the flashlight. Alice takes 1 minute to cross, Bob takes 2 minutes, Charlie takes 5 minutes, and Diana takes 10 minutes. When two people cross together, they must walk at the slower person's pace. How can all four people cross the bridge in exactly 17 minutes? Provide a detailed, step-by-step breakdown of who crosses, who brings back the flashlight, and the running total time elapsed.",
    maxTokens: 540,
  },
  {
    id: "t3_lore",
    code: "T3_LORE",
    name: "Long-Context Throughput Expansion (4,000 Tokens)",
    category: "text",
    objective:
      "Sustained generation stamina, context token processing stress, and true maximum generation speeds (Tokens Per Second).",
    prompt:
      "Generate an extensive, highly detailed, world-building lore document for an expansive sci-fi space opera. Write six distinct sections: 1. The political structure of the Core Worlds, 2. The economic dependency on a newly discovered crystalline fuel element, 3. The military philosophy of a rogue synthetic splinter faction, 4. The biological profile of an ancient spacefaring entity, 5. A breakdown of hyperspace gate mechanics, and 6. A detailed historical timeline spanning 500 years of interstellar conflict. Make each section incredibly descriptive, aiming for maximal length and creative depth.",
    maxTokens: 4000,
  },
];
