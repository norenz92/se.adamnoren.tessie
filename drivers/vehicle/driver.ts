import Homey from 'homey';
import TessieClient = require('../../lib/tessie-client');
import type VehicleDevice = require('./device');

// Map car_type to human-readable model name for the pairing list description.
const CAR_TYPE_TO_MODEL: Record<string, string> = {
  'models': 'Model S',
  'modelx': 'Model X',
  'model3': 'Model 3',
  'modely': 'Model Y',
  'cybertruck': 'Cybertruck',
};

// Map car_type to icon path. Unknown types fall back to default.
const ICON_MAP: Record<string, string> = {
  'models': '/drivers/vehicle/assets/icons/model_s.svg',
  'modelx': '/drivers/vehicle/assets/icons/model_x.svg',
  'model3': '/drivers/vehicle/assets/icons/model_3.svg',
  'modely': '/drivers/vehicle/assets/icons/model_y.svg',
  'cybertruck': '/drivers/vehicle/assets/icons/cybertruck.svg',
};

// Actions backed by a capability. They go through triggerCapabilityListener so the
// command is actually sent (setCapabilityValue alone never invokes the listener).
const CAPABILITY_ACTIONS: Record<string, [string, any]> = {
  lock: ['locked', true],
  unlock: ['locked', false],
  enable_sentry: ['sentry_mode', true],
  disable_sentry: ['sentry_mode', false],
  start_climate: ['climate_onoff', true],
  stop_climate: ['climate_onoff', false],
  open_charge_port: ['charge_port', true],
  close_charge_port: ['charge_port', false],
  start_charging: ['charging_control', true],
  stop_charging: ['charging_control', false],
  activate_trunk: ['trunk', true],
  activate_frunk: ['frunk', true],
  enable_steering_wheel_heater: ['steering_wheel_heater', true],
  disable_steering_wheel_heater: ['steering_wheel_heater', false],
  enable_defrost: ['defrost_mode', true],
  disable_defrost: ['defrost_mode', false],
  close_windows: ['windows', true],
  vent_windows: ['windows', false],
  enable_valet_mode: ['valet_mode', true],
  disable_valet_mode: ['valet_mode', false],
  enable_speed_limit: ['speed_limit_mode', true],
  disable_speed_limit: ['speed_limit_mode', false],
};

// Parameterless Tessie commands with no matching capability.
const COMMAND_ACTIONS: Record<string, string> = {
  honk: 'honk',
  flash_lights: 'flash',
  trigger_homelink: 'trigger_homelink',
  open_tonneau: 'open_tonneau',
  close_tonneau: 'close_tonneau',
  vent_sunroof: 'vent_sunroof',
  close_sunroof: 'close_sunroof',
  enable_keyless_driving: 'remote_start',
  cancel_software_update: 'cancel_software_update',
};

// Actions with an on/off dropdown mapping to an enable/disable command pair.
const TOGGLE_ACTIONS: Record<string, [string, string]> = {
  set_low_power_mode: ['enable_low_power_mode', 'disable_low_power_mode'],
  set_keep_accessory_power: ['enable_keep_accessory_power_mode', 'disable_keep_accessory_power_mode'],
  set_guest_mode: ['enable_guest', 'disable_guest'],
};

// Conditions that compare a capability value.
const CAPABILITY_CONDITIONS: Record<string, (device: VehicleDevice) => boolean> = {
  is_locked: (d) => d.getCapabilityValue('locked') === true,
  is_charging: (d) => d.getCapabilityValue('charging_status') === 'Charging',
  is_climate_on: (d) => d.getCapabilityValue('climate_onoff') === true,
  is_sentry_on: (d) => d.getCapabilityValue('sentry_mode') === true,
  charge_port_open: (d) => d.getCapabilityValue('charge_port') === true,
  is_plugged_in: (d) => {
    const status = d.getCapabilityValue('charging_status');
    return status != null && status !== 'Disconnected';
  },
  is_asleep: (d) => d.getCapabilityValue('vehicle_state_status') === 'Asleep',
  is_driving: (d) => ['D', 'R', 'N'].includes(d.getCapabilityValue('shift_state')),
  windows_closed: (d) => d.getCapabilityValue('windows') === true,
  software_update_available: (d) => {
    const value = d.getCapabilityValue('software_update');
    return typeof value === 'string' && value !== 'Up to date';
  },
  is_home: (d) => d.isAtHome(),
};

