'use client'

import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'

interface BarChartProps {
  labels: string[]
  data: number[]
  colors: string[]
  height?: number
  yFormatter?: (v: number) => string
  targetValue?: number
  targetLabel?: string
}

export function BarChart({
  labels,
  data,
  colors,
  height = 160,
  yFormatter = (v) => String(v),
  targetValue,
  targetLabel,
}: BarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()

    const datasets: Chart['data']['datasets'] = [
      {
        data,
        backgroundColor: colors,
        borderRadius: 3,
        borderSkipped: false,
      },
    ]

    if (targetValue !== undefined) {
      datasets.push({
        type: 'line' as const,
        data: Array(labels.length).fill(targetValue),
        borderColor: 'rgba(0,0,0,0.2)',
        borderWidth: 1,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: false,
        label: targetLabel || 'Target',
      })
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => yFormatter(ctx.parsed.y ?? 0) } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#9b9b9b', maxTicksLimit: 8, autoSkip: true } },
          y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#9b9b9b', callback: (v) => yFormatter(Number(v)) } },
        },
      },
    })

    return () => { chartRef.current?.destroy() }
  }, [labels, data, colors, height, yFormatter, targetValue, targetLabel])

  return (
    <div style={{ position: 'relative', height, minHeight: 140 }}>
      <canvas ref={canvasRef} />
    </div>
  )
}
