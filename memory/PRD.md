# AeroStep — Product Requirements Document

## App Overview
Dark-first iOS SaaS fitness tracker with native pedometer, BLE device integration, AI coaching, and gamified achievements.

---

## Core Features

### 1. Step Tracking
- **Source**: Phone pedometer (`expo-sensors`) — works in Expo Go
- **Source**: BLE Device (Heart Rate + RSC cadence steps) — requires native build
- **Source Toggle**: Phone ↔ BLE Device pill on Home screen
- **Background sync**: `expo-background-task` flushes pending steps when app is backgrounded
- Steps synced to backend every 15s; background task handles flush

### 2. Profile Configuration
- Fields: Name, Gender, Age, Weight (kg), Height (cm), Activity Level, Health Conditions
- Auto-calculates daily step goal and calorie goal via backend
- Device ID auto-generated and persisted in AsyncStorage
- Profile submission uses a single database round trip with bounded client waiting
- Offline-first profile creation opens Home immediately and retries backend sync automatically

### 3. BLE Integration (Native Build Only)
- **Package**: `react-native-ble-plx` v3.5.1
- **Scanning**: Lists nearby named BLE devices with RSSI signal bars
- **Connection**: Connects to any BLE device
- **Heart Rate**: Standard BLE profile (0x180D / 0x2A37), streams live
- **Steps**: RSC cadence integration (0x1814 / 0x2A53), estimated
- **Battery**: Battery Service (0x180F / 0x2A19)
- **UI**: Devices modal accessible from Profile → Connected Devices card
- **Home**: Live HR band + BLE step ring when BLE source is selected
- Graceful fallback: "Native Build Required" notice in Expo Go/web

### 4. AI Coach
- Model: `gpt-4o` via Emergent LLM Key
- Personalized tips based on profile (age, weight, activity, conditions)
- Refresh button on Home screen
- Cached per-day per-device

### 5. Stats
- Weekly bar chart (7-day history)
- Daily breakdown: steps, calories, distance (km), active minutes
- Streak tracking (current + best)

### 6. Awards / Achievements
- Step milestones, streaks, calorie goals
- Badge unlock with date

---

## Screens
1. **Onboarding** — Profile setup (shown once)
2. **Home** — Ring progress, source toggle, HR band, metric grid, AI coach card
3. **Stats** — Weekly bar chart, daily summaries
4. **Awards** — Achievement badges
5. **Profile** — Edit biometrics + Connected Devices card → Devices modal

---

## Tech Stack
- **Frontend**: Expo SDK 54, React Native, expo-router (file-based routing)
- **Backend**: FastAPI + MongoDB
- **AI**: OpenAI `gpt-4o` via `emergentintegrations`
- **BLE**: `react-native-ble-plx` v3.5.1
- **Background**: `expo-task-manager` + `expo-background-task`
- **Fonts**: Satoshi (custom via expo-font)
- **State**: React Context (BLEContext), useState/useRef locally

---

## Key DB Schema
```
users:       { device_id, name, age, weight_kg, height_cm, gender, activity_level, health_conditions, step_goal, calorie_goal }
step_days:   { device_id, date, steps, steps_phone, steps_ble, last_source, updated_at }
achievements: { device_id, badge_name, unlocked_at }
ai_tips:     { device_id, date, tip }
```

---

## Permissions
### iOS (app.json infoPlist)
- `NSMotionUsageDescription` — pedometer
- `NSBluetoothAlwaysUsageDescription` — BLE
- `NSBluetoothPeripheralUsageDescription` — BLE legacy
- `NSLocationWhenInUseUsageDescription` — BLE scan
- `UIBackgroundModes: [bluetooth-central, fetch, processing]`

### Android (app.json permissions)
- `ACTIVITY_RECOGNITION`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE`, `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`

---

## Known Limitations
- BLE scanning / connection requires native build (cannot test in Expo Go / web preview)
- Background step task requires native build
- BLE step counting is cadence-estimated (not a true cumulative step counter unless device exposes a proprietary step characteristic)
- Garmin/Fitbit proprietary protocols not supported (standard BLE only)
