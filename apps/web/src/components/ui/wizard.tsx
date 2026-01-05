import React, { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button } from './button';

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  component: ReactNode;
  isValid?: boolean;
  isOptional?: boolean;
}

interface WizardProps {
  steps: WizardStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onSave?: () => void;
  onFinish?: () => void;
  isLoading?: boolean;
  canSaveDraft?: boolean;
}

export const Wizard: React.FC<WizardProps> = ({
  steps,
  currentStep,
  onStepChange,
  onSave,
  onFinish,
  isLoading = false,
  canSaveDraft = true,
}) => {
  const currentStepData = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  const canGoNext = currentStepData?.isValid !== false;
  const canGoPrevious = !isFirstStep;

  const handleNext = () => {
    if (canGoNext && !isLastStep) {
      onStepChange(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (canGoPrevious) {
      onStepChange(currentStep - 1);
    }
  };

  const handleStepClick = (stepIndex: number) => {
    // Allow clicking on completed steps or the next step if current is valid
    const isCompleted = stepIndex < currentStep;
    const isNextStep = stepIndex === currentStep + 1 && canGoNext;
    
    if (isCompleted || isNextStep || stepIndex === currentStep) {
      onStepChange(stepIndex);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center flex-1">
                <button
                  type="button"
                  onClick={() => handleStepClick(index)}
                  disabled={!canGoNext && index > currentStep && index !== currentStep + 1}
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm
                    transition-all duration-200
                    ${
                      index < currentStep
                        ? 'bg-green-500 text-white'
                        : index === currentStep
                        ? 'bg-blue-600 text-white ring-4 ring-blue-200'
                        : step.isOptional
                        ? 'bg-gray-100 text-gray-400 border-2 border-dashed border-gray-300'
                        : 'bg-gray-200 text-gray-600'
                    }
                    ${
                      index <= currentStep || (index === currentStep + 1 && canGoNext)
                        ? 'cursor-pointer hover:scale-110'
                        : 'cursor-not-allowed opacity-50'
                    }
                  `}
                >
                  {index < currentStep ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    index + 1
                  )}
                </button>
                <div className="mt-2 text-center">
                  <div
                    className={`text-xs font-medium ${
                      index <= currentStep ? 'text-gray-900' : 'text-gray-500'
                    }`}
                  >
                    {step.title}
                    {step.isOptional && (
                      <span className="ml-1 text-[10px] text-gray-400 font-normal">(optionnel)</span>
                    )}
                  </div>
                  {step.description && (
                    <div className="text-xs text-gray-500 mt-1 hidden md:block">{step.description}</div>
                  )}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 ${
                    index < currentStep ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6 min-h-[500px]">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {currentStepData?.title}
          </h2>
          {currentStepData?.description && (
            <p className="text-gray-600 mt-2">{currentStepData.description}</p>
          )}
        </div>
        <div>{currentStepData?.component}</div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between bg-white rounded-lg shadow p-4">
        <div className="flex gap-2">
          {canSaveDraft && onSave && (
            <Button
              type="button"
              variant="outline"
              onClick={onSave}
              disabled={isLoading}
            >
              Enregistrer en brouillon
            </Button>
          )}
          {canGoPrevious && (
            <Button
              type="button"
              variant="outline"
              onClick={handlePrevious}
              disabled={isLoading}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Précédent
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {!isLastStep ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext || isLoading}
            >
              Suivant
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onFinish}
              disabled={!canGoNext || isLoading}
            >
              {isLoading ? 'Enregistrement...' : 'Terminer'}
            </Button>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <div className="text-center text-sm text-gray-500 mt-4">
        Étape {currentStep + 1} sur {steps.length}
      </div>
    </div>
  );
};





