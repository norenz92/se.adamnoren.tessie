/**
 * Capability Updater
 * Handles updating device capabilities from various data sources
 */

import Homey from "homey";
import { ProcessedTelemetryData } from "../../../tessie/telemetry-processor";
import { GetStateResponse } from "../../../tessie/sdk/types";
import {
  DistanceConverter,
  DistanceHandler,
  DistanceUnit,
} from "./distance-handler";

const TESLA_API_DISTANCE_UNIT = "mi" as const;

/**
 * Handler for updating device capabilities from polling and telemetry data
 */
export class CapabilityUpdater {
  private device: Homey.Device;
  private logger: any;
  private distanceHandler: DistanceHandler;

  constructor(
    device: Homey.Device,
    logger: any,
    distanceHandler: DistanceHandler
  ) {
    this.device = device;
    this.logger = logger;
    this.distanceHandler = distanceHandler;
  }

  /**
   * Update device capabilities from API state response (polling)
   */
  async updateFromState(data: GetStateResponse): Promise<void> {
    try {

      // Battery & Charging
      if (this.device.hasCapability("measure_battery")) {
        await this.device.setCapabilityValue(
          "measure_battery",
          data.charge_state.battery_level
        );
      }

      // Odometer with unit conversion
      if (this.device.hasCapability("meter_car_odo")) {
        const targetUnit = this.distanceHandler.getDistanceUnit();
        const convertedOdometer = DistanceConverter.convert(
          data.vehicle_state.odometer,
          TESLA_API_DISTANCE_UNIT,
          targetUnit
        );
        await this.device.setCapabilityOptions("meter_car_odo", {
          units: targetUnit,
        });
        await this.device.setCapabilityValue(
          "meter_car_odo",
          Math.round(convertedOdometer)
        );
      }

      // Charging status
      if (this.device.hasCapability("charging_on")) {
        await this.device.setCapabilityValue(
          "charging_on",
          data.charge_state.charging_state === "Charging"
        );
      }

      // Charging current
      if (this.device.hasCapability("measure_charge_current_max")) {
        await this.device.setCapabilityValue(
          "measure_charge_current_max",
          data.charge_state.charge_amps
        );
      }

      // Charge energy added
      if (this.device.hasCapability("measure_charge_energy_added")) {
        await this.device.setCapabilityValue(
          "measure_charge_energy_added",
          data.charge_state.charge_energy_added
        );
      }

      // Charge limit
      if (this.device.hasCapability("measure_charge_limit_soc")) {
        await this.device.setCapabilityValue(
          "measure_charge_limit_soc",
          data.charge_state.charge_limit_soc
        );
      }

      // Minutes to full charge
      if (this.device.hasCapability("measure_charge_minutes_to_full_charge")) {
        await this.device.setCapabilityValue(
          "measure_charge_minutes_to_full_charge",
          data.charge_state.minutes_to_full_charge
        );
      }

      // Charge phases
      if (this.device.hasCapability("measure_charge_phases")) {
        await this.device.setCapabilityValue(
          "measure_charge_phases",
          data.charge_state.charger_phases
        );
      }

      // Charger power
      if (this.device.hasCapability("measure_charge_power")) {
        await this.device.setCapabilityValue(
          "measure_charge_power",
          data.charge_state.charger_power
        );
      }

      // Charger voltage
      if (this.device.hasCapability("measure_charge_voltage")) {
        await this.device.setCapabilityValue(
          "measure_charge_voltage",
          data.charge_state.charger_voltage
        );
      }

      // Climate - inside temperature
      if (this.device.hasCapability("measure_climate_temperature_in")) {
        await this.device.setCapabilityValue(
          "measure_climate_temperature_in",
          data.climate_state.inside_temp
        );
      }

      // Climate - outside temperature
      if (this.device.hasCapability("measure_climate_temperature_out")) {
        await this.device.setCapabilityValue(
          "measure_climate_temperature_out",
          data.climate_state.outside_temp
        );
      }

      // Battery power
      if (this.device.hasCapability("measure_io_battery_power")) {
        await this.device.setCapabilityValue(
          "measure_io_battery_power",
          data.drive_state.power
        );
      }

      // Location - heading
      if (this.device.hasCapability("measure_location_heading")) {
        await this.device.setCapabilityValue(
          "measure_location_heading",
          data.drive_state.heading
        );
      }

      // Location - latitude
      if (
        data.drive_state?.latitude &&
        this.device.hasCapability("measure_location_latitude")
      ) {
        await this.device.setCapabilityValue(
          "measure_location_latitude",
          data.drive_state.latitude
        );
      }

      // Location - longitude
      if (this.device.hasCapability("measure_location_longitude")) {
        await this.device.setCapabilityValue(
          "measure_location_longitude",
          data.drive_state.longitude
        );
      }

      // Speed with unit conversion
      if (this.device.hasCapability("measure_speed")) {
        const targetUnit = this.distanceHandler.getDistanceUnit();
        const convertedSpeed = this.distanceHandler.convertSpeed(
          data.drive_state.speed || 0
        );
        await this.device.setCapabilityOptions("measure_speed", {
          units: targetUnit === "km" ? "km/h" : "mph",
        });
        await this.device.setCapabilityValue("measure_speed", convertedSpeed);
      }

      // SOC level
      if (this.device.hasCapability("measure_soc_level")) {
        await this.device.setCapabilityValue(
          "measure_soc_level",
          data.charge_state.battery_level
        );
      }

      // Range - estimated with unit conversion
      if (this.device.hasCapability("measure_soc_range_estimated")) {
        const targetUnit = this.distanceHandler.getDistanceUnit();
        const convertedRange = DistanceConverter.convert(
          data.charge_state.est_battery_range || 0,
          TESLA_API_DISTANCE_UNIT,
          targetUnit
        );

        await this.device.setCapabilityOptions("measure_soc_range_estimated", {
          units: targetUnit,
        });
        await this.device.setCapabilityValue(
          "measure_soc_range_estimated",
          Math.round(convertedRange)
        );
      }

      // Range - ideal with unit conversion
      if (this.device.hasCapability("measure_soc_range_ideal")) {
        const targetUnit = this.distanceHandler.getDistanceUnit();
        const convertedRange = DistanceConverter.convert(
          data.charge_state.ideal_battery_range,
          TESLA_API_DISTANCE_UNIT,
          targetUnit
        );

        await this.device.setCapabilityOptions("measure_soc_range_ideal", {
          units: targetUnit,
        });
        await this.device.setCapabilityValue(
          "measure_soc_range_ideal",
          Math.round(convertedRange)
        );
      }

      // Usable battery level
      if (this.device.hasCapability("measure_soc_usable")) {
        await this.device.setCapabilityValue(
          "measure_soc_usable",
          data.charge_state.usable_battery_level
        );
      }
    } catch (error: any) {
      this.logger.error("Error updating device from state:", error);
    }
  }