class VehicleDriver extends Homey.Driver {

  async onInit(): Promise<void> {
    this.registerFlowCards();
  }

  private registerFlowCards(): void {
    const { flow } = this.homey;

    for (const [cardId, [capId, value]] of Object.entries(CAPABILITY_ACTIONS)) {
      flow.getActionCard(cardId).registerRunListener(async (args: any) => {
        await (args.device as VehicleDevice).triggerCapabilityListener(capId, value);
      });
    }

    for (const [cardId, command] of Object.entries(COMMAND_ACTIONS)) {
      flow.getActionCard(cardId).registerRunListener(async (args: any) => {
        await (args.device as VehicleDevice).executeCommand(command);
      });
    }

    for (const [cardId, [onCommand, offCommand]] of Object.entries(TOGGLE_ACTIONS)) {
      flow.getActionCard(cardId).registerRunListener(async (args: any) => {
        await (args.device as VehicleDevice).executeCommand(args.state === 'on' ? onCommand : offCommand);
      });
    }

    flow.getActionCard('wake').registerRunListener(async (args: any) => {
      await (args.device as VehicleDevice).wake();
    });
    flow.getActionCard('refresh').registerRunListener(async (args: any) => {
      await (args.device as VehicleDevice).refreshState();
    });

    flow.getActionCard('set_temperature').registerRunListener(async (args: any) => {
      // Cards created before the unit argument existed were always °C
      await (args.device as VehicleDevice).setTargetTemperature(Number(args.temperature), args.unit === 'F' ? 'F' : 'C');
    });
    flow.getActionCard('set_speed_limit').registerRunListener(async (args: any) => {
      // Cards created before the unit argument existed were always mph
      await (args.device as VehicleDevice).setSpeedLimit(Number(args.speed), args.unit === 'kmh' ? 'kmh' : 'mph');
    });
    flow.getActionCard('set_charge_limit').registerRunListener(async (args: any) => {
      await (args.device as VehicleDevice).triggerCapabilityListener('charge_limit', Number(args.percent) / 100);
    });
    flow.getActionCard('set_charging_amps').registerRunListener(async (args: any) => {
      await (args.device as VehicleDevice).triggerCapabilityListener('charging_amps', Number(args.amps));
    });
    flow.getActionCard('set_climate_keeper_mode').registerRunListener(async (args: any) => {
      await (args.device as VehicleDevice).triggerCapabilityListener('climate_keeper_mode', args.mode);
    });
    flow.getActionCard('set_cabin_overheat_protection').registerRunListener(async (args: any) => {
      await (args.device as VehicleDevice).triggerCapabilityListener('cabin_overheat_protection', args.mode);
    });
    flow.getActionCard('set_seat_heater').registerRunListener(async (args: any) => {
      await (args.device as VehicleDevice).setSeatHeater(args.seat, Number(args.level));
    });
    flow.getActionCard('set_seat_cooling').registerRunListener(async (args: any) => {
      await (args.device as VehicleDevice).setSeatCooling(args.seat, Number(args.level));
    });
    flow.getActionCard('set_cop_temperature').registerRunListener(async (args: any) => {
      await (args.device as VehicleDevice).executeCommand('set_cop_temp', { cop_temp: Number(args.level) });
    });
    flow.getActionCard('set_bioweapon_mode').registerRunListener(async (args: any) => {
      await (args.device as VehicleDevice).executeCommand('set_bioweapon_mode', { on: args.state === 'on' });
    });
    flow.getActionCard('schedule_software_update').registerRunListener(async (args: any) => {
      const minutes = Math.max(0, Math.round(Number(args.minutes) || 0));
      await (args.device as VehicleDevice).executeCommand('schedule_software_update', { in_seconds: minutes * 60 });
    });
    flow.getActionCard('play_boombox').registerRunListener(async (args: any) => {
      await (args.device as VehicleDevice).executeCommand('remote_boombox', { sound: Number(args.sound) });
    });
    flow.getActionCard('share_destination').registerRunListener(async (args: any) => {
      const value = String(args.destination ?? '').trim();
      if (!value) throw new Error('Destination is empty');
      await (args.device as VehicleDevice).executeCommand('share', { value });
    });
    flow.getActionCard('clear_speed_limit_pin').registerRunListener(async (args: any) => {
      const device = args.device as VehicleDevice;
      await device.executeCommand('clear_speed_limit_pin', { pin: device.getSpeedLimitPin() });
    });

    for (const [cardId, check] of Object.entries(CAPABILITY_CONDITIONS)) {
      flow.getConditionCard(cardId).registerRunListener(async (args: any) => check(args.device as VehicleDevice));
    }
    flow.getConditionCard('battery_above').registerRunListener(async (args: any) => {
      const battery = (args.device as VehicleDevice).getCapabilityValue('measure_battery');
      return battery != null && battery > Number(args.percent);
    });

    // Fires on every battery change; only continue when the level crosses the threshold downwards
    flow.getDeviceTriggerCard('battery_below').registerRunListener(async (args: any, state: any) => {
      const threshold = Number(args.percent);
      return state.previous >= threshold && state.current < threshold;
    });
  }

