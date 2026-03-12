import { MessageSquare, Phone, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';

export function ProjectHelpPage() {
  const navigate = useNavigate();

  return (
    <ContentContainer width="narrow">
    <div className="p-[24px] max-[768px]:p-[16px]">
      <h1 className="text-[1.2rem] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[8px]">
        Hilfe & Support
      </h1>
      <p className="text-[13px] text-[var(--text-secondary)] mb-[28px]">
        Haben Sie Fragen zu Ihrem Projekt? Unser Team hilft Ihnen gerne weiter.
      </p>

      <div className="flex flex-col gap-[12px]">
        <ContactCard
          icon={<MessageSquare size={18} />}
          title="Nachricht senden"
          sub="Direkter Chat mit dem Projektteam"
          accent="#7C3AED"
          bg="#F5F3FF"
          onClick={() => navigate('/nachrichten')}
        />
        <ContactCard
          icon={<Mail size={18} />}
          title="E-Mail schreiben"
          sub="projekt@kamanin.at"
          accent="#2563EB"
          bg="#EFF6FF"
          onClick={() => window.location.href = 'mailto:projekt@kamanin.at'}
        />
        <ContactCard
          icon={<Phone size={18} />}
          title="Anrufen"
          sub="Mo – Fr, 9:00 – 17:00 Uhr"
          accent="#D97706"
          bg="#FFFBEB"
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
  accent: string;
  bg: string;
  onClick: () => void;
}

function ContactCard({ icon, title, sub, accent, bg, onClick }: ContactCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-[14px] px-[16px] py-[14px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] cursor-pointer text-left transition-all hover:-translate-y-px hover:shadow-[var(--shadow-md)] active:translate-y-0"
    >
      <div
        className="w-[40px] h-[40px] rounded-[10px] flex items-center justify-center flex-shrink-0"
        style={{ background: bg, color: accent }}
      >
        {icon}
      </div>
      <div>
        <div className="text-[13.5px] font-semibold text-[var(--text-primary)]">{title}</div>
        <div className="text-[12px] text-[var(--text-tertiary)] mt-[2px]">{sub}</div>
      </div>
    </button>
  );
}
