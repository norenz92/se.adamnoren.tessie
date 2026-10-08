---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .homeycompose/flow/actions/lock.json
  - .homeycompose/flow/actions/unlock.json
  - .homeycompose/flow/actions/enable_sentry.json
  - .homeycompose/flow/actions/disable_sentry.json
  - .homeycompose/flow/actions/start_climate.json
  - .homeycompose/flow/actions/stop_climate.json
  - .homeycompose/flow/actions/set_temperature.json
  - .homeycompose/flow/actions/set_charge_limit.json
  - .homeycompose/flow/actions/set_charging_amps.json
  - .homeycompose/flow/actions/open_charge_port.json
  - .homeycompose/flow/actions/close_charge_port.json
  - .homeycompose/flow/actions/start_charging.json
  - .homeycompose/flow/actions/stop_charging.json
  - .homeycompose/flow/actions/activate_trunk.json
  - .homeycompose/flow/actions/activate_frunk.json
  - .homeycompose/flow/actions/set_seat_heater.json
  - .homeycompose/flow/actions/enable_steering_wheel_heater.json
  - .homeycompose/flow/actions/disable_steering_wheel_heater.json
  - .homeycompose/flow/actions/enable_defrost.json
  - .homeycompose/flow/actions/disable_defrost.json
  - .homeycompose/flow/actions/set_climate_keeper_mode.json
  - .homeycompose/flow/actions/set_cabin_overheat_protection.json
  - .homeycompose/flow/actions/close_windows.json
  - .homeycompose/flow/actions/vent_windows.json
  - .homeycompose/flow/actions/enable_valet_mode.json
  - .homeycompose/flow/actions/disable_valet_mode.json
  - .homeycompose/flow/actions/enable_speed_limit.json
  - .homeycompose/flow/actions/disable_speed_limit.json
  - .homeycompose/flow/actions/set_speed_limit.json
  - .homeycompose/flow/actions/wake.json
  - .homeycompose/flow/actions/honk.json
  - .homeycompose/flow/actions/flash_lights.json
  - .homeycompose/flow/actions/trigger_homelink.json
  - .homeycompose/flow/triggers/charging_started.json
  - .homeycompose/flow/triggers/charging_stopped.json
  - .homeycompose/flow/triggers/vehicle_locked.json
  - .homeycompose/flow/triggers/vehicle_unlocked.json
  - .homeycompose/flow/triggers/sentry_enabled.json
  - .homeycompose/flow/triggers/sentry_disabled.json
  - .homeycompose/flow/triggers/climate_started.json
  - .homeycompose/flow/triggers/climate_stopped.json
  - .homeycompose/flow/conditions/is_locked.json
  - .homeycompose/flow/conditions/is_charging.json
  - .homeycompose/flow/conditions/is_climate_on.json
  - .homeycompose/flow/conditions/is_sentry_on.json
  - .homeycompose/flow/conditions/is_home.json
  - .homeycompose/flow/conditions/charge_port_open.json
  - drivers/car/device.ts
autonomous: true
must_haves:
  truths:
    - "All vehicle controls are available as Homey flow action cards"
    - "Key state changes fire trigger cards for flow automation"
    - "Key boolean states can be checked via condition cards"
    - "Non-capability commands (wake, honk, flash, homelink) have action cards with run listeners"
  artifacts:
    - path: ".homeycompose/flow/actions/"
      provides: "Action card JSON files for all vehicle controls"
    - path: ".homeycompose/flow/triggers/"
      provides: "Trigger card JSON files for key state changes"
    - path: ".homeycompose/flow/conditions/"
      provides: "Condition card JSON files for key state checks"
    - path: "drivers/car/device.ts"
      provides: "Flow card run listeners and trigger registrations"
  key_links:
    - from: ".homeycompose/flow/actions/*.json"
      to: "drivers/car/device.ts"
      via: "Homey Compose auto-wires capability-based actions; custom run listeners for non-capability actions"
    - from: ".homeycompose/flow/triggers/*.json"
      to: "drivers/car/device.ts"
      via: "Flow card trigger() calls in updateCapabilities and capability listeners"
    - from: ".homeycompose/flow/conditions/*.json"
      to: "drivers/car/device.ts"
      via: "registerRunListener checking current capability values"
---

