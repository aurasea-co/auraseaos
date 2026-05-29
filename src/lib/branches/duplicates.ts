// Branch-name duplicate detection.
//
// Two branches inside the same org are flagged as a possible
// duplicate if their normalised names are identical. Normalisation:
//   1. Lowercase
//   2. Replace any of - – — (hyphen, en-dash, em-dash) with a space
//   3. Collapse runs of whitespace to a single space
//   4. Trim
//
// Matches the real-world artefact we're cleaning up:
//   "Resort A — Bangkok" → "resort a bangkok"
//   "Resort A- Bangkok"  → "resort a bangkok"
// Both share a normalised value and get the badge.

export function normaliseBranchName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‐-―\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function findDuplicateBranchIds<
  T extends { branchId: string; branchName: string; organizationId: string },
>(rows: T[]): Set<string> {
  const buckets = new Map<string, string[]>() // key: orgId|normalisedName → [branchId, ...]
  for (const r of rows) {
    const key = `${r.organizationId}|${normaliseBranchName(r.branchName)}`
    const list = buckets.get(key) || []
    list.push(r.branchId)
    buckets.set(key, list)
  }
  const duplicates = new Set<string>()
  Array.from(buckets.values()).forEach((list) => {
    if (list.length > 1) {
      for (const id of list) duplicates.add(id)
    }
  })
  return duplicates
}
