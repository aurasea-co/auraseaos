'use client'

export function OnboardingProgress({ currentStep, totalSteps = 5 }: { currentStep: number; totalSteps?: number }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="flex items-center justify-center gap-2" style={{ marginBottom: 8 }}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i + 1 === currentStep ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i + 1 <= currentStep ? 'var(--color-accent)' : 'var(--color-bg-active)',
              transition: 'all 0.3s',
            }}
          />
        ))}
      </div>
      <p style={{ textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
        ขั้นตอน {currentStep} จาก {totalSteps}
      </p>
    </div>
  )
}
