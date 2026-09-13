/**
 * Whether the conversational agent exists in this build.
 *
 * Off in a deployed build unless somebody asks for it, on while developing, and overridable both
 * ways.
 *
 * Note that the `dev` script passes `VITE_AGENT=${VITE_AGENT:-off}`, so the dev SERVER is off by
 * default even though the rule below says a dev build is on: the author did not want the panel in
 * the way while walking the app. `VITE_AGENT=on bun run dev` puts it back, and the rule is left
 * alone because the unit suite and the e2e webServer both still want the dev default to be on.
 *
 * The asymmetry is the point: the agent is new, it is the only surface in the app whose
 * output is not derived from a cited value by a path a test can follow, and it should not reach a
 * visitor because a branch got merged. Shipping it is a decision somebody makes on purpose, by
 * setting the variable, rather than the default that arrives with a push to main.
 *
 * This file holds the RULE and nothing else, so that `vite.config.ts` and `test/setup.ts` can
 * import it and call it in node to compute what to inject. The answer itself is the global
 * `__AGENT_ENABLED__`, declared in `src/vite-env.d.ts` and substituted at each use site.
 *
 * It arrives that way rather than as an exported const because the value has to be statically
 * FOLDABLE and not merely correct, and two earlier attempts were correct and did not fold: one
 * computed it with a function call, and one exported it as a const that no minifier propagates
 * across a module boundary. Both shipped a 23 kB panel chunk into a build with the agent switched
 * off. `flag-fold.test.ts` is what holds the third version in place
 */
export interface AgentEnv {
  readonly VITE_AGENT?: string | undefined
  readonly DEV: boolean
}

/**
 * The rule, as a function, so it can be tested against every combination rather than trusted.
 *
 * `on` and `off` are the only values that mean anything, and anything else is treated as unset:
 * a typo in a CI variable must not be the thing that decides whether a feature ships, and
 * failing closed in production is the safe direction for it to fail
 */
export const agentEnabled = (env: AgentEnv): boolean => {
  if (env.VITE_AGENT === 'on') return true
  if (env.VITE_AGENT === 'off') return false
  return env.DEV
}

/**
 * The answer for THIS build, injected as a literal by `vite.config.ts` and set as a global by
 * `test/setup.ts`, both of which call `agentEnabled` above to compute it. See
 * `src/vite-env.d.ts` for why it arrives this way rather than being computed here from
 * `import.meta.env`
 */
