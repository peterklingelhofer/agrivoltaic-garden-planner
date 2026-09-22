/**
 * What the storage panel says is kept, and what forgetting it costs.
 *
 * In their own module. They do not sit beside the component: both sentences depend on
 * `__AGENT_ENABLED__` and a computed export beside a component breaks fast refresh, which the
 * `useComponentExportOnlyModules` rule allows only for a plain constant.
 *
 * This is the raw define. It is not the `AGENT_ENABLED` export, for the reason `App.tsx` gives: a const
 * re-exported from another module does not fold across the boundary. Here it also has to be
 * literally TRUE of the build the sentence ships in, and a deployed build carries no agent, no
 * chat surface and no transcript
 */

/** Named because it exists, and because it is made of somebody's own sentences */
const TRANSCRIPT = 'anything you have said to the agent'

/**
 * What is kept, piece by piece.
 *
 * The transcript is among them, and it is real: `TRANSCRIPT_KEY` holds every sentence typed on the
 * chat surface and every reply, in this browser, until the design is forgotten. A panel whose whole
 * job is to say what is kept, listing everything except the one thing made of a person's own words,
 * is the disclosure failing at the only thing it does
 */
export const KEPT = __AGENT_ENABLED__
  ? `Your location, plot, arrays, beds, plantings and preferences, and ${TRANSCRIPT}, are kept in this browser alone. Nothing is uploaded and nothing is shared`
  : 'Your location, plot, arrays, beds, plantings and preferences are kept in this browser alone. Nothing is uploaded and nothing is shared'

/**
 * What "Forget saved design" actually costs, said before it is paid.
 *
 * The label understates it by a wide margin. `clearDesign` does not only drop the copy in this
 * browser: it puts the whole application back to `initialData()`, so the plot, the beds, every
 * planting in them, the panel rows and the resolved site all go with it, and nothing in this app
 * can undo that. Naming the pieces one by one, said in full and never abbreviated to
 * "everything", is deliberate; a grower who
 * has spent an afternoon on four beds should be able to recognise their own afternoon in it.
 *
 * The conversation goes too, because `removeDesign` takes `TRANSCRIPT_KEY` with the design
 */
export const FORGET_COST = __AGENT_ENABLED__
  ? `This clears the copy kept in this browser AND puts the app back to an empty starting plot: your plot outline, every bed, everything planted in them, the panel rows and the site you looked up all go, along with ${TRANSCRIPT}. Nothing here can bring them back.`
  : 'This clears the copy kept in this browser AND puts the app back to an empty starting plot: your plot outline, every bed, everything planted in them, the panel rows and the site you looked up all go. Nothing here can bring them back.'
