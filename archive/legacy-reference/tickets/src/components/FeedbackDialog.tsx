import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Paperclip, X } from 'lucide-react';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'application/pdf', 'text/plain'];
const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_MAX = 3;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data-url prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FeedbackDialog = ({ open, onOpenChange }: FeedbackDialogProps) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submissionTimestamps = useRef<number[]>([]);

  const resetForm = useCallback(() => {
    setSubject('');
    setMessage('');
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const invalid = selected.filter(f => !ALLOWED_TYPES.includes(f.type));
    if (invalid.length) {
      toast({ title: 'Ungültiger Dateityp', description: 'Erlaubt sind PNG, JPG, PDF und TXT.', variant: 'destructive' });
      return;
    }
    const combined = [...files, ...selected].slice(0, MAX_FILES);
    const totalSize = combined.reduce((s, f) => s + f.size, 0);
    if (totalSize > MAX_TOTAL_BYTES) {
      toast({ title: 'Dateien zu groß', description: 'Maximal 10 MB insgesamt erlaubt.', variant: 'destructive' });
      return;
    }
    setFiles(combined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({ title: 'Pflichtfelder ausfüllen', description: 'Betreff und Nachricht sind erforderlich.', variant: 'destructive' });
      return;
    }

    // Rate limiting
    const now = Date.now();
    submissionTimestamps.current = submissionTimestamps.current.filter(t => now - t < RATE_WINDOW_MS);
    if (submissionTimestamps.current.length >= RATE_MAX) {
      toast({ title: 'Zu viele Anfragen', description: 'Bitte warten Sie einige Minuten, bevor Sie weiteres Feedback senden.', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      const attachments = await Promise.all(
        files.map(async (f) => ({
          filename: f.name,
          contentType: f.type,
          base64: await fileToBase64(f),
        }))
      );

      const { data, error } = await supabase.functions.invoke('send-feedback', {
        body: {
          subject: subject.trim().slice(0, 200),
          message: message.trim().slice(0, 2000),
          pageUrl: window.location.href,
          userEmail: user?.email || '',
          profileId: profile?.id || user?.id || '',
          userAgent: navigator.userAgent,
          attachments,
        },
      });

      if (error) throw error;
      if (data && !data.ok) throw new Error(data.message || 'Fehler beim Senden');

      submissionTimestamps.current.push(Date.now());
      toast({ title: 'Feedback gesendet', description: 'Vielen Dank für Ihr Feedback!' });
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Feedback error:', err);
      toast({ title: 'Fehler', description: 'Feedback konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Feedback senden</DialogTitle>
          <DialogDescription>
            Teilen Sie uns Ihre Anmerkungen oder Verbesserungsvorschläge mit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="feedback-subject">Betreff *</Label>
            <Input
              id="feedback-subject"
              placeholder="Kurze Beschreibung"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={200}
              disabled={sending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-message">Nachricht *</Label>
            <Textarea
              id="feedback-message"
              placeholder="Beschreiben Sie Ihr Anliegen..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={2000}
              rows={5}
              disabled={sending}
            />
          </div>

          <div className="space-y-2">
            <Label>Dateien anfügen (optional)</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || files.length >= MAX_FILES}
              >
                <Paperclip className="h-4 w-4 mr-1" />
                Datei wählen
              </Button>
              <span className="text-xs text-muted-foreground">
                Max. {MAX_FILES} Dateien, 10 MB gesamt (PNG, JPG, PDF, TXT)
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,.txt"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            {files.length > 0 && (
              <div className="space-y-1 mt-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="truncate max-w-[200px]">{f.name}</span>
                    <span className="text-xs">({(f.size / 1024).toFixed(0)} KB)</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-destructive hover:text-destructive/80"
                      disabled={sending}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={sending || !subject.trim() || !message.trim()}>
            {sending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Senden...</> : 'Absenden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackDialog;
