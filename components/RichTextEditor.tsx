'use client';

import React, { useRef, useEffect, useState } from 'react';
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough,
  List, 
  CheckSquare, 
  Type, 
  Palette, 
  RotateCcw,
  ChevronDown
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

const COLORS = [
  { name: 'Dark Slate', value: '#1C1F23', bg: 'bg-[#1C1F23]' },
  { name: 'Grey', value: '#8E9299', bg: 'bg-[#8E9299]' },
  { name: 'Primary Blue', value: '#1061E3', bg: 'bg-[#1061E3]' },
  { name: 'Success Green', value: '#10B981', bg: 'bg-[#10B981]' },
  { name: 'Warning Orange', value: '#F59E0B', bg: 'bg-[#F59E0B]' },
  { name: 'Danger Red', value: '#D32F2F', bg: 'bg-[#D32F2F]' }
];

const SIZES = [
  { name: 'Large Header', tag: 'h2', style: 'font-bold text-lg' },
  { name: 'Medium Header', tag: 'h3', style: 'font-bold text-base' },
  { name: 'Normal Paragraph', tag: 'p', style: 'text-sm' },
  { name: 'Small Text', tag: 'div', style: 'text-xs text-[#8E9299]', isSmall: true }
];

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Add a detailed description...',
  className = '',
  minHeight = '180px'
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const localChangeRef = useRef(false);
  const [showColors, setShowColors] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#1C1F23');
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    bullet: false,
    checklist: false
  });

  // Custom Undo/Redo history stack
  const historyRef = useRef<string[]>([value || '']);
  const historyIndexRef = useRef<number>(0);
  const lastPushedValueRef = useRef<string>(value || '');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushHistory = (html: string) => {
    if (html === historyRef.current[historyIndexRef.current]) return;
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(html);
    if (nextHistory.length > 100) {
      nextHistory.shift();
    }
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    lastPushedValueRef.current = html;
  };

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prevHTML = historyRef.current[historyIndexRef.current];
      if (editorRef.current) {
        editorRef.current.innerHTML = prevHTML;
        editorRef.current.focus();
      }
      lastPushedValueRef.current = prevHTML;
      localChangeRef.current = true;
      onChange(prevHTML);
      updateActiveFormats();
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const nextHTML = historyRef.current[historyIndexRef.current];
      if (editorRef.current) {
        editorRef.current.innerHTML = nextHTML;
        editorRef.current.focus();
      }
      lastPushedValueRef.current = nextHTML;
      localChangeRef.current = true;
      onChange(nextHTML);
      updateActiveFormats();
    }
  };

  // Sync editor content with external state changes (only if different)
  useEffect(() => {
    if (editorRef.current) {
      if (localChangeRef.current) {
        localChangeRef.current = false;
        lastPushedValueRef.current = value || '';
        return;
      }

      const currentHTML = editorRef.current.innerHTML;
      // If value is empty, initialize with paragraph to help browser format nicely
      const targetHTML = value || '';
      if (currentHTML !== targetHTML) {
        editorRef.current.innerHTML = targetHTML;
      }
      // Reset history stack if the external value changes to a new value (e.g. user selected different tab/item)
      if (value !== lastPushedValueRef.current) {
        historyRef.current = [targetHTML];
        historyIndexRef.current = 0;
        lastPushedValueRef.current = targetHTML;
      }
    }
  }, [value]);

  // Click outside to close menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowColors(false);
        setShowSizes(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const sanitizedHtml = (html === '<p><br></p>' || html === '<p></p>' || html === '<br>') ? '' : html;
      
      localChangeRef.current = true;
      onChange(sanitizedHtml);
      updateActiveFormats();

      // Debounce saving history while typing
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        pushHistory(sanitizedHtml);
      }, 500);
    }
  };

  const executeCommand = (command: string, arg: string = '') => {
    if (editorRef.current) {
      editorRef.current.focus();
    }
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, arg);
    
    // If we converted a checklist to a normal bullet list, strip the rich-checklist class
    if (command === 'insertUnorderedList') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let node: Node | null = range.startContainer;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'UL') {
            const ul = node as HTMLElement;
            ul.classList.remove('rich-checklist');
            break;
          }
          node = node.parentNode;
        }
      }
    }
    
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const sanitizedHtml = (html === '<p><br></p>' || html === '<p></p>' || html === '<br>') ? '' : html;
      localChangeRef.current = true;
      onChange(sanitizedHtml);
      pushHistory(sanitizedHtml);
      updateActiveFormats();
    }
  };

  const handleFormatBlock = (sizeOpt: typeof SIZES[0]) => {
    if (sizeOpt.isSmall) {
      // Small is custom: wrap selection in span with custom class or size
      executeCommand('fontSize', '2'); // size 2 is browser-standard small
    } else {
      executeCommand('formatBlock', sizeOpt.tag);
    }
    setShowSizes(false);
  };

  const handleColorChange = (color: string) => {
    executeCommand('foreColor', color);
    setShowColors(false);
  };

  const insertCheckbox = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    // 1. Find all UL elements that intersect with the selection
    const allUls = Array.from(editorRef.current.querySelectorAll('ul'));
    const selectedUls = allUls.filter(ul => selection.containsNode(ul, true));
    
    // Also check parent UL of selection start/end (for collapsed or narrow selections)
    let startNode: Node | null = range.startContainer;
    while (startNode && startNode !== editorRef.current) {
      if (startNode.nodeType === Node.ELEMENT_NODE && (startNode as HTMLElement).tagName === 'UL') {
        const ul = startNode as HTMLUListElement;
        if (!selectedUls.includes(ul)) {
          selectedUls.push(ul);
        }
        break;
      }
      startNode = startNode.parentNode;
    }

    localChangeRef.current = true;
    document.execCommand('styleWithCSS', false, 'true');

    // 2. Determine action: if we are inside checklist(s), toggle them off
    const insideChecklist = selectedUls.length > 0 && selectedUls.every(ul => ul.classList.contains('rich-checklist'));

    if (insideChecklist) {
      // Toggle OFF: convert checklists back to normal blocks natively
      document.execCommand('insertUnorderedList', false);
    } else if (selectedUls.length > 0) {
      // Convert existing standard bullet lists to checklists
      selectedUls.forEach(ul => {
        ul.classList.add('rich-checklist');
      });
    } else {
      // Not in a list: create standard bullet list first
      document.execCommand('insertUnorderedList', false);
      
      // Find the newly created UL and add class
      const newSelection = window.getSelection();
      if (newSelection && newSelection.rangeCount > 0) {
        const newRange = newSelection.getRangeAt(0);
        let newNode: Node | null = newRange.startContainer;
        while (newNode && newNode !== editorRef.current) {
          if (newNode.nodeType === Node.ELEMENT_NODE && (newNode as HTMLElement).tagName === 'UL') {
            const ul = newNode as HTMLElement;
            ul.classList.add('rich-checklist');
            break;
          }
          newNode = newNode.parentNode;
        }
      }
    }

    // Save history and update state immediately
    const html = editorRef.current.innerHTML;
    const sanitizedHtml = (html === '<p><br></p>' || html === '<p></p>' || html === '<br>') ? '' : html;
    onChange(sanitizedHtml);
    pushHistory(sanitizedHtml);
    updateActiveFormats();
  };

  // Intercept click inside contenteditable to allow clicking checkboxes in edit mode
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // Support legacy inline checkboxes
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
      const checkbox = target as HTMLInputElement;
      if (checkbox.checked) {
        checkbox.setAttribute('checked', 'checked');
      } else {
        checkbox.removeAttribute('checked');
      }
      localChangeRef.current = true;
      handleInput();
      return;
    }

    // Support clicking checkboxes in the new custom list-style checklist format
    const li = target.closest('ul.rich-checklist li');
    if (li && editorRef.current) {
      const rect = li.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      
      // The checkbox area is on the left margin (relativeX is negative or very small)
      if (relativeX < 15) {
        e.preventDefault();
        if (li.classList.contains('checked')) {
          li.classList.remove('checked');
          li.removeAttribute('data-checked');
        } else {
          li.classList.add('checked');
          li.setAttribute('data-checked', 'true');
        }
        
        localChangeRef.current = true;
        
        // Save history and trigger state update
        const html = editorRef.current.innerHTML;
        const sanitizedHtml = (html === '<p><br></p>' || html === '<p></p>' || html === '<br>') ? '' : html;
        onChange(sanitizedHtml);
        pushHistory(sanitizedHtml);
        updateActiveFormats();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Intercept Undo (Ctrl+Z) and Redo (Ctrl+Y or Ctrl+Shift+Z)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
    } else if (e.key === ' ' || e.key === 'Enter') {
      // Save history boundary on word or line split
      if (editorRef.current) {
        pushHistory(editorRef.current.innerHTML);
      }
    }
  };

  const updateActiveFormats = () => {
    let isChecklist = false;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && editorRef.current) {
      const range = selection.getRangeAt(0);
      let node: Node | null = range.startContainer;
      while (node && node !== editorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'UL') {
          if ((node as HTMLElement).classList.contains('rich-checklist')) {
            isChecklist = true;
          }
          break;
        }
        node = node.parentNode;
      }
    }

    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikethrough: document.queryCommandState('strikeThrough'),
      bullet: document.queryCommandState('insertUnorderedList') && !isChecklist,
      checklist: isChecklist
    });
  };

  return (
    <div 
      ref={containerRef} 
      className={`flex flex-col border border-[#E2E4E9] rounded-xl overflow-hidden bg-white shadow-xs focus-within:ring-2 focus-within:ring-[#1061E3] focus-within:border-transparent transition-all ${className}`}
    >
      {/* Editor Toolbar */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#E2E4E9] bg-[#F9FAFB] px-3 py-2 gap-1.5 select-none shrink-0">
        <div className="flex flex-wrap items-center gap-1">
          {/* Typography Sizes Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowSizes(!showSizes); setShowColors(false); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#4A4D53] hover:bg-gray-100 hover:text-[#1C1F23] transition-colors"
              title="Font Size"
            >
              <Type className="w-3.5 h-3.5" />
              <span>Format</span>
              <ChevronDown className="w-3 h-3 text-[#8E9299]" />
            </button>
            {showSizes && (
              <div className="absolute left-0 mt-1 z-30 w-44 bg-white border border-[#E2E4E9] rounded-lg shadow-lg overflow-hidden py-1">
                {SIZES.map(opt => (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => handleFormatBlock(opt)}
                    className="w-full text-left px-3 py-2 text-xs text-[#4A4D53] hover:bg-gray-50 hover:text-[#1C1F23] transition-colors flex items-center justify-between"
                  >
                    <span className={opt.style}>{opt.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-[#E2E4E9] mx-1" />

          {/* Bold, Italic, Underline, Strikethrough */}
          <button
            type="button"
            onClick={() => executeCommand('bold')}
            className={`p-1.5 rounded-lg transition-colors ${activeFormats.bold ? 'bg-[#1061E3]/10 text-[#1061E3]' : 'text-[#4A4D53] hover:bg-gray-100'}`}
            title="Bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('italic')}
            className={`p-1.5 rounded-lg transition-colors ${activeFormats.italic ? 'bg-[#1061E3]/10 text-[#1061E3]' : 'text-[#4A4D53] hover:bg-gray-100'}`}
            title="Italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('underline')}
            className={`p-1.5 rounded-lg transition-colors ${activeFormats.underline ? 'bg-[#1061E3]/10 text-[#1061E3]' : 'text-[#4A4D53] hover:bg-gray-100'}`}
            title="Underline"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('strikeThrough')}
            className={`p-1.5 rounded-lg transition-colors ${activeFormats.strikethrough ? 'bg-[#1061E3]/10 text-[#1061E3]' : 'text-[#4A4D53] hover:bg-gray-100'}`}
            title="Strikethrough"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-[#E2E4E9] mx-1" />

          {/* Color Picker Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowColors(!showColors); setShowSizes(false); }}
              className="flex items-center gap-1.5 p-1.5 rounded-lg text-[#4A4D53] hover:bg-gray-100 transition-colors"
              title="Text Color"
            >
              <Palette className="w-3.5 h-3.5" />
              <div className="w-2.5 h-2.5 rounded-full border border-gray-200" style={{ backgroundColor: selectedColor }} />
            </button>
            {showColors && (
              <div className="absolute left-0 mt-1 z-30 w-36 bg-white border border-[#E2E4E9] rounded-lg shadow-lg overflow-hidden py-1 p-2 grid grid-cols-3 gap-1">
                {COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => { handleColorChange(c.value); }}
                    className="w-8 h-8 rounded-md flex items-center justify-center hover:scale-105 border border-gray-100 transition-all cursor-pointer relative group"
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  >
                    {selectedColor === c.value && (
                      <span className="w-2 h-2 rounded-full bg-white shadow-sm" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-[#E2E4E9] mx-1" />

          {/* Bullet points & Checklist */}
          <button
            type="button"
            onClick={() => executeCommand('insertUnorderedList')}
            className={`p-1.5 rounded-lg transition-colors ${activeFormats.bullet ? 'bg-[#1061E3]/10 text-[#1061E3]' : 'text-[#4A4D53] hover:bg-gray-100'}`}
            title="Bullet List"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={insertCheckbox}
            className={`p-1.5 rounded-lg transition-colors ${activeFormats.checklist ? 'bg-[#1061E3]/10 text-[#1061E3]' : 'text-[#4A4D53] hover:bg-gray-100'}`}
            title="Checklist Item"
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Clear formatting button */}
        <button
          type="button"
          onClick={() => executeCommand('removeFormat')}
          className="p-1.5 rounded-lg text-[#8E9299] hover:text-[#D32F2F] hover:bg-red-50 transition-colors"
          title="Clear Formatting"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Editor Content editable */}
      <div 
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleEditorClick}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        data-placeholder={placeholder}
        style={{ minHeight }}
        className="rich-editor-content p-4 outline-none text-sm text-[#1C1F23] overflow-y-auto bg-white cursor-text select-text focus:outline-none flex-grow"
      />
    </div>
  );
}