  /**
   * Update device capabilities from real-time telemetry data
   */
  async updateFromTelemetry(telemetry: ProcessedTelemetryData): Promise<void> {
    try {
      // Battery & Charging
      if (
        telemetry.soc !== undefined &&
        this.device.hasCapability("measure_soc_level")
      ) {
        await this.device.setCapabilityValue(
          "measure_soc_level",
          telemetry.soc
        );
      }

      if (
        telemetry.batteryLevel !== undefined &&
        this.device.hasCapability("measure_battery")
      ) {
        await this.device.setCapabilityValue(
          "measure_battery",
          telemetry.batteryLevel
        );
      }

      if (
        telemetry.idealBatteryRange !== undefined &&
        this.device.hasCapability("measure_soc_range_ideal")
      ) {
        const targetUnit = this.distanceHandler.getDistanceUnit();
        const convertedRange = DistanceConverter.convert(
          telemetry.idealBatteryRange || 0,
          TESLA_API_DISTANCE_UNIT,
          targetUnit
        );
        await this.device.setCapabilityOptions("measure_soc_range_ideal", {
          units: targetUnit,
        });
        await this.device.setCapabilityValue(
          "measure_soc_range_ideal",
          Math.round(convertedRange)
        );
      }

      if (
        telemetry.estimatedBatteryRange !== undefined &&
        this.device.hasCapability("measure_soc_range_estimated")
      ) {
        const targetUnit = this.distanceHandler.getDistanceUnit();
        const convertedRange = DistanceConverter.convert(
          telemetry.estimatedBatteryRange || 0,
          TESLA_API_DISTANCE_UNIT,
          targetUnit
        );
        await this.device.setCapabilityOptions("measure_soc_range_estimated", {
          units: targetUnit,
        });
        await this.device.setCapabilityValue(
          "measure_soc_range_estimated",
          Math.round(convertedRange)
        );
      }

      if (
        telemetry.ratedRange !== undefined &&
        this.device.hasCapability("measure_soc_range_ideal")
      ) {
        const targetUnit = this.distanceHandler.getDistanceUnit();
        const convertedRange = DistanceConverter.convert(
          telemetry.ratedRange || 0,
          TESLA_API_DISTANCE_UNIT,
          targetUnit
        );
        await this.device.setCapabilityOptions("measure_soc_range_ideal", {
          units: targetUnit,
        });
        await this.device.setCapabilityValue(
          "measure_soc_range_ideal",
          Math.round(convertedRange)
        );
      }

      if (
        telemetry.energyRemaining !== undefined &&
        this.device.hasCapability("measure_energy_remaining")
      ) {
        await this.device.setCapabilityValue(
          "measure_energy_remaining",
          telemetry.energyRemaining
        );
      }

      // Charging Status
      if (
        telemetry.chargeState !== undefined &&
        this.device.hasCapability("charging_on")
      ) {
        await this.device.setCapabilityValue(
          "charging_on",
          telemetry.chargeState === "Charging"
        );
      }

      if (
        telemetry.acChargingPower !== undefined &&
        this.device.hasCapability("measure_charge_power")
      ) {
        await this.device.setCapabilityValue(
          "measure_charge_power",
          telemetry.acChargingPower
        );
      }

      if (
        telemetry.dcChargingPower !== undefined &&
        this.device.hasCapability("measure_charge_power")
      ) {
        await this.device.setCapabilityValue(
          "measure_charge_power",
          telemetry.dcChargingPower
        );
      }

      if (
        telemetry.chargeAmps !== undefined &&
        this.device.hasCapability("measure_charge_current_max")
      ) {
        await this.device.setCapabilityValue(
          "measure_charge_current_max",
          telemetry.chargeAmps
        );
      }

      // Climate
      if (
        telemetry.insideTemp !== undefined &&
        this.device.hasCapability("measure_climate_temperature_in")
      ) {
        await this.device.setCapabilityValue(
          "measure_climate_temperature_in",
          telemetry.insideTemp
        );
      }

      if (
        telemetry.outsideTemp !== undefined &&
        this.device.hasCapability("measure_climate_temperature_out")
      ) {
        await this.device.setCapabilityValue(
          "measure_climate_temperature_out",
          telemetry.outsideTemp
        );
      }

      // Location
      if (
        telemetry.latitude !== undefined &&
        this.device.hasCapability("measure_location_latitude")
      ) {
        await this.device.setCapabilityValue(
          "measure_location_latitude",
          telemetry.latitude
        );
      }

      if (
        telemetry.longitude !== undefined &&
        this.device.hasCapability("measure_location_longitude")
      ) {
        await this.device.setCapabilityValue(
          "measure_location_longitude",
          telemetry.longitude
        );
      }

      // Vehicle State
      if (
        telemetry.odometer !== undefined &&
        this.device.hasCapability("meter_car_odo")
      ) {
        const targetUnit = this.distanceHandler.getDistanceUnit();
        const convertedOdometer = DistanceConverter.convert(
          telemetry.odometer || 0,
          TESLA_API_DISTANCE_UNIT,
          targetUnit
        );
        await this.device.setCapabilityOptions("meter_car_odo", {
          units: targetUnit,
        });
        await this.device.setCapabilityValue(
          "meter_car_odo",
          Math.round(convertedOdometer)
        );
      }

      if (
        telemetry.gpsHeading !== undefined &&
        this.device.hasCapability("measure_location_heading")
      ) {
        await this.device.setCapabilityValue(
          "measure_location_heading",
          telemetry.gpsHeading
        );
      }

      // Battery Health
      if (
        telemetry.packVoltage !== undefined &&
        this.device.hasCapability("measure_battery_voltage")
      ) {
        await this.device.setCapabilityValue(
          "measure_battery_voltage",
          telemetry.packVoltage
        );
      }

      if (
        telemetry.packCurrent !== undefined &&
        this.device.hasCapability("measure_battery_current")
      ) {
        await this.device.setCapabilityValue(
          "measure_battery_current",
          telemetry.packCurrent
        );
      }

      if (
        telemetry.moduleTempMin !== undefined &&
        this.device.hasCapability("measure_battery_temp_min")
      ) {
        await this.device.setCapabilityValue(
          "measure_battery_temp_min",
          telemetry.moduleTempMin
        );
      }

      if (
        telemetry.moduleTempMax !== undefined &&
        this.device.hasCapability("measure_battery_temp_max")
      ) {
        await this.device.setCapabilityValue(
          "measure_battery_temp_max",
          telemetry.moduleTempMax
        );
      }

      // Log connectivity if available
      if (telemetry.connectivity !== undefined) {
        this.logger(
          `Telemetry connectivity: ${telemetry.connectivity.status}`,
          telemetry.connectivity
        );
      }

      // Log alerts if present
      if (telemetry.alerts !== undefined && telemetry.alerts.length > 0) {
        this.logger(
          `Vehicle alerts: ${telemetry.alerts.map((a) => a.name).join(", ")}`
        );
      }
    } catch (error: any) {
      this.logger("Error updating device from telemetry:", error);
    }
  }
}
