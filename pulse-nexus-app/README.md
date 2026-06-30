# Pulse Nexus

> Built by **Faith Based Innovations**

An iPhone app that combines **Apple Health**, **WHOOP**, **Fitbit** (including
the new Google-era Fitbits and Pixel Watch), and **Garmin** data into one
customizable view, with a deterministic rule-based dashboard and a multi-turn
Coach chat that can run on **Google Gemini**, **OpenAI ChatGPT**, **Anthropic
Claude**, or **xAI Grok**.

This project is set up so you can build, sign, and ship to the App Store
**without owning a Mac** — everything runs in the cloud via Expo Application
Services (EAS).

---

## The five tabs

| Tab | What it does | Engine | Disclaimer? |
|---|---|---|---|
| **Home** | Customizable metric cards + rule-based insights pulled from all connected sources | Deterministic rules in `lib/assistant.ts` (no model) | No — auditable in source |
| **Sleep** | Last night with full stage breakdown (Deep / REM / Light / Awake), efficiency, score, debt, respiration | `lib/sleep.ts` (no model) | No |
| **Workouts** | Newest-first list of workouts merged from all four sources; filter by source and time window | `lib/workouts.ts` (no model) | No |
| **Coach** | Multi-turn chat that knows your current data and can search the web | **User-selected provider** (Gemini / ChatGPT / Claude / Grok), with a deterministic health-context system prompt | Yes — persistent banner |
| **Settings** | About + entry points for Connect devices and Preferences | — | — |

Plus two stack-pushed screens:

- **Connect devices** — WHOOP / Fitbit / Garmin OAuth
- **Preferences** — Pick Coach engine, toggle which Home cards show, choose metric/imperial units

---

## Customizable Coach: Gemini / ChatGPT / Claude / Grok

Each provider runs through a common interface (`lib/ai/types.ts`). The Coach
screen reads the active provider from Preferences and uses it for every turn.
Each provider has its own API key in `.env`; missing keys disable that
provider with a clear in-app message.

| Provider | Vendor | Default model | Web search | Cost | Key URL |
|---|---|---|---|---|---|
| **Gemini** | Google | `gemini-2.0-flash` | ✓ Google Search grounding | Free tier | aistudio.google.com/app/apikey |
| **ChatGPT** | OpenAI | `gpt-4o-mini` | Off (enable via tools in code) | Paid | platform.openai.com/api-keys |
| **Claude** | Anthropic | `claude-3-5-haiku-latest` | Off (enable via tools in code) | Paid | console.anthropic.com/settings/keys |
| **Grok** | xAI | `grok-2-latest` | ✓ Live search | Paid (SuperGrok credits available) | console.x.ai/ |

Override any default model by setting the corresponding `EXPO_PUBLIC_*_MODEL`
env var. The user-facing disclaimer banner is on for the Coach tab regardless
of provider.

> Anthropic's API historically does not allow direct browser-origin calls.
> The Claude provider sends `anthropic-dangerous-direct-browser-access: true`
> per Anthropic's documented opt-in. If Anthropic later requires a server
> intermediary, route only `lib/ai/anthropic.ts` through a thin proxy
> (Cloudflare Worker / Vercel Function) and keep the rest of the app
> client-side.

---

## What you'll need (one-time)

| Item | Where | Cost | Approval |
|---|---|---|---|
| Apple Developer Program (enroll as Faith Based Innovations) | developer.apple.com/programs/ | **$99/year** | Instant |
| Expo account | expo.dev | Free tier | Instant |
| ≥1 AI provider key | See above | Free (Gemini) → paid | Instant |
| WHOOP developer app | developer.whoop.com | Free | Self-serve |
| Fitbit developer app | dev.fitbit.com/apps/new | Free | Self-serve |
| Garmin Health API | developerportal.garmin.com | Free | **Partner review** |
| Node.js ≥ 20 on your computer | nodejs.org | Free | — |
| Your iPhone | — | — | — |

You do **not** need: a Mac, Xcode, an Apple Silicon machine, or any local iOS
build tools.

### About the Garmin gate

Garmin's Health API is not self-serve. The app code is fully written, but the
Connect Garmin button returns an "approval required" error until you apply at
`developerportal.garmin.com` and paste the issued credentials into `.env`.

---

## First-time setup

```bash
cd pulse-nexus-app
npm install
cp .env.example .env
# Fill .env. At minimum, set ONE of the AI provider keys.
```

```bash
npm install -g eas-cli
eas login
```

### Register the iOS bundle id

1. developer.apple.com/account → **Identifiers** → **+** → register App ID `com.faithbasedinnovations.pulsenexus`.
2. Enable the **HealthKit** capability on that App ID.
3. In App Store Connect, create a matching app record. Paste the App Store Connect app id into `eas.json`.

### Register OAuth redirect URIs

| Provider | Redirect URI |
|---|---|
| WHOOP | `pulsenexus://whoop-callback` |
| Fitbit | `pulsenexus://fitbit-callback` |
| Garmin | `pulsenexus://garmin-callback` |

---

## Build a TestFlight build — from any OS