  async onPair(session: any): Promise<void> {
    let token: string | null = null;
    let vehicles: any[] = [];

    session.setHandler('validate_token', async (inputToken: string) => {
      const client = new TessieClient(inputToken);
      vehicles = await client.getVehicles(); // throws on invalid token
      token = inputToken;
      return true;
    });

    session.setHandler('list_devices', async () => {
      // Duplicate VIN detection: filter out already-paired vehicles
      const pairedVins = new Set(this.getDevices().map((d: any) => d.getData().id));

      return vehicles
        .filter((v: any) => !pairedVins.has(v.vin))
        .map((v: any) => {
          const carType = v.last_state?.vehicle_config?.car_type;
          const lastFourVin = v.vin.slice(-4);
          const displayName = v.last_state?.display_name || `Tesla ${lastFourVin}`;
          const modelName = CAR_TYPE_TO_MODEL[carType] || 'Tesla';
          const device: Record<string, any> = {
            name: displayName,
            description: `${modelName} · ${lastFourVin}`,
            data: { id: v.vin },
            store: { token },
            icon: ICON_MAP[carType] || undefined,
          };
          const settings = unitSettingsFromGui(v.last_state?.gui_settings);
          if (settings) device.settings = settings;
          return device;
        });
    });
  }

  async onRepair(session: any, device: any): Promise<void> {
    session.setHandler('validate_token', async (inputToken: string) => {
      const client = new TessieClient(inputToken);
      const vehicles = await client.getVehicles();
      const found = vehicles.find((v: any) => v.vin === device.getData().id);
      if (!found) {
        throw new Error('Vehicle not found with this token. Make sure you are using a token from the correct Tessie account.');
      }
      await (device as VehicleDevice).updateToken(inputToken);
      return true;
    });
  }

}

// Seed a new device's unit settings from the car's own display preferences.
function unitSettingsFromGui(gs: any): Record<string, string> | null {
  if (!gs) return null;
  const metric = gs.gui_distance_units === 'km/hr';
  return {
    unit_distance: metric ? 'km' : 'mi',
    unit_pressure: gs.gui_tirepressure_units === 'Psi' ? 'psi' : 'bar',
    unit_temperature: gs.gui_temperature_units === 'F' ? 'F' : 'C',
    unit_speed: metric ? 'kmh' : 'mph',
  };
}

export = VehicleDriver;
