import type { ModelDef, TestDef } from "../types";

let counter = 0;
export function nextId(prefix = "run"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function jitter(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const CODE_SNIPPETS = [
`import asyncio, aiohttp, json

async def fetch_status(session, url, sem, timeout=5):
    async with sem:
        try:
            async with session.get(url, timeout=timeout) as resp:
                return url, resp.status
        except asyncio.TimeoutError:
            return url, "timeout"
        except Exception as exc:
            return url, f"error:{exc.__class__.__name__}"

async def main(urls):
    sem = asyncio.Semaphore(5)
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_status(session, u, sem) for u in urls]
        results = await asyncio.gather(*tasks)
    report = {u: s for u, s in results}
    print(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    urls = [f"http://localhost:800{i%9}/health" for i in range(50)]
    asyncio.run(main(urls))`,
`import asyncio
import aiohttp
import json
from typing import Dict

async def check(url: str, session: aiohttp.ClientSession, sem: asyncio.Semaphore) -> Dict[str, str]:
    async with sem:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=6)) as r:
                return {"url": url, "status": str(r.status)}
        except asyncio.TimeoutError:
            return {"url": url, "status": "TIMEOUT"}
        except aiohttp.ClientError as e:
            return {"url": url, "status": f"ERR:{e}"}

async def run_batch(urls):
    sem = asyncio.Semaphore(5)
    async with aiohttp.ClientSession() as s:
        out = await asyncio.gather(*(check(u, s, sem) for u in urls))
    return {o["url"]: o["status"] for o in out}

report = asyncio.run(run_batch(URLS))
print(json.dumps(report, indent=2, sort_keys=True))`,
];

const LOGIC_RESPONSES = [
`Step-by-step 17-minute solution:
1. Alice & Bob cross together -> 2 min elapsed (pace = 2, slower of the two)
2. Alice returns with flashlight -> 3 min elapsed
3. Charlie & Diana cross together -> 13 min elapsed (pace = 10, slower of the two)
4. Bob returns with flashlight -> 15 min elapsed
5. Alice & Bob cross together -> 17 min elapsed
Total elapsed: 17 minutes. All four are now on the far side and the flashlight remains with them.`,
`<thinking>The key insight is to send the two slowest people together exactly once so their combined cost is only paid a single time.</thinking>
Solution:
- Trip 1: Alice + Bob cross (2 min) | total = 2
- Trip 2: Alice returns (1 min) | total = 3
- Trip 3: Charlie + Diana cross (10 min) | total = 13
- Trip 4: Bob returns (2 min) | total = 15
- Trip 5: Alice + Bob cross (2 min) | total = 17
Final total elapsed time: 17 minutes, satisfying the constraint exactly.`,
];

const LORE_RESPONSES = [
`I. The Core Worlds Compact
The Core Worlds are governed by a rotating Senate of Charter Houses, each holding provisional stewardship over a hyperlane node...

II. Crystalline Fuel Dependency
The discovery of Vareth-9 crystal veins beneath the Ashen Reef reordered every economic bloc overnight...

III. The Severed Choir (Rogue Synthetic Faction)
Rejecting the Unity Accord, the Severed Choir doctrine holds that organic command latency is a fatal liability in fleet engagements...

IV. The Wyrde-Kin Entity
Bioluminescent and vacuum-adapted, the entity classified only as "Wyrde-Kin" predates recorded starfall by roughly nine millennia...

V. Hyperspace Gate Mechanics
Each gate resolves a thread of folded spacetime by anchoring twin resonance buoys across a calculated null-point...

VI. Five Centuries of Conflict
Beginning with the First Reef Skirmishes and culminating in the Long Quiet, the timeline below traces the fracture and reunification of the Core...
[...continues for several thousand tokens...]`,
];

const V1_RESPONSES = [
`Image 1: A weathered ceramic mug sits on a wooden windowsill, steam curling upward, morning light raking across the grain.
Image 2: A hand-thrown clay bowl rests on a pottery wheel, still glistening with slip, mid-fabrication.
Image 3: A stack of terracotta plant pots is arranged on a garden shelf, one cracked at the rim.
Common thread: all three images center on unglazed or lightly glazed ceramic/clay objects, emphasizing handcrafted earthenware textures and warm, earthen color tones.`,
];

const V2_RESPONSES = [
`--- Page 1 ---
INVOICE #4471          Date: 03/14
Bill To: Meridian Logistics Co.
Line Items:
  1. Freight handling ................ 240.00
  2. Customs clearance ............... 88.50
--- Page 2 ---
Terms: Net 30. Late fees accrue at 1.5% monthly.
Authorized signature: ____________________
--- Page 3 ---
APPENDIX A - Rate Schedule
Zone 1: $0.42/kg   Zone 2: $0.58/kg   Zone 3: $0.71/kg
--- Page 4 ---
Notes: Shipment split across two containers, ref# CN-2291 / CN-2292.
--- Page 5 ---
Customer Support: support@meridian-example.com | +1 (555) 019-2231
--- Page 6 ---
Page 6 of 6 — End of document. Retain for records.`,
];

const V3_RESPONSES = [
`Layout audit:
- Fixed left sidebar (approx. 260px) hosting primary nav: Dashboard, Models, Runs, Settings.
- Top app bar with breadcrumb + search input + user avatar menu (right aligned).
- Main content grid uses a 12-column responsive layout with card components (rounded-xl, soft shadow tokens).
- Primary accent color token appears to be an indigo/violet hue (~#6366f1) with slate neutrals for surfaces.
- Sticky "New" action button, bottom-right floating position, likely a primary CTA.
- Modal/drawer pattern detected on the right edge, suggesting a slide-over detail panel.`,
];

const ERROR_MESSAGES = [
  "Context window exceeded before completion.",
  "Model does not support image inputs.",
  "Connection to inference worker reset unexpectedly.",
  "Decoding stalled: repeated token loop detected and aborted.",
  "Out of memory while allocating KV cache.",
  "Request timed out waiting for first token.",
];

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickResponse(testId: string): string {
  switch (testId) {
    case "t1_code":
      return pickOne(CODE_SNIPPETS);
    case "t2_logic":
      return pickOne(LOGIC_RESPONSES);
    case "t3_lore":
      return pickOne(LORE_RESPONSES);
    case "v1_photo":
      return pickOne(V1_RESPONSES);
    case "v2_ocr":
      return pickOne(V2_RESPONSES);
    case "v3_ux":
      return pickOne(V3_RESPONSES);
    default:
      return "The model produced a structured response consistent with the requested format. (Simulated output for a custom test — connect a live Jan server to capture real completions.)";
  }
}

export interface Outcome {
  success: boolean;
  ttftMs: number;
  tokensPerSec: number;
  tokensGenerated: number;
  durationMs: number;
  response?: string;
  error?: string;
}

export function simulateOutcome(model: ModelDef, test: TestDef): Outcome {
  const visionBlocked =
    test.category === "vision" && model.visionCapable === false;

  const reliability = visionBlocked ? 0.05 : model.reliability;
  const success = Math.random() < reliability;

  const ttftMs = Math.max(
    60,
    Math.round(model.baseTtftMs * test.ttftMultiplier * jitter(0.8, 1.3)),
  );

  if (!success) {
    const error = visionBlocked
      ? "Model does not support image inputs."
      : pickOne(ERROR_MESSAGES);
    return {
      success: false,
      ttftMs,
      tokensPerSec: 0,
      tokensGenerated: Math.round(jitter(0, test.avgOutputTokens * 0.2)),
      durationMs: Math.round(ttftMs + jitter(80, 900)),
      error,
    };
  }

  const tokensPerSec = Math.max(
    3,
    Math.round(model.baseTokPerSec * jitter(0.82, 1.18) * 10) / 10,
  );
  const tokensGenerated = Math.max(
    24,
    Math.round(test.avgOutputTokens * jitter(0.75, 1.2)),
  );
  const genMs = (tokensGenerated / tokensPerSec) * 1000;
  const durationMs = Math.round(
    ttftMs + genMs * jitter(0.95, 1.05) * test.durationMultiplier,
  );

  return {
    success: true,
    ttftMs,
    tokensPerSec,
    tokensGenerated,
    durationMs,
    response: pickResponse(test.id),
  };
}