```bash
eas init                                          # first time only
eas build --platform ios --profile preview
```

Pick **"Let EAS handle it"** when asked about signing — EAS generates the
certificate and provisioning profile in the cloud. After ~15–20 min, EAS gives
you a TestFlight build.

## Submit to App Store — from any OS

```bash
eas build --platform ios --profile production
eas submit --platform ios --latest
```

Fill in App Store screenshots and the privacy questionnaire **in your
browser**, then click **Submit for Review**.

---

## Project layout

```
pulse-nexus-app/
├── app/
│   ├── _layout.tsx              Root stack (modal screens)
│   ├── (tabs)/
│   │   ├── _layout.tsx          Bottom tab bar
│   │   ├── index.tsx            Home (customizable dashboard)
│   │   ├── sleep.tsx            Sleep detail (last night, all stages, per-device compare)
│   │   ├── workouts.tsx         Unified workouts list
│   │   ├── chat.tsx             Coach chat (multi-provider, data-aware, grounded)
│   │   └── settings.tsx         About + links to Connect / Preferences
│   ├── connect.tsx              WHOOP / Fitbit / Garmin OAuth (modal)
│   └── preferences.tsx          Coach engine + dashboard cards + units (modal)
├── components/
│   ├── DisclaimerBanner.tsx
│   ├── InsightCard.tsx
│   ├── MetricCard.tsx
│   ├── SleepStageBar.tsx        Stacked Deep/REM/Light/Awake bar
│   └── WorkoutCard.tsx
├── lib/
│   ├── ai/
│   │   ├── types.ts             ChatProvider interface
│   │   ├── env.ts
│   │   ├── gemini.ts
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   ├── xai.ts
│   │   └── index.ts             Registry + chatTurn() that picks active provider
│   ├── healthkit.ts             Apple Health reads
│   ├── whoop.ts                 WHOOP OAuth + API
│   ├── fitbit.ts                Fitbit Web API
│   ├── garmin.ts                Garmin Health API
│   ├── sleep.ts                 Unified sleep snapshot across all four sources
│   ├── workouts.ts              Unified workout fetcher
│   ├── assistant.ts             Rule-based insight engine + cross-source unifier
│   ├── gemini.ts                Back-compat shim → re-exports from lib/ai
│   ├── preferences.ts           Persisted user preferences (Keychain)
│   └── storage.ts               Keychain-backed secret storage
├── app.json                     Expo config + HealthKit + Info.plist
├── eas.json                     EAS Build & Submit profiles
└── .env.example                 API keys to fill in
```

---

## Cross-source unification

| Metric | Priority |
|---|---|
| Recovery | WHOOP → fallback to Garmin Body Battery |
| Resting HR / HRV | WHOOP → Garmin → Fitbit → Apple Health |
| Sleep hours / sleep snapshot | WHOOP → Garmin → Fitbit → Apple Health |
| Steps / Active kcal | Garmin → Fitbit → Apple Health |
| SpO₂ | Fitbit → Apple Health |
| Strain (0–21) | WHOOP only |
| Body Battery / Stress | Garmin only |

Disagreement thresholds in `disagreement()` in `lib/assistant.ts`.

---

## Roadmap — "everything modern apps have"

Already shipped:

- ✅ Dashboard with rule-based, source-attributed insights
- ✅ Customizable metric cards
- ✅ Sleep detail with stages, efficiency, score, debt, per-device compare
- ✅ Unified workouts list with filters and totals
- ✅ Multi-provider Coach chat (Gemini / ChatGPT / Claude / Grok)
- ✅ Keychain-backed token + preference storage
- ✅ Persistent AI disclaimer banner

Designed for, not yet built:

- ⏳ Long-window trends — 7 / 30 / 90 day sparklines for HRV, RHR, recovery, sleep
- ⏳ Mindfulness / breathing — guided sessions, with reads from Apple Health Mindful Minutes
- ⏳ Hydration & nutrition logging (would integrate with Apple Health water + caffeine + dietary energy)
- ⏳ Menstrual cycle tracking (Apple Health Cycle Tracking + Fitbit / Garmin equivalents)
- ⏳ Body composition (weight, BMI, body-fat %, waist) merged from Withings / Garmin Index / Fitbit Aria / Apple Health
- ⏳ Apple Watch companion app (so the watch face can talk to Pulse Nexus directly)
- ⏳ Home Screen + Lock Screen widgets via WidgetKit
- ⏳ Live Activities for in-progress workouts
- ⏳ Trend exports (CSV / JSON) for users who want their data
- ⏳ Optional cloud sync (would require a server)

The dashboard insight engine and unified data model are already designed to
absorb any new metric — add a field to `CombinedSnapshot` in `lib/assistant.ts`
and a rule in `generateInsights()`, then surface it on the relevant tab.

---

## Ongoing cost

- Apple Developer Program: **$99/year**
- AI provider: free (Gemini) or pay-as-you-go
- WHOOP, Fitbit, Garmin developer access: free
- EAS Build: free tier ~30 builds/month; ~$19/month if you outgrow it

---

© Faith Based Innovations. All rights reserved.
