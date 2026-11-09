/** Environment bindings may be booleans in TOML or strings in the dashboard. */
export function carbonWarningEnabled(value) {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

export function publicFeatureFlags(env) {
  return { showCarbonWarning: carbonWarningEnabled(env.SHOW_CARBON_WARNING) };
}
