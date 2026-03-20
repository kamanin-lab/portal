import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import helpContent from '@/assets/kamanin-client-portal-kundenhandbuch.md?raw';

const Help = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="container py-6 flex-1 max-w-3xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/dashboard')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück
        </Button>

        <div className="prose prose-sm sm:prose dark:prose-invert max-w-none
          prose-headings:text-foreground prose-p:text-foreground/90
          prose-strong:text-foreground prose-a:text-primary
          prose-table:text-foreground prose-th:text-foreground prose-td:text-foreground/90
          prose-th:border-border prose-td:border-border prose-thead:border-border
          prose-tr:border-border
          prose-li:text-foreground/90 prose-hr:border-border">
          <ReactMarkdown>{helpContent}</ReactMarkdown>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Help;
