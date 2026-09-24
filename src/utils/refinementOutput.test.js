import { describe, expect, it } from 'vitest'
import { cleanRefinementOutput, cleanSpeechArtifacts, finalizeTransformOutput, removeEmDashes } from './refinementOutput'

describe('cleanRefinementOutput', () => {
  it('trims whitespace without changing content', () => {
    expect(cleanRefinementOutput('  Keep this exactly.  ')).toBe('Keep this exactly.')
  })

  it('removes common assistant labels', () => {
    expect(cleanRefinementOutput('Refined text: Hello there.')).toBe('Hello there.')
    expect(cleanRefinementOutput('Output: Hello there.')).toBe('Hello there.')
    expect(cleanRefinementOutput('Result: Hello there.')).toBe('Hello there.')
  })

  it('removes chatty preambles without rewriting the output', () => {
    expect(cleanRefinementOutput('Here is the cleaned transcript: Hello there.')).toBe('Hello there.')
    expect(cleanRefinementOutput('Here\'s the refined output: Hello there.')).toBe('Hello there.')
    expect(cleanRefinementOutput('Here\'s a polished version of the text, following your instructions:\nHello there.')).toBe('Hello there.')
  })

  it('does not force bullet formatting', () => {
    expect(cleanRefinementOutput('This is prose. It stays prose.')).toBe('This is prose. It stays prose.')
  })
})

describe('cleanSpeechArtifacts', () => {
  it('removes standalone filler sounds without rewriting other words', () => {
    expect(cleanSpeechArtifacts('Gemma is using way too much um latency right now.'))
      .toBe('Gemma is using way too much latency right now.')
    expect(cleanSpeechArtifacts('I think uh using the main window is fine.'))
      .toBe('I think using the main window is fine.')
  })

  it('cleans filler punctuation and spacing', () => {
    expect(cleanSpeechArtifacts('Um, this is still the same sentence.'))
      .toBe('this is still the same sentence.')
    expect(cleanSpeechArtifacts('This is uh,  still okay.'))
      .toBe('This is still okay.')
  })
})

describe('finalizeTransformOutput', () => {
  it('adds terminal punctuation to prose transform output', () => {
    expect(finalizeTransformOutput('this is a complete thought'))
      .toBe('This is a complete thought.')
  })

  it('does not add a trailing period to bullet lists', () => {
    expect(finalizeTransformOutput('- One thing\n- Another thing'))
      .toBe('- One thing\n- Another thing')
  })

  it('does not make semantic decisions after the model returns', () => {
    expect(finalizeTransformOutput('- Make a list.\n- Book the room.\n- Invite the team.'))
      .toBe('- Make a list.\n- Book the room.\n- Invite the team.')
  })

  it('leaves number wording unchanged after refinement', () => {
    expect(finalizeTransformOutput('Log four hundred and four errors separately from five hundred errors.'))
      .toBe('Log four hundred and four errors separately from five hundred errors.')
  })

  it('does not silently apply corrections after refinement', () => {
    expect(finalizeTransformOutput('Tell Sam the review is on Friday, actually make that Monday because Friday is a holiday.'))
      .toBe('Tell Sam the review is on Friday, actually make that Monday because Friday is a holiday.')
  })

  it('leaves discourse editing to the checked model candidate', () => {
    expect(finalizeTransformOutput('So, check the latest test run that I did. I first dictated with smart format, then I refined using concise and organize as well. And yeah, like I think it’s working much better now, but some things are still being missed in refinement. I’m giving you what I got from WhisperFlow when I spoke the same thing, right? So that we can review and see what our refinement is lacking basically.'))
      .toBe('So, check the latest test run that I did. I first dictated with smart format, then I refined using concise and organize as well. And yeah, like I think it’s working much better now, but some things are still being missed in refinement. I’m giving you what I got from WhisperFlow when I spoke the same thing, right? So that we can review and see what our refinement is lacking basically.')
  })

  it('keeps meaningful uses of so, like, right, and basically', () => {
    expect(finalizeTransformOutput('The request was late, so I moved it. It looks like paper. The deadline is Friday, right? It is basically a cache.'))
      .toBe('The request was late, so I moved it. It looks like paper. The deadline is Friday, right? It is basically a cache.')
  })
})

describe('removeEmDashes', () => {
  it('turns em dashes between words into commas', () => {
    expect(removeEmDashes('Send it today \u2014 before the review.')).toBe('Send it today, before the review.')
    expect(removeEmDashes('Two things\u2014speed and cost.')).toBe('Two things, speed and cost.')
  })

  it('drops dangling dashes and never doubles punctuation', () => {
    expect(removeEmDashes('\u2014 note this\nand this \u2014')).toBe('note this\nand this')
    expect(removeEmDashes('Wait \u2014, really.')).toBe('Wait, really.')
  })

  it('is applied to finalized transform output', () => {
    expect(finalizeTransformOutput('we ship friday \u2014 if tests pass')).toBe('We ship friday, if tests pass.')
  })
})
