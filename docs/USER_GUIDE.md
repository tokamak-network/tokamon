# Tokamon User Guide

## App (iOS - TestFlight)

### Download

1. Install **TestFlight** from the App Store on your iPhone
2. Tap the invite link → Install the Tokamon app

### Collecting TON

1. Launch the app → Map screen appears after intro animation
2. Allow location access → Spot markers appear around your current location (blue dot)
3. Tap a spot marker → Spot detail sheet opens at the bottom
   - View store name, reward (TON), remaining claims, and distance
4. When you arrive **within range** of a spot, the **Claim** button activates → Tap to earn TON
5. After the cooldown period (default 24 hours), you can Claim again at the same spot

### Bottom Tab Navigation

| Tab | Function |
|-----|----------|
| Map | View nearby spots on the map and Claim |
| Spots | Spot list with Active / Inactive / All filters |
| Wallet | Wallet registration, balance check |
| Settings | Language (Korean/English), network switching |

### Wallet Registration

1. **Wallet** tab → Enter wallet address → **Register Wallet**
2. Receive verification code via push notification → Auto-confirmed
3. After registration, go to https://go.tokamon.io → Collector → Wallet tab to link your wallet and Claim to Wallet

---

## Web (https://go.tokamon.io)

### Role Selection

Three roles are available on the landing page:

| Role | Description |
|------|-------------|
| **Collector** | Explore spots and collect TON |
| **Spot Kiosk** | Issue TON via Telegram |
| **Spot Creator** | Create and manage your spots |

### Collector

1. Select **Collector** → Spot markers appear on the map
2. Click a spot to view store info (reward, remaining claims, distance, stamp progress)
3. Use the **Spot List** tab to filter spots by Active / Inactive / All
4. In the **Wallet** tab, connect your wallet to check balance and Claim to Wallet

### Telegram Integration (Spot Kiosk)

1. Search for **@TokamonBot** on Telegram
2. Send `/start` → `/link`
3. Enter your wallet address → Integration complete
4. On the web, go to the **Spot Kiosk** page to check TON balance earned via Telegram and Claim to Wallet

### Spot Creator - Creating a Spot

1. Select **Spot Creator** → Connect MetaMask wallet
2. **Create Spot** tab → Click on the map to select a location → Press the **+** button
3. Fill out the spot creation form:

| Field | Description |
|-------|-------------|
| Store Name | Store name (required) |
| Store Description | Store description |
| Location | Auto-filled from map click |
| Date Range | Operating period (default: today ~ 30 days later) |
| Daily Hours | Operating hours (default: 09:00 ~ 18:00, leave empty for 24/7) |
| Total Deposit | Total deposit amount (minimum 10 TON) |
| Visit Reward | Reward per visit (default: 0.5 TON) |
| Stamp Goal | Number of stamps to collect (optional) |
| Achievement Bonus | Bonus for completing stamp goal (optional) |
| Revisit Cooldown | Wait time between visits (default: 24 hours) |

4. Approve the transaction in MetaMask → Spot creation complete

### Spot Creator - Managing Spots

Manage your created spots in the **My Spot Management** tab:

- **TON Redeposit** — Add more deposit funds
- **Change Cooldown** — Change the revisit wait time
- **Duplicate Claim Settings** — Allow or block duplicate claims
- **Edit Spot** — Edit store name, description, operating hours, etc.
