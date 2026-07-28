import { Config } from "../../src/core/configuration/Config";

/**
 * A partial replacement for the real `Config`. Keys are Config method names,
 * values are functions with the same signature.
 */
export type ConfigOverrides = Partial<Config>;

/**
 * Builds the overrides for one run. Receives the untouched config so a variant
 * can wrap the real behaviour instead of restating it:
 *
 *   (base) => ({ unitInfo: (t) => ({ ...base.unitInfo(t), cost: … }) })
 *
 * Calling `base.unitInfo()` gives the *original* value; calling it on the
 * overridden config would recurse.
 */
export type OverrideFactory = (base: Config) => ConfigOverrides;

/**
 * Returns a Config that behaves like `base` except for the overridden methods.
 *
 * Every method is rebound to the proxy rather than to the target, so that
 * Config's own internal `this.foo()` calls also see the overrides. Without
 * that, overriding `defensePostDefenseBonus()` would silently have no effect
 * on `attackLogic()`, which reads it through `this` — a variant that appears
 * to change nothing is worse than no tool at all.
 */
export function withOverrides(
  base: Config,
  overrides: ConfigOverrides,
): Config {
  if (Reflect.ownKeys(overrides).length === 0) return base;

  const bound = new Map<PropertyKey, unknown>();
  const proxy: Config = new Proxy(base, {
    get(target, prop) {
      if (Object.prototype.hasOwnProperty.call(overrides, prop)) {
        return (overrides as Record<PropertyKey, unknown>)[prop];
      }
      const value = Reflect.get(target, prop);
      if (typeof value !== "function") return value;
      let fn = bound.get(prop);
      if (fn === undefined) {
        fn = (value as (...args: unknown[]) => unknown).bind(proxy);
        bound.set(prop, fn);
      }
      return fn;
    },
  });
  return proxy;
}
