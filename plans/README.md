# TaxiQ Plans

Read in this order:

0. [Decision log](decisions.md): Hussain's decisions; these override the plans where they differ
0. [v2 features to bring into v3](v2-features-to-port.md): what the live v2 got after the v3 split
0. [v3 core engine (API first)](v3-core-api.md): v3 as one API for hire, leasing, bank, management and more (D6)
1. [v3 implementation plan](taxiq-v3-implementation-plan.md): phases, timeline, resources, devices, and risks
2. [Core API and hosting plan](taxiq-v2-core-api-hosting-plan.md): core engine rules, and Firebase to VPS
3. [Multi-center platform and rules](taxiq-multi-center-platform.md): tenants, roles, and regulation findings
4. [Ride sharing and live map brief](taxiq-ride-sharing-brief.md): shared and private rides, and the game-like and city views
5. [Malé map plan](taxiq-male-map-plan.md): house, road, and map data for Malé

Notes live here because `docs/` is the build output and is emptied on every build.

Ideas:

- [Game mode](game-mode.md): a multiplayer taxi business game on the real map (draft, built in v2 first)
- [How to play TaxiQ Game](how-to-play.md): the player guide (updated each phase)
- [Product direction](product-direction.md): public service and private hire; v3 hires any land vehicle
- [Vehicle movement rules](vehicle-movement-rules.md): speed, acceleration, turning, junctions, traffic, GPS filtering and route prediction, stopping, lights
