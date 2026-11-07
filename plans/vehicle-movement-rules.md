# Vehicle movement rules

Status: draft for Hussain to check (2026-11-07). How every vehicle on the TaxiQ map moves, so it
looks like real driving in the Maldives. Numbers are starting values to tune on a real phone.

There are two kinds of vehicle:

- **Simulated**: demo taxis and TaxiQ Game cars. The app decides where they go, so they follow
  **every** rule below.
- **Real GPS**: private vehicles and MTCC RTL buses. The GPS decides where they are, so the rules
  only shape **how they are drawn** between readings (§6 and §7). They are never moved somewhere
  they are not.

Already built (v2.4.0): real size, gliding, rounded corners, keep left, staying on the road, and
lining up with the road when stopped.

## 1. Speed: by place and road

Each vehicle drives at 85–100% of the limit (each has its own steady "driver").

| Where | Limit |
|-------|-------|
| Malé streets | 25 km/h |
| Hulhumalé, and main roads (primary, secondary) | 40 km/h |
| Other island roads (residential, unclassified) | 30 km/h |
| Lanes, service roads, parking aisles | 10 km/h |
| Sharp corner (90°) | 10–12 km/h (§3) |

The road type comes from OpenStreetMap (the road graph keeps it per stretch).

## 2. Speeding up and slowing down: real and gentle, by type

| Vehicle | Top speed | 0 to 30 km/h | Normal braking | Cornering |
|---------|-----------|--------------|----------------|-----------|
| Car (and taxi) | the limit | about 5 s | 2.5 m/s² | normal |
| Van, pickup | limit −10% | about 6 s | 2.2 m/s² | wider, slower |
| Bus | limit −15%, max 35 km/h | about 9 s | 1.8 m/s² | widest, slowest |
| Motorbike | the limit | about 3.5 s | 3 m/s² | tighter, leans |
| E-bike | max 25 km/h | about 5 s | 2.5 m/s² | tighter, leans |

Speed always changes smoothly: no instant starts or stops, and no jolts.

## 3. Turning and manoeuvres

- **Slow for corners:** the sharper the turn, the slower. 90° at 10–12 km/h, 45° at about 20 km/h, then speed up again on the straight.
- **Big vehicles turn wide:** buses, vans and pickups swing wider (a larger corner curve) and turn more slowly. Motorbikes and e-bikes take tighter curves.
- **Bikes lean:** motorbikes and e-bikes tilt into turns, drawn as a slight sideways squeeze, up to about 15° of lean.
- **Indicators:** an amber blinker on the turning side starts about 3 s (or 30 m) before a turn, flashing about 1.5 times a second, and stops after the turn.
- **Keep left:** the left lane on two-way roads, the middle of one-way roads (built).
- **Never backwards:** a vehicle never moves back along its path. There's no reversing in v2.

## 4. Junctions: slow and give way

- Slow to about 10 km/h approaching any junction.
- **Give way:** if another vehicle is in or about to enter the junction across your way, wait until it's clear. Main roads have priority over side roads; with equal roads, whoever arrived first goes first.
- Queue behind a vehicle waiting at the junction.

## 5. Other vehicles

- **Safe distance:** keep about a **2-second gap** behind the vehicle ahead (at least 4 m when stopped), and slow down to match it. Vehicles **never pass through each other**.
- **Overtaking:** on a straight two-way road at least 80 m long, with no junction in the way and nothing coming the other way, a faster vehicle may pass a slower one, then return to its lane.
- **Bikes filter past:** motorbikes and e-bikes may pass queued cars slowly (at most 10 km/h) along the left edge.

## 6. Real GPS: odd readings (hold, then confirm)

- **Reject impossible readings:** a reading that would need more than about 1.5× the vehicle's top speed, jumps over 150 m, or goes backwards along the path is held, not shown.
- **Confirm:** a held position is accepted only when **2–3 readings agree**; then the vehicle drives there smoothly along the road, never jumping.
- **Stay calm:** small wobbles while parked (under 8 m) are ignored, so a parked vehicle doesn't creep or spin.
- **Never backwards:** along its route or road, a vehicle's shown position only moves forward. It can turn back only when readings clearly show a U-turn.

## 7. Real GPS: prediction along the known route

- **Buses:** each bus belongs to an RTL route. Its route's shape (RTL `roadshape`) and stops are known, so the bus is matched to its **own route**, not just the nearest road. Between readings it keeps moving along the route toward the next stop at its recent speed, for up to about 15 s, then eases to a stop if no reading comes. Stops and checkpoints on the route help confirm where it is.
- **Private vehicles:** they keep moving along the road they're on, at their recent speed, for up to about 15 s, then ease to a stop.
- A new reading corrects the prediction smoothly, by gliding, never with a jump.

## 8. Stopping and parking

- **Pull to the left edge** to park, pick up or drop off, not the middle of the lane.
- **Buses wait at their stops:** slow into each stop on their route and wait about 20–40 s (simulated); real buses do what their GPS shows.
- **Taxis pause** at the pickup (about 15 s, the passenger getting in) and the destination (about 10 s).
- **Parking:** parked vehicles prefer the nearest parking aisle or parking area over the roadside.
- **Lined up with the road** when stopped (built).

## 9. Looks

- **Brake lights:** red lights at the back glow while slowing or stopped.
- **Headlights at night:** from dusk to dawn (by the viewer's local time, 18:00–06:00), a soft beam in front of each vehicle.
- **Ground shadow:** a soft shadow under each vehicle (part built).
- **Real size** for the zoom (built).

## 10. Build steps

Each step goes to localhost for checking first.

1. ✅ **Speed, acceleration and turning** (built): limits by place and road (§1), acceleration by type (§2), slowing for corners, wide or tight turns, bikes leaning, indicators (§3), and never backwards. Covers the demo taxis (roaming and on rides) fully, plus indicators and lean for real-GPS vehicles and buses. TaxiQ Game cars come later: they must move identically on every phone, so they need a deterministic version.
2. ✅ **GPS filtering and route prediction** (built): After lost signal or a big jump (over 300 m; over 120 m after 45 s with no reading; or roads far longer than the hop), the vehicle fades out where it was and fades in slowly at the new place, along the road, instead of sliding across the map (`shouldReappear`, `reappear` in MapView). hold-then-confirm (§6, `src/core/gpsFilter.ts`); each bus matched to its own route line, built from its stops in order and joined along the roads (RTL's `roadshape` service wasn't answering), moving only forward and coasting toward the next stop (`src/core/routeLine.ts`); private vehicles coast along the road ahead (`roadAhead`).
3. ✅ **Junctions, distance and overtaking** (built, demo taxis: `traffic()` in `src/positions.ts`): a 2-second gap, never through each other, overtaking on straight two-way roads of 80 m or more with nothing coming, and giving way at junctions (main road first, then first to arrive, 6 s at most). Bikes filtering past applies when there are simulated bikes (game cars later).
4. ✅ **Stops, parking and lights** (built): parked taxis at the left edge, preferring parking aisles; taxis on a ride stop and wait 15 s at the pickup, pulled over at the destination; parked private vehicles prefer a parking aisle within 25 m (`snapParked`); brake lights, headlights from 18:00 to 06:00 and a ground shadow on every vehicle. Real buses wait at stops as their GPS shows (predictions stop at the next stop).

Notes:

- §4 and §5 need simulated vehicles to know about each other. That works in the browser for demo taxis and game cars. In v3 the server runs it, so every phone sees the same traffic.
- Steps 1 and 4 also improve how real-GPS vehicles look (turning, lights). Step 2 is only for real GPS.
