import React from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/themes/prism-tomorrow.css';

const highlight = (code: string) =>
  Prism.highlight(code, Prism.languages.markup, 'markup');

const editorStyle: React.CSSProperties = {
  fontFamily: '"Fira code", "Fira Mono", Consolas, monospace',
  fontSize: 13,
  minHeight: 200,
  border: '1px solid #d9d9d9',
  borderRadius: 6,
  background: '#1d1f21',
  color: '#ffffff'
};

export interface HtmlCodeEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: number;
  id?: string;
}

/**
 * Éditeur de code avec coloration syntaxique HTML.
 * Compatible Ant Design Form (value + onChange).
 */
export function HtmlCodeEditor({
  value = '',
  onChange,
  readOnly = false,
  placeholder = '',
  minHeight = 200,
  id
}: HtmlCodeEditorProps) {
  const style = { ...editorStyle, minHeight };

  if (readOnly) {
    return (
      <div
        id={id}
        style={{
          ...style,
          overflow: 'auto',
          padding: 12
        }}
      >
        <pre className="language-markup" style={{ margin: 0 }}>
          <code className="language-markup" dangerouslySetInnerHTML={{ __html: highlight(value || '') }} />
        </pre>
      </div>
    );
  }

  return (
    <div className="html-code-editor" style={{ color: '#ffffff' }}>
      <Editor
        id={id}
        value={value || ''}
        onValueChange={(code) => onChange?.(code)}
        highlight={highlight}
        placeholder={placeholder}
        readOnly={readOnly}
        style={style}
        padding={12}
        tabSize={2}
        insertSpaces
        ignoreTabKey={false}
      />
    </div>
  );
}
