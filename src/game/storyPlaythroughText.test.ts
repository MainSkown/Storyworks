import { describe, expect, it } from 'vitest'
import { MAX_STEPS } from './playthrough'
import { describeStoryStop, type StoryTextCtx } from './playthroughText'

const ctx: StoryTextCtx = {
  variableName: (id) => `Var ${id}`,
  opLabel: (op) => op,
  nodeLabel: (id) => `Node ${id}`,
  joiner: (m) => (m === 'all' ? 'and' : 'or'),
  itemTitle: (id) => `Item ${id}`,
  boxTitle: (id) => `Box ${id}`,
}
const P = 'game.storyPlay.stop'

describe('describeStoryStop', () => {
  it('names the item for broken links', () => {
    expect(describeStoryStop({ kind: 'broken-link', reason: 'item-missing', itemId: 'a' }, ctx)).toEqual({
      key: `${P}.itemMissing`,
      params: {},
    })
    expect(describeStoryStop({ kind: 'broken-link', reason: 'item-trashed', itemId: 'a' }, ctx)).toEqual({
      key: `${P}.itemTrashed`,
      params: { item: 'Item a' },
    })
    expect(describeStoryStop({ kind: 'broken-link', reason: 'node-missing', itemId: 'a' }, ctx)).toEqual({
      key: `${P}.nodeMissing`,
      params: { item: 'Item a' },
    })
  })

  it('names the box for broken boxes and blocked arrows', () => {
    expect(describeStoryStop({ kind: 'broken-box', boxId: 'b' }, ctx)).toEqual({
      key: `${P}.brokenBox`,
      params: { box: 'Box b' },
    })
    expect(describeStoryStop({ kind: 'no-arrow-passes', boxId: 'b' }, ctx)).toEqual({
      key: `${P}.noArrowPasses`,
      params: { box: 'Box b' },
    })
  })

  it('reports arrow condition problems by box and variable', () => {
    expect(
      describeStoryStop({ kind: 'undefined-variable', variableId: 'v', boxId: 'b' }, ctx),
    ).toEqual({ key: `${P}.arrowUndefinedVariable`, params: { box: 'Box b', variable: 'Var v' } })
    expect(describeStoryStop({ kind: 'type-mismatch', variableId: 'v', boxId: 'b' }, ctx)).toEqual({
      key: `${P}.arrowTypeMismatch`,
      params: { box: 'Box b', variable: 'Var v' },
    })
  })

  it('leaves engine reasons to the single-conversation wording', () => {
    expect(describeStoryStop({ kind: 'step-limit' }, ctx)).toEqual({
      key: 'game.conversation.playthrough.stop.stepLimit',
      params: { max: MAX_STEPS },
    })
    expect(
      describeStoryStop({ kind: 'undefined-variable', variableId: 'v', nodeId: 'n' }, ctx),
    ).toEqual({
      key: 'game.conversation.playthrough.stop.undefinedVariable',
      params: { node: 'Node n', variable: 'Var v' },
    })
  })
})
