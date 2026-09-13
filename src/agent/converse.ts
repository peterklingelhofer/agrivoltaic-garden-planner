import { act, type ActContext } from './act'
import { clausesOf } from './clauses'
import { nearMisses, routeLexically } from './lexical'
import { reply, type AgentReply } from './reply'
import type { RouteContext, Understander, Understanding } from './understand'

/**
 * One typed sentence, from words to a reply, including the sentences that ask for two things.
 *
 * It exists because `route` and `act` are each about ONE request and a person is not. "Take out
 * the tomatoes and fill the beds" is two, and answering the first while dropping the second is
 * worse than understanding neither: nothing on screen says the second half was ignored.
 *
 * Kept out of the panel so the whole path -- split, route each, act on each in order, merge --
 * is testable without mounting anything, which is the same reason everything else in this
 * directory is where it is
 */

export interface Conversation {
  readonly reply: AgentReply
  /** What each clause was taken to mean, in order, for a transcript or a test to read */
  readonly understood: readonly Understanding[]
}

/**
 * The most requests one sentence may carry.
 *
 * Three, because beyond that it is not a sentence somebody typed, it is a paste, and running six
 * store mutations off one press is the kind of thing that should need six presses
 */
export const MAX_CLAUSES = 3

export const converse = async (
  text: string,
  context: RouteContext,
  understander: Understander,
  actContext: ActContext,
): Promise<Conversation> => {
  const clauses = clausesOf(text, {
    // a half stands alone when the router makes something of it, which is the only honest test
    /*
      Asked of the LEXICAL router, whichever one is in use, and that is deliberate rather than a
      limitation. Deciding whether to split has to happen before any routing, an embedding lookup
      is asynchronous, and asking the model twice per candidate boundary to decide whether to ask
      it twice is a poor trade for a decision this conservative. The lexical router refusing a
      half is exactly the signal wanted: it means the half is not a sentence anybody would say
    */
    standsAlone: (part) => routeLexically(part, context) !== null,
  }).slice(0, MAX_CLAUSES)

  const understood: Understanding[] = []
  const replies: AgentReply[] = []
  for (const clause of clauses) {
    const understanding = await understander.route(clause, context)
    if (understanding === null) continue
    understood.push(understanding)
    /*
      A tie is offered and never broken. The router says so by handing back more than one
      reading, and the one thing that must not happen then is a store mutation chosen by a
      rounding difference: "throw it away and begin afresh" read `start-over` at 0.501 and
      `remove-planting` at 0.456, and one of those forgets the whole design.

      `act` is not called at all, so this costs nothing and undoes nothing
    */
    replies.push(
      understanding.alternatives.length > 0
        ? reply([{ kind: 'unsure', near: understanding.alternatives }], {
            offer: understanding.alternatives,
          })
        : await act(understanding, actContext),
    )
  }

  if (replies.length === 0) {
    const near = nearMisses(text, context)
    return {
      reply: reply([{ kind: 'not-understood', near }], {
        offer: near.length > 0 ? near : ['help', 'propose-designs'],
      }),
      understood,
    }
  }
  /*
    Merged in order, and the LAST reply's chips win. Each clause was carried out in turn, so what
    to offer next follows from where the sentence ended rather than from where it started
  */
  return {
    reply: {
      utterances: replies.flatMap((entry) => entry.utterances),
      did: replies.flatMap((entry) => entry.did),
      offer: replies[replies.length - 1]?.offer ?? [],
    },
    understood,
  }
}