<objective>
Add all missing Homey flow cards (actions, triggers, conditions) for the Tesla vehicle driver so users can build automations in Homey Flows.

Purpose: Without flow cards, users cannot use Homey's visual automation builder with vehicle controls -- the app's core value proposition for a smart home hub.
Output: Complete set of flow card JSON files in .homeycompose/flow/ plus run listeners in device.ts.
</objective>

<execution_context>
@/Users/adamnoren/.claude/get-shit-done/workflows/execute-plan.md
@/Users/adamnoren/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@drivers/car/device.ts
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create all flow card JSON files</name>
  <files>
    .homeycompose/flow/actions/lock.json
    .homeycompose/flow/actions/unlock.json
    .homeycompose/flow/actions/enable_sentry.json
    .homeycompose/flow/actions/disable_sentry.json
    .homeycompose/flow/actions/start_climate.json
    .homeycompose/flow/actions/stop_climate.json
    .homeycompose/flow/actions/set_temperature.json
    .homeycompose/flow/actions/set_charge_limit.json
    .homeycompose/flow/actions/set_charging_amps.json
    .homeycompose/flow/actions/open_charge_port.json
    .homeycompose/flow/actions/close_charge_port.json
    .homeycompose/flow/actions/start_charging.json
    .homeycompose/flow/actions/stop_charging.json
    .homeycompose/flow/actions/activate_trunk.json
    .homeycompose/flow/actions/activate_frunk.json
    .homeycompose/flow/actions/set_seat_heater.json
    .homeycompose/flow/actions/enable_steering_wheel_heater.json
    .homeycompose/flow/actions/disable_steering_wheel_heater.json
    .homeycompose/flow/actions/enable_defrost.json
    .homeycompose/flow/actions/disable_defrost.json
    .homeycompose/flow/actions/set_climate_keeper_mode.json
    .homeycompose/flow/actions/set_cabin_overheat_protection.json
    .homeycompose/flow/actions/close_windows.json
    .homeycompose/flow/actions/vent_windows.json
    .homeycompose/flow/actions/enable_valet_mode.json
    .homeycompose/flow/actions/disable_valet_mode.json
    .homeycompose/flow/actions/enable_speed_limit.json
    .homeycompose/flow/actions/disable_speed_limit.json
    .homeycompose/flow/actions/set_speed_limit.json
    .homeycompose/flow/actions/wake.json
    .homeycompose/flow/actions/honk.json
    .homeycompose/flow/actions/flash_lights.json
    .homeycompose/flow/actions/trigger_homelink.json
    .homeycompose/flow/triggers/charging_started.json
    .homeycompose/flow/triggers/charging_stopped.json
    .homeycompose/flow/triggers/vehicle_locked.json
    .homeycompose/flow/triggers/vehicle_unlocked.json
    .homeycompose/flow/triggers/sentry_enabled.json
    .homeycompose/flow/triggers/sentry_disabled.json
    .homeycompose/flow/triggers/climate_started.json
    .homeycompose/flow/triggers/climate_stopped.json
    .homeycompose/flow/conditions/is_locked.json
    .homeycompose/flow/conditions/is_charging.json
    .homeycompose/flow/conditions/is_climate_on.json
    .homeycompose/flow/conditions/is_sentry_on.json
    .homeycompose/flow/conditions/is_home.json
    .homeycompose/flow/conditions/charge_port_open.json
  </files>
  <action>
Create directories: `.homeycompose/flow/actions/`, `.homeycompose/flow/triggers/`, `.homeycompose/flow/conditions/`.

**ACTION CARDS** -- Create one JSON file per action. All must include `"platforms": ["local"]` and a device arg with `"filter": "driver_id=car"`.

Simple toggle actions (no extra args beyond device): lock, unlock, enable_sentry, disable_sentry, start_climate, stop_climate, open_charge_port, close_charge_port, start_charging, stop_charging, activate_trunk, activate_frunk, enable_steering_wheel_heater, disable_steering_wheel_heater, enable_defrost, disable_defrost, close_windows, vent_windows, enable_valet_mode, disable_valet_mode, enable_speed_limit, disable_speed_limit, wake, honk, flash_lights, trigger_homelink.

