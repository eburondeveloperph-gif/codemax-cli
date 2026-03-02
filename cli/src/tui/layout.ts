/**
 * Eburon Copilot CLI — TUI Layout (split-pane)
 * Blessed-based terminal UI with split panes.
 */
import blessed from "blessed";
import { T } from "../core/theme.js";
import { CONFIG } from "../core/config.js";

export interface TUILayout {
  screen: blessed.Widgets.Screen;
  chatBox: blessed.Widgets.BoxElement;
  codeBox: blessed.Widgets.BoxElement;
  fileTree: blessed.Widgets.ListElement;
  statusBar: blessed.Widgets.BoxElement;
  inputBar: blessed.Widgets.TextareaElement;
  headerBar: blessed.Widgets.BoxElement;
}

export function createLayout(): TUILayout {
  const screen = blessed.screen({
    smartCSR: true,
    title: "Eburon Copilot — TUI",
    fullUnicode: true,
    dockBorders: true,
    autoPadding: true,
  });

  // Header bar
  const headerBar = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    content: `  ⚡ {bold}EBURON COPILOT{/bold}  ·  ${CONFIG.model}  ·  {cyan-fg}TUI Mode{/cyan-fg}  ·  Press {bold}?{/bold} for help`,
    tags: true,
    style: {
      fg: "white",
      bg: "#1a1a2e",
    },
  });

  // File tree (left panel)
  const fileTree = blessed.list({
    parent: screen,
    label: " {bold}Files{/bold} ",
    top: 1,
    left: 0,
    width: "20%",
    height: "100%-4",
    tags: true,
    border: { type: "line" },
    scrollbar: {
      ch: "│",
      track: { bg: "black" },
      style: { bg: "cyan" },
    },
    style: {
      fg: "white",
      bg: "#0d1117",
      border: { fg: "#7C3AED" },
      selected: { bg: "#7C3AED", fg: "white", bold: true },
      item: { fg: "#9CA3AF" },
    } as any,
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
  }) as blessed.Widgets.ListElement;

  // Chat box (center panel)
  const chatBox = blessed.box({
    parent: screen,
    label: " {bold}Chat{/bold} ",
    top: 1,
    left: "20%",
    width: "50%",
    height: "100%-4",
    tags: true,
    border: { type: "line" },
    scrollbar: {
      ch: "│",
      track: { bg: "black" },
      style: { bg: "cyan" },
    },
    style: {
      fg: "white",
      bg: "#0d1117",
      border: { fg: "#7C3AED" },
      label: { fg: "#7C3AED" },
    },
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
  });

  // Code viewer (right panel)
  const codeBox = blessed.box({
    parent: screen,
    label: " {bold}Code{/bold} ",
    top: 1,
    left: "70%",
    width: "30%",
    height: "100%-4",
    tags: true,
    border: { type: "line" },
    scrollbar: {
      ch: "│",
      track: { bg: "black" },
      style: { bg: "cyan" },
    },
    style: {
      fg: "white",
      bg: "#0d1117",
      border: { fg: "#06B6D4" },
      label: { fg: "#06B6D4" },
    },
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
  });

  // Input bar (bottom)
  const inputBar = blessed.textarea({
    parent: screen,
    label: " {bold}❯ Prompt{/bold} ",
    bottom: 1,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "#161b22",
      border: { fg: "#7C3AED" },
      label: { fg: "#7C3AED" },
    },
    inputOnFocus: true,
    mouse: true,
    keys: true,
  });

  // Status bar (very bottom)
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    content: "  {cyan-fg}Tab{/cyan-fg} Switch pane  {cyan-fg}Enter{/cyan-fg} Send  {cyan-fg}Esc{/cyan-fg} Focus input  {cyan-fg}q{/cyan-fg} Quit  {cyan-fg}?{/cyan-fg} Help",
    tags: true,
    style: {
      fg: "#9CA3AF",
      bg: "#1a1a2e",
    },
  });

  return { screen, chatBox, codeBox, fileTree, statusBar, inputBar, headerBar };
}
