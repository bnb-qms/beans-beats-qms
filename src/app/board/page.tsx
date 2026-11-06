import type { Viewport } from "next";
import { ReadyBoard } from "./ready-board";

// The board is white on black, so the browser bar matches it.
export const viewport: Viewport = { themeColor: "#0a0a0a" };

// Module 4: Ready board (F9). Public screen on the booth display, no login.
export default function BoardPage() {
  return <ReadyBoard />;
}
