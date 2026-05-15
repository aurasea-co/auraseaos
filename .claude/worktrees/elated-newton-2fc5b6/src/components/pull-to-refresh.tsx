'use client'

import { useRef, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw } from 'lucide-react'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const t = useTranslations('common')

  const threshold = 60

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current?.scrollTop === 0) {
      startY.current = e.touches[0].clientY
      setPulling(true)
    }
  }, [])

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling) return
      const diff = e.touches[0].clientY - startY.current
      if (diff > 0) {
        setPullDistance(Math.min(diff * 0.4, 100))
      }
    },
    [pulling]
  )

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true)
      await onRefresh()
      setRefreshing(false)
    }
    setPulling(false)
    setPullDistance(0)
  }, [pullDistance, refreshing, onRefresh])

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {/* Pull indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center py-2 pull-indicator"
          style={{ height: refreshing ? 40 : pullDistance }}
        >
          <RefreshCw
            size={18}
            className={`text-slate-400 ${
              refreshing ? 'animate-spin' : ''
            } ${pullDistance >= threshold ? 'text-blue-500' : ''}`}
          />
          {!refreshing && pullDistance > 20 && (
            <span className="text-xs text-slate-400 ml-2">
              {pullDistance >= threshold ? '↑' : t('pullToRefresh')}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
