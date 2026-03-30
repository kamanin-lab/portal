import type { Project } from '../../types/project';
import { FileBrowser } from '../files/FileBrowser';

interface FilesTabProps {
  project: Project;
}

export function FilesTab({ project }: FilesTabProps) {
  return <FileBrowser project={project} />;
}