Actions with extra args:
- `set_temperature.json` -- add number arg: `{ "type": "number", "name": "temperature", "title": { "en": "Temperature" }, "min": 15, "max": 28, "step": 0.5 }`
- `set_charge_limit.json` -- add number arg: `{ "type": "number", "name": "percent", "title": { "en": "Charge limit (%)" }, "min": 50, "max": 100, "step": 1 }`
- `set_charging_amps.json` -- add number arg: `{ "type": "number", "name": "amps", "title": { "en": "Amps" }, "min": 1, "max": 48, "step": 1 }`
- `set_seat_heater.json` -- add dropdown arg for seat: `{ "type": "dropdown", "name": "seat", "title": { "en": "Seat" }, "values": [{"id":"driver","title":{"en":"Driver"}},{"id":"passenger","title":{"en":"Passenger"}},{"id":"rear_left","title":{"en":"Rear left"}},{"id":"rear_center","title":{"en":"Rear center"}},{"id":"rear_right","title":{"en":"Rear right"}}] }` AND dropdown arg for level: `{ "type": "dropdown", "name": "level", "title": { "en": "Heat level" }, "values": [{"id":"0","title":{"en":"Off"}},{"id":"1","title":{"en":"Low"}},{"id":"2","title":{"en":"Medium"}},{"id":"3","title":{"en":"High"}}] }`
- `set_climate_keeper_mode.json` -- add dropdown arg: `{ "type": "dropdown", "name": "mode", "title": { "en": "Mode" }, "values": [{"id":"Off","title":{"en":"Off"}},{"id":"Keep","title":{"en":"Keep"}},{"id":"Dog","title":{"en":"Dog"}},{"id":"Camp","title":{"en":"Camp"}}] }`
- `set_cabin_overheat_protection.json` -- add dropdown arg: `{ "type": "dropdown", "name": "mode", "title": { "en": "Mode" }, "values": [{"id":"Off","title":{"en":"Off"}},{"id":"FanOnly","title":{"en":"Fan only"}},{"id":"AC","title":{"en":"A/C"}}] }`
- `set_speed_limit.json` -- add number arg: `{ "type": "number", "name": "speed", "title": { "en": "Speed (mph)" }, "min": 50, "max": 90, "step": 1 }`

Use descriptive `title` and `hint` for each card. Example titles: "Lock the vehicle", "Set charge limit", "Honk the horn", "Flash the lights", "Open the frunk". Use `titleFormatted` with arg placeholders for actions with args, e.g. "Set temperature to [[temperature]]".

**TRIGGER CARDS** -- Create JSON files for state change events. Each has `tokens: []` (no extra data tokens needed) and the standard device arg. Titles: "Charging started", "Charging stopped", "Vehicle was locked", "Vehicle was unlocked", "Sentry mode enabled", "Sentry mode disabled", "Climate started", "Climate stopped".

