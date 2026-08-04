export function resolvePictureInPictureRevisionAction(mode, revisionChanged) {
    if (!revisionChanged)
        return "none";
    return mode === "systemPip" ? "refresh" : "prepare";
}
//# sourceMappingURL=call-presentation-state.js.map