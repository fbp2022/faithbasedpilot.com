# Pulse Nexus

> Built by **Faith Based Innovations**

An iPhone app that combines **Apple Health**, **WHOOP**, **Fitbit** (including
the new Google-era Fitbits and Pixel Watch), and **Garmin** data into one
customizable view, with a deterministic rule-based dashboard and a multi-turn
Coach chat that can run on **Google Gemini**, **OpenAI ChatGPT**, **Anthropic
Claude**, or **xAI Grok**.

> **WHOOP connection is local-first.** Pulse Nexus pairs with the WHOOP strap
> **directly over Bluetooth** — no WHOOP account, no WHOOP cloud, no
> subscription. Live heart rate streams as soon as the strap is paired.
> Deeper WHOOP metrics (recovery, HRV, sleep) require decoding the strap's
> own encrypted frames on top of a GATT bond and are on the roadmap. See
> [`lib/whoop-ble.ts`](./lib/whoop-ble.ts).

Pulse Nexus also hands your data off to the **external ChatGPT iOS app** (and
Claude / Grok) in two complementary ways:

1. **Share-Sheet path (works for everyone, no infrastructure):** every Home /
   Sleep / Workouts tab has an "Ask…" button that opens the ChatGPT, Claude,
   or Grok app with a plain-text snapshot of that tab's data already in the
   prompt box. See [`lib/share.ts`](./lib/share.ts) and
   [`components/AskExternalAI.tsx`](./components/AskExternalAI.tsx).
2. **Custom-GPT path (true pull, requires a free Cloudflare deploy):** the
   sister project [`pulse-nexus-connector/`](../pulse-nexus-connector/)
   exposes your WHOOP / Fitbit / Garmin data over HTTPS so a ChatGPT Custom
   GPT can call `getSnapshot`, `getLastNightSleep`, `getRecentWorkouts`
   whenever you ask it a question. See that folder's README for the
   deployment + GPT-creation walkthrough.

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

| Provider | How connection works |
|---|---|
| WHOOP | **Direct Bluetooth pairing with the strap** (`lib/whoop-ble.ts`). No account, no cloud, no subscription. Pair from Connect → WHOOP → Pair over Bluetooth. |
| Fitbit | OAuth redirect URI to register: `pulsenexus://fitbit-callback` |
| Garmin | OAuth redirect URI to register: `pulsenexus://garmin-callback` |

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
│   ├── connect.tsx              Fitbit / Garmin OAuth + WHOOP Bluetooth entry (modal)
│   ├── whoop-connect.tsx        WHOOP-strap Bluetooth scan / pair / live-HR (modal)
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
│   ├── whoop.ts                 Public WHOOP API (BLE-backed; no OAuth)
│   ├── whoop-ble.ts             WHOOP-strap BLE client (scan / pair / live HR)
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
- ✅ "Ask ChatGPT / Claude / Grok" share button on every tab — sends the
   current snapshot straight into the external AI app's prompt box
- ✅ Custom-GPT connector backend (Cloudflare Worker) — see
   [`../pulse-nexus-connector/`](../pulse-nexus-connector/)
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
