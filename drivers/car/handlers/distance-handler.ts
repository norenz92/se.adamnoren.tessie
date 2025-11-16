/**
 * Distance Unit Handler
 * Manages distance unit conversions and capability unit updates
 */

import Homey from "homey";

export type DistanceUnit = "km" | "mi";

const MILES_TO_KM_FACTOR = 1.60934;
const TESLA_API_DISTANCE_UNIT = "mi" as const;

const DISTANCE_CAPABILITIES = [
  "meter_car_odo",
  "measure_soc_range_estimated",
  "measure_soc_range_ideal",
] as const;

/**
 * Utility class for distance unit conversions
 */
export class DistanceConverter {
  /**
   * Convert miles per hour to kilometers per hour
   */
  static mphToKmh(mph: number): number {
    return mph * MILES_TO_KM_FACTOR;
  }

  /**
   * Convert kilometers per hour to miles per hour
   */
  static kmhToMph(kmh: number): number {
    return kmh / MILES_TO_KM_FACTOR;
  }

  /**
   * Convert miles to kilometers
   */
  static milesToKm(miles: number): number {
    return miles * MILES_TO_KM_FACTOR;
  }

  /**
   * Convert kilometers to miles
   */
  static kmToMiles(km: number): number {
    return km / MILES_TO_KM_FACTOR;
  }

  /**
   * Convert distance from one unit to another
   */
  static convert(
    value: number,
    fromUnit: DistanceUnit,
    toUnit: DistanceUnit
  ): number {
    if (fromUnit === toUnit) return value;

    if (fromUnit === "mi" && toUnit === "km") {
      return this.milesToKm(value);
    }

    if (fromUnit === "km" && toUnit === "mi") {
      return this.kmToMiles(value);
    }

    return value;
  }

  /**
   * Convert Tesla API value (always in miles) to user's preferred unit
   */
  static fromMiles(miles: number, targetUnit: DistanceUnit): number {
    return targetUnit === "km" ? this.milesToKm(miles) : miles;
  }

  /**
   * Convert speed from mph to user's preferred unit
   */
  static convertSpeed(speedInMph: number, targetUnit: DistanceUnit): number {
    return targetUnit === "km" ? this.mphToKmh(speedInMph) : speedInMph;
  }
}

/**
 * Handler for device distance unit settings and conversions
 */
export class DistanceHandler {
  private device: Homey.Device;
  private logger: any;

  constructor(device: Homey.Device, logger: any) {
    this.device = device;
    this.logger = logger;
  }

  /**
   * Get the user's preferred distance unit
   */
  getDistanceUnit(): DistanceUnit {
    return (this.device.getSetting("odometer_unit") as DistanceUnit) || "km";
  }

  /**
   * Convert Tesla API distance value (always in miles) to user's preferred unit
   */
  convertDistance(valueInMiles: number): number {
    return DistanceConverter.fromMiles(valueInMiles, this.getDistanceUnit());
  }

  /**
   * Convert speed from mph to user's preferred unit
   */
  convertSpeed(speedInMph: number): number {
    return DistanceConverter.convertSpeed(speedInMph, this.getDistanceUnit());
  }

  /**
   * Update distance capability units and convert existing values
   */
  async updateDistanceUnits(
    oldUnit?: DistanceUnit,
    newUnit?: DistanceUnit
  ): Promise<void> {
    const targetUnit = newUnit || this.getDistanceUnit();

    this.logger(
      `Updating distance units to: ${targetUnit} (was: ${oldUnit || "unknown"})`
    );

    for (const capabilityId of DISTANCE_CAPABILITIES) {
      if (!this.device.hasCapability(capabilityId)) continue;

      try {
        await this._updateCapabilityUnit(capabilityId, oldUnit, targetUnit);
      } catch (error) {
        this.logger.error(`Failed to update ${capabilityId} unit:`, error);
      }
    }
  }

  /**
   * Update a single capability's unit and convert its value if needed
   */
  private async _updateCapabilityUnit(
    capabilityId: string,
    oldUnit?: DistanceUnit,
    newUnit: DistanceUnit = this.getDistanceUnit()
  ): Promise<void> {
    const currentValue = this.device.getCapabilityValue(capabilityId);
    const currentOptions = this.device.getCapabilityOptions(capabilityId);
    const currentUnitInHomey =
      (currentOptions?.units as DistanceUnit) || TESLA_API_DISTANCE_UNIT;

    // Convert existing value if units changed and we have a valid value
    let convertedValue = currentValue;
    if (
      currentValue !== null &&
      currentValue !== undefined &&
      oldUnit &&
      oldUnit !== newUnit
    ) {
      convertedValue = DistanceConverter.convert(
        currentValue,
        oldUnit,
        newUnit
      );
      this.logger(
        `Converting ${capabilityId}: ${currentValue} ${oldUnit} → ${convertedValue} ${newUnit}`
      );
    }

    // Update capability options with new unit
    await this.device.setCapabilityOptions(capabilityId, { units: newUnit });

    // Set the converted value
    if (convertedValue !== null && convertedValue !== undefined) {
      await this.device.setCapabilityValue(capabilityId, convertedValue);
      this.logger(`Updated ${capabilityId}: ${convertedValue} ${newUnit}`);
    }
  }

  /**
   * Initialize distance capability units
   */
  async initializeDistanceUnits(): Promise<void> {
    await this.updateDistanceUnits();
  }

  /**
   * Update display settings to reflect current unit preferences
   */
  async updateDisplaySettings(): Promise<void> {
    const unit = this.getDistanceUnit();

    const distanceFormatText = unit === "mi" ? "Miles (mi)" : "Kilometers (km)";
    const temperatureFormatText = "Celsius (°C)"; // Tesla always uses Celsius internally

    try {
      await this.device.setSettings({
        distance_format_display: distanceFormatText,
        temperature_format_display: temperatureFormatText,
      });
    } catch (error) {
      this.logger.error("Failed to update display settings:", error);
    }
  }
}
