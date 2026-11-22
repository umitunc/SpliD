import { Check } from 'lucide-react';
import { useAppStore, type WizardStep } from '../store/useAppStore';

const STEPS: { step: WizardStep; title: string; subtitle: string }[] = [
  { step: 1, title: 'Model', subtitle: 'Yükle & Ölç' },
  { step: 2, title: 'Boyut', subtitle: 'Ölçekle' },
  { step: 3, title: 'Tabla', subtitle: 'Yazıcı Seç' },
  { step: 4, title: 'Böl', subtitle: 'Dışa Aktar' }
];

export function WizardStepper() {
  const { currentStep, rawMesh, splitResult, setCurrentStep } = useAppStore();

  return (
    <div className="border-b border-[var(--uxigl-border)] px-4 py-3">
      <div className="uxigl-sunken grid grid-cols-4 gap-1.5 rounded-2xl p-1">
        {STEPS.map(({ step, title, subtitle }) => {
          const isActive = currentStep === step;
          const isLocked = step > 1 && !rawMesh;
          const isCompleted =
            (step === 1 && Boolean(rawMesh) && currentStep > 1) ||
            (step === 2 && Boolean(rawMesh) && currentStep > 2) ||
            (step === 3 && Boolean(rawMesh) && currentStep > 3) ||
            (step === 4 && Boolean(splitResult));

          return (
            <button
              key={step}
              type="button"
              disabled={isLocked}
              onClick={() => setCurrentStep(step)}
              className={`group relative flex flex-col items-center rounded-xl px-1.5 py-2 text-center transition-all ${
                isActive
                  ? 'uxigl-btn-filled shadow-md'
                  : isLocked
                  ? 'uxigl-text-muted cursor-not-allowed opacity-45'
                  : 'uxigl-text-secondary hover:bg-[var(--uxigl-surface-tonal-hover)]'
              }`}
            >
              <div className="flex items-center gap-1">
                {isCompleted && !isActive ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                ) : (
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                      isActive
                        ? 'bg-white/25 text-white'
                        : 'bg-[var(--uxigl-surface-tonal)] uxigl-text-muted'
                    }`}
                  >
                    {step}
                  </span>
                )}
                <span className="text-[11px] font-semibold tracking-tight">{title}</span>
              </div>
              <span
                className={`mt-0.5 text-[9px] ${
                  isActive ? 'text-white/85' : 'uxigl-text-muted'
                }`}
              >
                {subtitle}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
