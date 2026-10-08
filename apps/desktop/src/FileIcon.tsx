import { FileCode2, FileJson, FileText } from 'lucide-react';
export default function FileIcon({ name }: { name: string }) {
  if (/\.tsx?$/.test(name)) return <span className="file-type-icon ts" aria-hidden="true">{name.endsWith('tsx') ? 'TSX' : 'TS'}</span>;
  if (/\.[cm]?jsx?$/.test(name)) return <span className="file-type-icon js" aria-hidden="true">JS</span>;
  if (/\.json$/.test(name)) return <FileJson size={16} className="file-icon json"/>;
  if (/\.(md|txt)$/.test(name)) return <FileText size={16} className="file-icon text"/>;
  return <FileCode2 size={16} className="file-icon"/>;
}
