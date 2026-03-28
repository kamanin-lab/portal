import { HugeiconsIcon } from '@hugeicons/react';
import { Message01Icon, Call02Icon, Mail01Icon } from '@hugeicons/core-free-icons';
import { useNavigate } from 'react-router-dom';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { getPhaseColor } from '../../lib/phase-colors';

export function ProjectHelpPage() {
  const navigate = useNavigate();

  return (
    <ContentContainer width="narrow">
    <div className="p-6 max-[768px]:p-4">
      <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-2">
        Hilfe & Support
      </h1>
      <p className="text-body text-[var(--text-secondary)] mb-7">
        Haben Sie Fragen zu Ihrem Projekt? Unser Team hilft Ihnen gerne weiter.
      </p>

      <div className="flex flex-col gap-3">
        <ContactCard
          icon={<HugeiconsIcon icon={Message01Icon} size={18} />}
          title="Nachricht senden"
          sub="Direkter Chat mit dem Projektteam"
          phaseIndex={1}
          onClick={() => navigate('/nachrichten')}
        />
        <ContactCard
          icon={<HugeiconsIcon icon={Mail01Icon} size={18} />}
          title="E-Mail schreiben"
          sub="projekt@kamanin.at"
          phaseIndex={2}
          onClick={() => window.location.href = 'mailto:projekt@kamanin.at'}
        />
        <ContactCard
          icon={<HugeiconsIcon icon={Call02Icon} size={18} />}
          title="Anrufen"
          sub="Mo – Fr, 9:00 – 17:00 Uhr"
          phaseIndex={3}
          onClick={() => window.location.href = 'tel:+43662000000'}
        />
      </div>
    </div>
    </ContentContainer>
  );
}

interface ContactCardProps {
  icon: React.ReactNode;
  title: string;
  sub: string;
  phaseIndex: 1 | 2 | 3 | 4;
  onClick: () => void;
}

function ContactCard({ icon, title, sub, phaseIndex, onClick }: ContactCardProps) {
  const colors = getPhaseColor(phaseIndex);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3.5 px-4 py-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] cursor-pointer text-left transition-all hover:-translate-y-px hover:shadow-[var(--shadow-md)] active:translate-y-0"
    >
      <div
        className="w-[40px] h-[40px] rounded-[10px] flex items-center justify-center flex-shrink-0"
        style={{ background: colors.light, color: colors.main }}
      >
        {icon}
      </div>
      <div>
        <div className="text-body font-semibold text-[var(--text-primary)]">{title}</div>
        <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{sub}</div>
      </div>
    </button>
  );
}
