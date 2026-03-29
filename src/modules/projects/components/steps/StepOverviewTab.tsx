import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import type { Step } from '../../types/project';
import { StepActionBar } from './StepActionBar';

interface StepOverviewTabProps {
  step: Step;
  projectId: string;
}

export function StepOverviewTab({ step, projectId }: StepOverviewTabProps) {
  const [expandedSections, setExpandedSections] = useState({
    whyItMatters: false,
    whatBecomesFixed: false,
  });

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* Action bar for awaiting_input */}
      {step.status === 'awaiting_input' && (
        <StepActionBar taskId={step.clickupTaskId} projectId={projectId} />
      )}

      {/* Description */}
      <ExpandableSection title="Was ist das?" body={step.description} defaultOpen toggleable={false} />

      {/* Why it matters */}
      <ExpandableSection
        title="Warum ist das wichtig?"
        body={step.whyItMatters}
        isOpen={expandedSections.whyItMatters}
        onToggle={() => toggleSection('whyItMatters')}
      />

      {/* What becomes fixed */}
      <ExpandableSection
        title="Was wird damit festgelegt?"
        body={step.whatBecomesFixed}
        isOpen={expandedSections.whatBecomesFixed}
        onToggle={() => toggleSection('whatBecomesFixed')}
      />
    </div>
  );
}

/* ── Expandable Section ────────────────────────────────────── */

interface ExpandableSectionProps {
  title: string;
  body: string;
  defaultOpen?: boolean;
  toggleable?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}

function ExpandableSection({ title, body, defaultOpen = false, toggleable = true, isOpen, onToggle }: ExpandableSectionProps) {
  if (!body || body.trim() === '') return null;

  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = toggleable ? (isOpen ?? localOpen) : true;
  const handleToggle = toggleable ? (onToggle ?? (() => setLocalOpen(v => !v))) : undefined;

  return (
    <div className="border border-border-light rounded-[var(--r-md)]">
      <button
        onClick={handleToggle}
        className={`w-full flex items-center justify-between px-3.5 py-3 text-body font-medium text-text-primary transition-colors rounded-[var(--r-md)] ${
          toggleable ? 'hover:bg-surface-hover cursor-pointer' : 'cursor-default'
        }`}
      >
        <span>{title}</span>
        {toggleable && (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={15}
            className={`text-text-tertiary transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
        )}
      </button>
      {open && (
        <div className="border-t border-border-light px-3.5 py-3 text-body text-text-secondary leading-[1.6]">
          {body}
        </div>
      )}
    </div>
  );
}