**CONDITION CARDS** -- Create JSON files to check boolean states. Each has the standard device arg. Titles: "Vehicle is locked", "Vehicle is charging", "Climate is on", "Sentry mode is on", "Charge port is open". Also add `is_home.json` as a placeholder condition (title: "Vehicle is home") -- this will check if latitude/longitude match a configured home location (simple placeholder for now, just register the card).
  </action>
  <verify>
    <automated>ls .homeycompose/flow/actions/*.json | wc -l && ls .homeycompose/flow/triggers/*.json | wc -l && ls .homeycompose/flow/conditions/*.json | wc -l</automated>
  </verify>
  <done>33 action card JSONs, 8 trigger card JSONs, and 6 condition card JSONs exist with correct structure</done>
</task>

<task type="auto">
  <name>Task 2: Wire flow card run listeners in device.ts</name>
  <files>drivers/car/device.ts</files>
  <action>
In VehicleDevice.onInit(), after existing capability listener registrations, add flow card registrations.

**Action card run listeners** -- Only needed for non-capability actions (capability-based actions like lock/unlock auto-work through registerCapabilityListener). Register run listeners for:

1. `wake` -- call `this.client.wake(this.getData().id)` (no ensureAwake needed)
2. `honk` -- call `this.executeCommand('honk')`
3. `flash_lights` -- call `this.executeCommand('flash_lights')`
4. `trigger_homelink` -- call `this.executeCommand('trigger_homelink')`
5. `set_seat_heater` -- map args.seat dropdown id to SEAT_MAP key (`seat_heater_${args.seat}` for driver/passenger, or `seat_heater_rear_${args.seat.replace('rear_','')}` for rear seats), look up seat number from SEAT_MAP, call `this.executeCommand('set_seat_heating', { seat: seatNum, level: Number(args.level) })`
6. `set_temperature` -- call `this.setCapabilityValue('target_temperature', args.temperature)` which triggers the existing capability listener
7. `set_charge_limit` -- call `this.setCapabilityValue('charge_limit', args.percent / 100)` which triggers existing listener
8. `set_charging_amps` -- call `this.setCapabilityValue('charging_amps', args.amps)` which triggers existing listener
9. `set_climate_keeper_mode` -- call `this.setCapabilityValue('climate_keeper_mode', args.mode)` which triggers existing listener
10. `set_cabin_overheat_protection` -- call `this.setCapabilityValue('cabin_overheat_protection', args.mode)` which triggers existing listener
11. `set_speed_limit` -- call `this.setCapabilityValue('speed_limit_speed', args.speed)` which triggers existing listener

For all action cards that map directly to capability toggles (lock, unlock, start_climate, etc.), use the Homey Compose approach: in the action card JSON, do NOT add a `"id"` field -- Homey Compose auto-generates the card ID from the filename. The run listener approach is only needed for cards that don't directly map to a single capability setter.

Actually, the SIMPLEST approach: For capability-based toggle actions, the best Homey pattern is to call `this.setCapabilityValue()` from the run listener which triggers the existing capability listener. Register ALL action card run listeners in onInit using `this.homey.flow.getActionCard('card-id').registerRunListener(async (args) => { ... })`.

Card IDs in Homey Compose are derived from the filename (e.g., `lock.json` -> card ID `lock`).

**Trigger card registration** -- Store flow card trigger references as instance properties. In onInit:
```typescript
this._chargingStartedTrigger = this.homey.flow.getDeviceTriggerCard('charging_started');
this._chargingStoppedTrigger = this.homey.flow.getDeviceTriggerCard('charging_stopped');
// ... etc for all 8 trigger cards
```

Then fire triggers at the right moments:
- In `updateCapabilities()`, after setting `charging_control`, detect state change: if new value differs from previous, fire `charging_started` or `charging_stopped` trigger. Use `this.getCapabilityValue('charging_control')` BEFORE setting the new value to detect change.
- Similarly for `locked` (vehicle_locked/vehicle_unlocked), `sentry_mode` (sentry_enabled/sentry_disabled), `climate_onoff` (climate_started/climate_stopped).
- Fire with: `this._chargingStartedTrigger.trigger(this, {}, {}).catch(this.error);`

**Condition card registration** -- Register run listeners that check current capability values:
```typescript
this.homey.flow.getConditionCard('is_locked').registerRunListener(async (args) => {
  return args.device.getCapabilityValue('locked') === true;
});
```
Do this for: is_locked (locked===true), is_charging (charging_control===true), is_climate_on (climate_onoff===true), is_sentry_on (sentry_mode===true), charge_port_open (charge_port===true).

For `is_home`: register a placeholder that always returns false (or log a warning). This is a future enhancement.

Declare trigger card instance properties at the top of the class alongside existing properties (client, streamer, etc.):
```typescript
private _chargingStartedTrigger!: any;
// ... etc
```
  </action>
  <verify>
    <automated>cd /Users/adamnoren/se.adamnoren.tessie && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>All flow action cards have run listeners, trigger cards fire on state changes, condition cards check current values. TypeScript compiles without errors.</done>
</task>

</tasks>

<verification>
- All JSON files in .homeycompose/flow/ are valid JSON with required fields (title, platforms, args with device filter)
- TypeScript compiles without errors: `npx tsc --noEmit`
- Action cards with args have correctly structured arg definitions
- Trigger cards are fired in updateCapabilities when state changes
- Condition cards return boolean based on current capability values
</verification>

<success_criteria>
- 33+ action card JSON files exist covering all vehicle controls plus wake/honk/flash/homelink
- 8 trigger card JSON files exist for key state changes
- 6 condition card JSON files exist for key state checks
- device.ts registers run listeners for action/condition cards and fires trigger cards on state changes
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/2-there-is-alot-of-action-cards-missing/2-SUMMARY.md`
</output>
