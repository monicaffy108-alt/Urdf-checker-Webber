export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** 在 candidates 里找最像 name 的一个；差得太远、或者有并列最优时返回 null */
export function suggest(name: string, candidates: Iterable<string>): string | null {
  const key = name.toLowerCase()
  let best: string | null = null
  let bestDist = Infinity
  let tie = false
  for (const c of candidates) {
    const d = levenshtein(key, c.toLowerCase())
    if (d < bestDist) {
      best = c
      bestDist = d
      tie = false
    } else if (d === bestDist) {
      tie = true
    }
  }
  if (best === null || tie) return null
  const limit = Math.max(1, Math.min(3, Math.floor(name.length / 4)))
  return bestDist <= limit ? best : null
}

export const fmtNum = (n: number) => String(Number(n.toFixed(4)))
