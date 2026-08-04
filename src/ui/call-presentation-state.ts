import type { CallPresentationMode } from "./call-presentation.types";

export type PictureInPictureRevisionAction = "none" | "prepare" | "refresh";

export function resolvePictureInPictureRevisionAction(
  mode: CallPresentationMode,
  revisionChanged: boolean,
): PictureInPictureRevisionAction {
  if (!revisionChanged) return "none";
  return mode === "systemPip" ? "refresh" : "prepare";
}
