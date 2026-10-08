import { useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { visibleTreeNodes, type TreeNode } from './workspace';
import FileIcon from './FileIcon';
interface Props {
  nodes: TreeNode[]; expanded: Set<string>; selected: string; dirty: Set<string>;
  onToggle(path: string): void; onOpen(path: string, pinned: boolean): void; onSelectFolder(path: string): void;
}
export default function FileTree({ nodes, expanded, selected, dirty, onToggle, onOpen, onSelectFolder }: Props) {
  const [focused, setFocused] = useState('');
  const refs = useRef(new Map<string, HTMLDivElement>());
  const visible = visibleTreeNodes(nodes, expanded);
  const tabStop = visible.some(n => n.path === focused) ? focused : visible.some(n => n.path === selected) ? selected : visible[0]?.path;
  function focus(path?: string) { if (path) refs.current.get(path)?.focus(); }
  function handleKey(event: KeyboardEvent, node: TreeNode) {
    const index = visible.findIndex(n => n.path === node.path);
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); focus(visible[index + 1]?.path); break;
      case 'ArrowUp': event.preventDefault(); focus(visible[index - 1]?.path); break;
      case 'Home': event.preventDefault(); focus(visible[0]?.path); break;
      case 'End': event.preventDefault(); focus(visible.at(-1)?.path); break;
      case 'ArrowRight': event.preventDefault(); if (node.kind === 'folder') { if (!expanded.has(node.path)) onToggle(node.path); else focus(node.children[0]?.path); } break;
      case 'ArrowLeft': event.preventDefault(); if (node.kind === 'folder' && expanded.has(node.path)) onToggle(node.path); else focus(node.path.slice(0, node.path.lastIndexOf('/'))); break;
      case 'Enter': case ' ': event.preventDefault(); if (node.kind === 'folder') { onSelectFolder(node.path); onToggle(node.path); } else onOpen(node.path, true); break;
      default: if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) { const ordered = [...visible.slice(index + 1), ...visible.slice(0, index + 1)]; focus(ordered.find(n => n.name.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()))?.path); }
    }
  }
  function render(node: TreeNode, depth: number) {
    const isFolder = node.kind === 'folder'; const opened = expanded.has(node.path);
    return <div key={node.path} role="none"><div role="treeitem" aria-label={node.name} aria-level={depth + 1} aria-expanded={isFolder ? opened : undefined} aria-selected={node.path === selected} tabIndex={node.path === tabStop ? 0 : -1} className={'tree-row ' + (node.path === selected ? 'selected' : '')} style={{ paddingLeft: 10 + depth * 14 }} title={node.path} ref={element => { if (element) refs.current.set(node.path, element); else refs.current.delete(node.path); }} onFocus={() => setFocused(node.path)} onKeyDown={e => handleKey(e, node)} onClick={() => { if (isFolder) { onSelectFolder(node.path); onToggle(node.path); } else onOpen(node.path, false); }} onDoubleClick={() => { if (!isFolder) onOpen(node.path, true); }}>
      {isFolder ? <>{opened ? <ChevronDown size={14}/> : <ChevronRight size={14}/>} {opened ? <FolderOpen size={16} className="folder-icon"/> : <Folder size={16} className="folder-icon"/>}</> : <><span className="tree-chevron-spacer"/><FileIcon name={node.name}/></>}
      <span className="tree-name">{node.name}</span>{dirty.has(node.path) && <span className="dirty-indicator" aria-label="Modificado">●</span>}
    </div>{isFolder && opened && <div role="group" className="tree-children">{node.children.map(child => render(child, depth + 1))}</div>}</div>;
  }
  return <div className="workspace-tree" role="tree" aria-label="Arquivos do projeto">{nodes.map(node => render(node, 0))}</div>;
}
