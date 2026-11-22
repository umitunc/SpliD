import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TopBar } from './components/TopBar';
import { WizardStepper } from './components/WizardStepper';
import { Step1FileLoad } from './components/Step1FileLoad';
import { Step2Scale } from './components/Step2Scale';
import { Step3Printer } from './components/Step3Printer';
import { Step4Split } from './components/Step4Split';
import { Viewport3D } from './components/Viewport3D';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const { currentStep, rawMesh, nextStep, prevStep } = useAppStore();

  const canGoBack = currentStep > 1;
  const canGoNext = currentStep < 4 && Boolean(rawMesh);

  return (
    <div className="uxigl-text-primary flex h-screen w-screen flex-col overflow-hidden">
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Left uxiGL Liquid Glass Wizard Sidebar */}
        <aside className="uxigl-glass-regular flex w-[410px] shrink-0 flex-col border-r">
          <WizardStepper />

          <div className="flex-1 overflow-y-auto p-4">
            {currentStep === 1 && <Step1FileLoad />}
            {currentStep === 2 && <Step2Scale />}
            {currentStep === 3 && <Step3Printer />}
            {currentStep === 4 && <Step4Split />}
          </div>

          {/* Wizard Footer Navigation */}
          <div className="flex items-center justify-between border-t border-[var(--uxigl-border)] px-4 py-3">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={prevStep}
              className="uxigl-btn-outlined flex items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </button>

            <span className="uxigl-text-muted font-mono text-[11px]">
              Step {currentStep} / 4
            </span>

            {currentStep < 4 ? (
              <button
                type="button"
                disabled={!canGoNext}
                onClick={nextStep}
                className="uxigl-btn-filled flex items-center gap-1 rounded-xl px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-35"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <div className="w-[74px]" />
            )}
          </div>
        </aside>

        {/* Right 3D Viewport */}
        <Viewport3D />
      </div>
    </div>
  );
}
