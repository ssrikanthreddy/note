import React, { useEffect, useCallback, useMemo } from "react";
import {
  createEditor,
  Editor,
  Element as SlateElement,
  Node as SlateNode,
  Point,
  Range,
  Transforms,
} from "slate";
import { withHistory } from "slate-history";
import { Editable, ReactEditor, Slate, withReact } from "slate-react";

import { saveNote, loadNote } from "./utils/Indexeddb";

// Define markdown-like shortcuts
const SHORTCUTS = {
  "*": "list-item",
  "-": "list-item",
  "+": "list-item",
  ">": "block-quote",
  "#": "heading-one",
  "##": "heading-two",
  "###": "heading-three",
  "####": "heading-four",
  "#####": "heading-five",
  "######": "heading-six",
};

const MainEditor = () => {
  // Render custom elements based on their type
  const renderElement = useCallback((props) => <Element {...props} />, []);

  // Initialize the editor with plugins
  const editor = useMemo(
    () => withShortcuts(withReact(withHistory(createEditor()))),
    []
  );

  // Handle input before it is processed by the browser
  const handleDOMBeforeInput = useCallback(
    (e) => {
      queueMicrotask(() => {
        const pendingDiffs = ReactEditor.androidPendingDiffs(editor);
        const scheduleFlush = pendingDiffs?.some(({ diff, path }) => {
          if (!diff.text.endsWith(" ")) {
            return false;
          }
          const { text } = SlateNode.leaf(editor, path);
          const beforeText = text.slice(0, diff.start) + diff.text.slice(0, -1);
          if (!(beforeText in SHORTCUTS)) {
            return;
          }
          const blockEntry = Editor.above(editor, {
            at: path,
            match: (n) =>
              SlateElement.isElement(n) && Editor.isBlock(editor, n),
          });
          if (!blockEntry) {
            return false;
          }
          const [, blockPath] = blockEntry;
          return Editor.isStart(editor, Editor.start(editor, path), blockPath);
        });
        if (scheduleFlush) {
          ReactEditor.androidScheduleFlush(editor);
        }
      });
    },
    [editor]
  );

  const handleSave = async () => {
    try {
      const content = editor.children; // Get the editor's content
      await saveNote("note-1", content); // Save content with a unique ID
    } catch (error) {
      console.error("Failed to save note:", error);
    }
  };

  const handleLoad = async () => {
    try {
      const content = await loadNote("note-1"); // Load note by ID

      if (content) {
        // Remove all existing nodes from the editor
        while (editor.children.length > 0) {
          Transforms.removeNodes(editor, { at: [0] });
        }
        // Insert the new content at the start of the editor
        Transforms.insertNodes(editor, content, { at: [0] });
      } else {
        alert("No saved note found.");
      }
    } catch (error) {
      console.error("Failed to load note:", error);
    }
  };

  // Auto-load the note on page load
  useEffect(() => {
    handleLoad();
  }, [editor]);

  return (
    <div>
      <Slate
        editor={editor}
        initialValue={initialValue}
        onChange={(value) => {
          // Detect if there's an AST (document structure) change
          const isAstChange = editor.operations.some(
            (op) => op.type !== "set_selection"
          );

          if (isAstChange) {
            // Call handleSave to save the updated content
            handleSave(value);
          }
        }}
      >
        <Editable
          onDOMBeforeInput={handleDOMBeforeInput}
          renderElement={renderElement}
          placeholder="Write some markdown..."
          spellCheck
          autoFocus
        />
      </Slate>
      {/* <div style={{ marginTop: "10px" }}>
        <button onClick={handleSave} style={{ marginRight: "5px" }}>
          Save Note
        </button>
        <button onClick={handleLoad}>Load Note</button>
      </div> */}
    </div>
  );
};

// Plugin to handle markdown-like shortcuts
const withShortcuts = (editor) => {
  const { deleteBackward, insertText } = editor;

  // Override insertText to handle shortcuts
  editor.insertText = (text) => {
    const { selection } = editor;
    if (text.endsWith(" ") && selection && Range.isCollapsed(selection)) {
      const { anchor } = selection;
      const block = Editor.above(editor, {
        match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
      });
      const path = block ? block[1] : [];
      const start = Editor.start(editor, path);
      const range = { anchor, focus: start };
      const beforeText = Editor.string(editor, range) + text.slice(0, -1);
      const type = SHORTCUTS[beforeText];
      if (type) {
        Transforms.select(editor, range);
        if (!Range.isCollapsed(range)) {
          Transforms.delete(editor);
        }
        const newProperties = {
          type,
        };
        Transforms.setNodes(editor, newProperties, {
          match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
        });
        if (type === "list-item") {
          const list = {
            type: "bulleted-list",
            children: [],
          };
          Transforms.wrapNodes(editor, list, {
            match: (n) =>
              !Editor.isEditor(n) &&
              SlateElement.isElement(n) &&
              n.type === "list-item",
          });
        }
        return;
      }
    }
    insertText(text);
  };

  // Override deleteBackward to handle block type reset
  editor.deleteBackward = (...args) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const match = Editor.above(editor, {
        match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
      });
      if (match) {
        const [block, path] = match;
        const start = Editor.start(editor, path);
        if (
          !Editor.isEditor(block) &&
          SlateElement.isElement(block) &&
          block.type !== "paragraph" &&
          Point.equals(selection.anchor, start)
        ) {
          const newProperties = {
            type: "paragraph",
          };
          Transforms.setNodes(editor, newProperties);
          if (block.type === "list-item") {
            Transforms.unwrapNodes(editor, {
              match: (n) =>
                !Editor.isEditor(n) &&
                SlateElement.isElement(n) &&
                n.type === "bulleted-list",
              split: true,
            });
          }
          return;
        }
      }
      deleteBackward(...args);
    }
  };

  return editor;
};

// Define how different elements should be rendered
const Element = ({ attributes, children, element }) => {
  switch (element.type) {
    case "block-quote":
      return <blockquote {...attributes}>{children}</blockquote>;
    case "bulleted-list":
      return <ul {...attributes}>{children}</ul>;
    case "heading-one":
      return <h1 {...attributes}>{children}</h1>;
    case "heading-two":
      return <h2 {...attributes}>{children}</h2>;
    case "heading-three":
      return <h3 {...attributes}>{children}</h3>;
    case "heading-four":
      return <h4 {...attributes}>{children}</h4>;
    case "heading-five":
      return <h5 {...attributes}>{children}</h5>;
    case "heading-six":
      return <h6 {...attributes}>{children}</h6>;
    case "list-item":
      return <li {...attributes}>{children}</li>;
    default:
      return <p {...attributes}>{children}</p>;
  }
};

// Initial value for the editor
const initialValue = [
  {
    type: "paragraph",
    children: [
      {
        text: "Flonote #2349",
      },
    ],
  },
];

export default MainEditor;
