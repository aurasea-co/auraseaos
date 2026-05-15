import { Lock } from 'lucide-react'

export function OwnerOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
      <Lock size={10} />
      <span>Owner only</span>
    </span>
  )
}
