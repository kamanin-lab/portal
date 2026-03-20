import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCreateTask, CreateTaskInput } from '@/hooks/useCreateTask';
import { Upload, X, FileText, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

const priorities = [
  { value: '1', label: 'Dringend', color: 'text-destructive' },
  { value: '2', label: 'Hoch', color: 'text-orange-500' },
  { value: '3', label: 'Normal', color: 'text-foreground' },
  { value: '4', label: 'Niedrig', color: 'text-muted-foreground' },
] as const;

export default function CreateTaskDialog({ open, onOpenChange }: CreateTaskDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'1' | '2' | '3' | '4'>('3');
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: createTask, isPending } = useCreateTask();

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setPriority('3');
    setFiles([]);
    setFileError(null);
  }, []);

  const handleClose = useCallback((open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  }, [onOpenChange, resetForm]);

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `${file.name} ist zu groß. Maximale Größe: 20 MB.`;
    }
    return null;
  };

  const handleFilesSelected = useCallback((selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles);
    setFileError(null);

    // Check total file count
    if (files.length + fileArray.length > MAX_FILES) {
      setFileError(`Maximal ${MAX_FILES} Dateien erlaubt.`);
      return;
    }

    // Validate each file
    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        setFileError(error);
        return;
      }
    }

    // Check for duplicates and add files
    const existingNames = new Set(files.map(f => f.name));
    const newFiles = fileArray.filter(f => !existingNames.has(f.name));
    
    setFiles(prev => [...prev, ...newFiles]);
  }, [files]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files) {
      handleFilesSelected(e.dataTransfer.files);
    }
  }, [handleFilesSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const removeFile = useCallback((fileName: string) => {
    setFiles(prev => prev.filter(f => f.name !== fileName));
    setFileError(null);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      return;
    }

    const taskData: CreateTaskInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      priority: parseInt(priority) as 1 | 2 | 3 | 4,
      files,
    };

    createTask(taskData, {
      onSuccess: () => {
        handleClose(false);
      },
    });
  }, [name, description, priority, files, createTask, handleClose]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Neue Aufgabe erstellen</DialogTitle>
            <DialogDescription>
              Füllen Sie die Details aus, um eine neue Aufgabe einzureichen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Task Name */}
            <div className="space-y-2">
              <Label htmlFor="task-name">
                Aufgabenname <span className="text-destructive">*</span>
              </Label>
              <Input
                id="task-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                placeholder="Aufgabenname eingeben..."
                disabled={isPending}
                required
              />
              <p className="text-xs text-muted-foreground text-right">
                {name.length}/{MAX_NAME_LENGTH}
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="task-description">Beschreibung</Label>
              <Textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                placeholder="Beschreibung eingeben (optional)..."
                className="min-h-[100px] resize-none"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground text-right">
                {description.length}/{MAX_DESCRIPTION_LENGTH}
              </p>
            </div>

            {/* Priority */}
            <div className="space-y-3">
              <Label>Priorität</Label>
              <RadioGroup
                value={priority}
                onValueChange={(value) => setPriority(value as '1' | '2' | '3' | '4')}
                className="flex flex-wrap gap-4"
                disabled={isPending}
              >
                {priorities.map((p) => (
                  <div key={p.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={p.value} id={`priority-${p.value}`} />
                    <Label
                      htmlFor={`priority-${p.value}`}
                      className={cn("cursor-pointer font-normal", p.color)}
                    >
                      {p.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* File Upload */}
            <div className="space-y-3">
              <Label>Anhänge</Label>
              
              {/* Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  isDragOver 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50",
                  isPending && "opacity-50 cursor-not-allowed"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
                  className="hidden"
                  disabled={isPending || files.length >= MAX_FILES}
                />
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {files.length >= MAX_FILES 
                    ? "Maximale Anzahl erreicht" 
                    : "Dateien hierher ziehen oder klicken zum Auswählen"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Max. {MAX_FILES} Dateien, je 20 MB
                </p>
              </div>

              {/* File Error */}
              {fileError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {fileError}
                </div>
              )}

              {/* File List */}
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((file) => (
                    <div
                      key={file.name}
                      className="flex items-center justify-between p-2 rounded-md bg-muted"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="text-sm truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          ({formatFileSize(file.size)})
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(file.name)}
                        disabled={isPending}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isPending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird erstellt...
                </>
              ) : (
                'Aufgabe erstellen'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
