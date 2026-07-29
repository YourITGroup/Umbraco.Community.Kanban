/**
 * The line under a card's child list, or nothing when there is no more to say.
 *
 * A card lists a fixed few children and never pages, so the rest are reported as a count. The count
 * itself may be a lower bound — the board caps how many children it reads across the whole board —
 * which is why an exact overflow and a bounded one read differently, exactly as a lane's badge
 * distinguishes "12" from "12+".
 */
export function formatChildOverflow(childTotal: number, shown: number, isExact: boolean): string | undefined {
  const remaining = childTotal - shown;

  if (remaining > 0) return isExact ? `+${remaining} more` : `+${remaining} or more`;

  // Nothing beyond what is shown was counted, but a capped count cannot promise that is all there is.
  return isExact ? undefined : 'and more';
}
