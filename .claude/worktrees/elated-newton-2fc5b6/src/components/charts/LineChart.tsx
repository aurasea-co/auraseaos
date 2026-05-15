'use client'

import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'

interface DatasetConfig {
  data: (number | null)[]
  color: string
  label: string
  dashed?: boolean
  fill?: boolean
  fillColor?: string
  yAxisID?: string
}

interface LineChartProps {
  labels: string[]
  datasets: DatasetConfig[]
  height?: number
  yFormatter?: (v: number) => string
  y2Formatter?: (v: number) => string
  targetValue?: number
  targetLabel?: string
  yMin?: number
  yMax?: number
  spanGaps?: boolean
}

export function LineChart({
  labels,
  datasets,
  height = 160,
  yFormatter = (v) => String(v),
  y2Formatter,
  targetValue,
  targetLabel,
  yMin,
  yMax,
  spanGaps = true,
}: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()

    const hasY2 = datasets.some((d) => d.yAxisID === 'y2')

    const chartDatasets = datasets.map((ds) => ({
      data: ds.data,
      borderColor: ds.color,
      backgroundColor: ds.fill && ds.fillColor ? ds.fillColor : 'transparent',
      fill: ds.fill || false,
      label: ds.label,
      borderWidth: ds.dashed ? 1 : 2,
      borderDash: ds.dashed ? [4, 3] : [],
      pointRadius: 0,
      tension: 0.3,
      yAxisID: ds.yAxisID || 'y',
      spanGaps,
    }))

    if (targetValue !== undefined) {
      chartDatasets.push({
        data: Array(labels.length).fill(targetValue),
        borderColor: 'rgba(0,0,0,0.2)',
        backgroundColor: 'transparent',
        fill: false,
        label: targetLabel || 'Target',
        spanGaps,
        borderWidth: 1,
        borderDash: [4, 3],
        pointRadius: 0,
        tension: 0,
        yAxisID: 'y',
      })
    }

    const scales: Record<string, object> = {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#9b9b9b', maxTicksLimit: 8, autoSkip: true } },
      y: {
        position: 'left',
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: { font: { size: 11 }, color: '#9b9b9b', callback: (v: string | number) => yFormatter(Number(v)) },
        ...(yMin !== undefined ? { min: yMin } : {}),
        ...(yMax !== undefined ? { max: yMax } : {}),
      },
    }

    if (hasY2 && y2Formatter) {
      scales.y2 = {
        position: 'right',
        grid: { display: false },
        ticks: { font: { size: 11 }, color: '#9b9b9b', callback: (v: string | number) => y2Formatter(Number(v)) },
      }
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { labels, datasets: chartDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${yFormatter(ctx.parsed.y ?? 0)}` } } },
        scales,
      },
    })

    return () => { chartRef.current?.destroy() }
  }, [labels, datasets, height, yFormatter, y2Formatter, targetValue, targetLabel, yMin, yMax, spanGaps])

  return (
    <div style={{ position: 'relative', height, minHeight: 140 }}>
      <canvas ref={canvasRef} />
    </div>
  )
}
