import { useEffect, useState } from 'react'
import { catalogApi } from './catalog-api'

export type PredictionField = 'title' | 'author' | 'subject'
export const PREDICTION_DELAY_MS = 350

/**
 * Search predictions for a lookup field: asks the API once typing pauses, and only with 3 or more letters.
 * Failures just show no predictions; the lookup itself still works.
 */
export function usePredictions(field: PredictionField, text: string) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  useEffect(() => {
    if (text.replace(/[^\p{L}\p{N}]/gu, '').length < 3) { setSuggestions([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      Promise.resolve().then(() => catalogApi.predict(field, text, controller.signal))
        .then((result) => { if (!controller.signal.aborted) setSuggestions(result.suggestions.filter((value) => value !== text)) })
        .catch(() => { if (!controller.signal.aborted) setSuggestions([]) })
    }, PREDICTION_DELAY_MS)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [field, text])
  return suggestions
}

/** Native suggestion list for an input's `list` attribute. */
export function PredictionList({ id, suggestions }: { id: string; suggestions: string[] }) {
  return <datalist id={id} data-testid={id}>{suggestions.map((value) => <option key={value} value={value} />)}</datalist>
}
