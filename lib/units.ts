// Device unit settings derived from the car's own display preferences (Tesla gui_settings).
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

export = unitSettingsFromGui;
